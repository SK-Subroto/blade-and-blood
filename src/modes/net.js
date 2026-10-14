// ---------- Wi-Fi play: two devices, peer to peer, connected by scanning QR codes ----------
//
// Connection (no server): the host makes a WebRTC offer and shows it as a QR code (a link to
// this page with the offer in it). The guest scans it, makes an answer and shows that as a
// QR code; the host scans it back. Codes can also be copied and pasted instead.
//
// Netcode: lockstep. Both devices run the same game, frame by frame, with the same inputs
// and the same random numbers, so the fight is identical on both. Each device sends its
// input for frame N + delay, and only runs frame N once both inputs for N are in. The host
// pings the guest while they pick fighters and chooses the delay from that: 3 frames (50 ms)
// on the same Wi-Fi, more over the internet. Every 30 frames the host sends a checksum; if
// the guest ever drifts (different browsers can round maths slightly differently) it asks
// for the host's state and both resume from it.
//
// Online play (online.js) uses the same match code: it only replaces the QR codes with a
// room in Firebase, and can carry the messages through Firebase when a direct connection fails.
//
// The learning AI is off here: both fighters are people.

const NET_ACTIONS = ['left', 'right', 'jump', 'block', 'light', 'heavy', 'special', 'super', 'dash', 'throw'];
const NET_DELAY = 3; // the smallest input delay, in frames
const NET_MAX_DELAY = 24; // 400 ms: enough for the Firebase relay on a slow route
const NET_VERSION = 2;
const NET_HASH_EVERY = 30;
const NET_SILENT_MS = 30000; // nothing from the other side for this long: they're gone
const NET_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

function b64url(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
	const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}
// connection offers and answers are compressed so the QR codes stay small enough to scan
async function packCode(obj) {
	const bytes = new TextEncoder().encode(JSON.stringify(obj));
	if (window.CompressionStream) {
		const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
	}
	return 'j' + b64url(bytes);
}
async function unpackCode(code) {
	code = code.trim();
	// a scanned link carries the code after #join=
	const m = code.match(/#join=([A-Za-z0-9_-]+)/);
	if (m) code = m[1];
	let bytes = unb64url(code.slice(1));
	if (code[0] === 'z') {
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	} else if (code[0] !== 'j') throw new Error('not a game code');
	return JSON.parse(new TextDecoder().decode(bytes));
}

// A data-channel offer only needs a few facts: the ICE login, the DTLS fingerprint and the
// network addresses. Sending just those (and rebuilding the SDP text on the other side)
// makes the QR code about a third of the size, so a phone can read it off a screen easily.
function compactSdp(sdp) {
	const get = (re) => (sdp.match(re) || [])[1];
	const fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/);
	const u = get(/a=ice-ufrag:(\S+)/);
	const p = get(/a=ice-pwd:(\S+)/);
	const setup = get(/a=setup:(\S+)/);
	const c = [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx)/gi)].slice(0, 6).map((m) => [m[1], +m[2], m[3][0]]);
	if (!fp || !u || !p || !setup || !c.length) return { sdp }; // unusual browser: send it whole
	const fb = new Uint8Array(fp.split(':').map((h) => parseInt(h, 16)));
	return { u, p, f: b64url(fb), s: setup, c };
}
function expandSdp(o) {
	if (o.sdp) return o.sdp;
	const fp = [...unb64url(o.f)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
	const cands = o.c.map(([ip, port, t], i) => `a=candidate:${i + 1} 1 udp ${t === 'h' ? 2122260223 : 1686052607} ${ip} ${port} typ ${t === 'h' ? 'host' : 'srflx raddr 0.0.0.0 rport 0'}`);
	return (
		[
			'v=0',
			`o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
			's=-',
			't=0 0',
			'a=group:BUNDLE 0',
			'a=msid-semantic: WMS',
			'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
			'c=IN IP4 0.0.0.0',
			...cands,
			`a=ice-ufrag:${o.u}`,
			`a=ice-pwd:${o.p}`,
			`a=fingerprint:sha-256 ${fp}`,
			`a=setup:${o.s}`,
			'a=mid:0',
			'a=sctp-port:5000',
			'a=max-message-size:262144',
		].join('\r\n') + '\r\n'
	);
}

function loadScript(src) {
	return new Promise((resolve, reject) => {
		if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
		const s = document.createElement('script');
		s.src = src;
		s.dataset.src = src;
		s.onload = resolve;
		s.onerror = () => reject(new Error('could not load ' + src));
		document.head.append(s);
	});
}

const Net = {
	pc: null,
	dc: null,
	role: null, // 'host' (left fighter) | 'guest' (right fighter)
	kind: 'wifi', // 'wifi' (QR codes) | 'online' (Firebase room)
	connected: false,
	delay: NET_DELAY,
	rtts: [],
	onPeerFailed: null, // set while online play is still trying a direct connection
	active: false, // a lockstep match is running
	cfg: { rt: 60, rw: 2, sp: 1 },
	picks: [null, null],
	support: null,

	// ---------- can this page do Wi-Fi play? ----------
	async probe() {
		if (this.support) return this.support;
		const host = location.hostname;
		// the Claude page runs games in a sandbox with no WebRTC or camera
		if (/(^|\.)claude\.ai$|claudeusercontent\.com$|claude\.site$/.test(host)) return (this.support = 'claude');
		if (!window.RTCPeerConnection) return (this.support = 'nortc');
		try {
			const pc = new RTCPeerConnection();
			pc.createDataChannel('probe');
			const got = new Promise((resolve) => {
				pc.onicecandidate = (e) => e.candidate && resolve(true);
				setTimeout(() => resolve(false), 2500);
			});
			await pc.setLocalDescription(await pc.createOffer());
			const ok = await got;
			pc.close();
			return (this.support = ok ? 'ok' : 'blocked');
		} catch (e) {
			return (this.support = 'blocked');
		}
	},
	get canScan() {
		return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
	},

	// ---------- connecting ----------
	newPeer() {
		this.close(true);
		const pc = new RTCPeerConnection({ iceServers: NET_ICE });
		pc.onconnectionstatechange = () => {
			if (!['failed', 'closed'].includes(pc.connectionState) || pc !== this.pc) return;
			if (this.onPeerFailed) this.onPeerFailed();
			else this.lost();
		};
		this.pc = pc;
		return pc;
	},
	gathered(pc) {
		// wait for every network address, or 2.5 s, whichever comes first
		return new Promise((resolve) => {
			if (pc.iceGatheringState === 'complete') return resolve();
			const t = setTimeout(resolve, 2500);
			pc.addEventListener('icegatheringstatechange', () => {
				if (pc.iceGatheringState === 'complete') {
					clearTimeout(t);
					resolve();
				}
			});
		});
	},
	// full: send every network address (online play has no QR size limit, and the internet
	// address can come after the first six)
	describe(pc, full) {
		return full ? { sdp: pc.localDescription.sdp } : compactSdp(pc.localDescription.sdp);
	},
	async host(full = false) {
		this.role = 'host';
		const pc = this.newPeer();
		this.bind(pc.createDataChannel('duel', { ordered: true }));
		await pc.setLocalDescription(await pc.createOffer());
		await this.gathered(pc);
		return packCode(Object.assign({ v: NET_VERSION }, this.describe(pc, full)));
	},
	async acceptAnswer(code) {
		const o = await unpackCode(code);
		if (o.v !== NET_VERSION || !o.a) throw new Error(tx('net.notAnswer'));
		await this.pc.setRemoteDescription({ type: 'answer', sdp: expandSdp(o) });
	},
	async join(code, full = false) {
		const o = await unpackCode(code);
		if (o.v !== NET_VERSION || o.a) throw new Error(tx(o.v !== NET_VERSION && !o.a ? 'net.versionText' : 'net.notHost'));
		this.role = 'guest';
		const pc = this.newPeer();
		pc.ondatachannel = (e) => this.bind(e.channel);
		await pc.setRemoteDescription({ type: 'offer', sdp: expandSdp(o) });
		await pc.setLocalDescription(await pc.createAnswer());
		await this.gathered(pc);
		return packCode(Object.assign({ v: NET_VERSION, a: 1 }, this.describe(pc, full)));
	},
	// Opened at localhost (or from the file), this page's own address means nothing to another
	// device, so the QR link would go nowhere. The host can type this computer's Wi-Fi address.
	get localOnly() {
		return location.protocol === 'file:' || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
	},
	get baseUrl() {
		if (this.localOnly) {
			try {
				const saved = localStorage.getItem('bb-net-address');
				if (saved) return saved;
			} catch (e) {
				/* no storage: fall through */
			}
		}
		return `${location.origin}${location.pathname}${location.search}`;
	},
	// "192.168.1.5:8000" -> "http://192.168.1.5:8000/index.html" (same page path as this one)
	setBaseUrl(text) {
		text = text.trim();
		if (!text) return false;
		if (!/^https?:\/\//i.test(text)) text = 'http://' + text;
		let url;
		try {
			url = new URL(text);
		} catch (e) {
			return false;
		}
		if (url.pathname === '/' && location.protocol !== 'file:') url.pathname = location.pathname;
		url.hash = '';
		try {
			localStorage.setItem('bb-net-address', url.href);
		} catch (e) {
			/* kept for this page only */
		}
		this.savedBase = url.href;
		return true;
	},
	joinUrl(code) {
		return `${this.savedBase || this.baseUrl}#join=${code}`;
	},
	// dc is a WebRTC data channel, or online play's Firebase relay (same shape)
	bind(dc) {
		this.dc = dc;
		dc.onopen = () => {
			this.connected = true;
			this.send({ t: 'hello', v: NET_VERSION });
			this.startBeat();
			if (this.kind === 'online') Online.opened(dc);
			NetUI.connected();
		};
		dc.onclose = () => dc === this.dc && this.lost();
		dc.onmessage = (e) => this.onMessage(JSON.parse(e.data));
	},
	send(msg) {
		if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
	},
	close(quiet = false) {
		this.active = false;
		this.connected = false;
		this.stopBeat();
		const dc = this.dc;
		const pc = this.pc;
		this.dc = null;
		this.pc = null;
		if (!quiet) this.send({ t: 'bye' });
		try {
			dc && dc.close();
			pc && pc.close();
		} catch (e) {
			/* already closed */
		}
	},
	// (the online room is closed before the role is cleared: host and guest close it differently)
	leave() {
		if (this.dc) this.send({ t: 'bye' });
		this.close(true);
		if (this.kind === 'online') Online.closeRoom();
		this.role = null;
	},
	lost() {
		if (!this.pc && !this.dc) return;
		const wasPlaying = this.active || Game.mode === 'net';
		this.close(true);
		if (this.kind === 'online') Online.closeRoom();
		this.role = null;
		if (wasPlaying || document.body.dataset.panel === 'net' || Select.mode === 'net') NetUI.lost();
	},

	// ---------- ping and heartbeat ----------
	// Every half second the host pings while the players are in the menus (that sets the input
	// delay), and every 2 s both sides send a small "still here". Only when nothing at all has
	// come from the other side for 30 s is the connection lost: a short drop (a phone changing
	// networks, a few seconds in another app) just pauses the game until it's back.
	startBeat() {
		this.stopBeat();
		this.rtts = [];
		this.lastHeard = this.lastBeat = performance.now();
		let n = 0;
		this.beat = setInterval(() => {
			if (!this.connected) return this.stopBeat();
			const now = performance.now();
			// this page itself was paused (the phone was in another app): wait for the
			// messages that piled up meanwhile before judging the other side
			if (now - this.lastBeat > 5000) this.lastHeard = now;
			this.lastBeat = now;
			if (this.role === 'host' && !this.active) this.send({ t: 'ping', at: now });
			if (++n % 4 === 0) this.send({ t: 'k' });
			if (now - this.lastHeard > NET_SILENT_MS) this.lost();
		}, 500);
	},
	stopBeat() {
		clearInterval(this.beat);
		this.beat = null;
	},
	get ping() {
		if (!this.rtts.length) return null;
		// a high sample rather than the average, so one slow moment doesn't stall the fight
		const sorted = this.rtts.slice().sort((a, b) => a - b);
		return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
	},
	// enough frames to cover the trip one way, plus two for jitter
	pickDelay(speed) {
		const rtt = this.ping;
		if (rtt === null) return NET_DELAY;
		const frames = Math.ceil(rtt / 2 / (1000 / 60 / speed)) + 2;
		return Math.max(NET_DELAY, Math.min(NET_MAX_DELAY, frames));
	},

	// ---------- lobby ----------
	onMessage(m) {
		this.lastHeard = performance.now();
		switch (m.t) {
			case 'hello':
				if (m.v !== NET_VERSION) NetUI.message(tx('net.version'), tx('net.versionText'), [[tx('res.menu'), goToMenu, '']]);
				else if (this.kind === 'online') Online.heard(this.dc);
				break;
			case 'k':
				break; // "still here"
			case 'ping':
				this.send({ t: 'pong', at: m.at });
				break;
			case 'pong':
				this.rtts.push(performance.now() - m.at);
				if (this.rtts.length > 10) this.rtts.shift();
				break;
			case 'pick':
				this.picks[1] = m.k;
				if (this.role === 'host' && this.picks[0]) this.bothPicked();
				break;
			case 'start':
				this.beginMatch(m);
				break;
			case 'i':
				this.remote.set(m.f, m.b);
				break;
			case 'h':
				this.hostHashes.set(m.f, m.h);
				this.checkHash(m.f);
				break;
			case 'resync':
				if (this.role === 'host' && this.active && this.snapAt === null) {
					this.snapAt = this.frame + this.delay + 4;
					this.send({ t: 'snapAt', f: this.snapAt });
				}
				break;
			case 'snapAt':
				this.snapAt = m.f;
				break;
			case 'snap':
				this.pendingSnap = m;
				if (this.waitingSnap && m.f === this.snapAt) this.applySnap();
				break;
			case 'want':
				this.theirWant = m.w;
				this.settleWants();
				break;
			case 'bye':
				this.lost();
				break;
		}
	},
	openSelect() {
		this.picks = [null, null];
		this.myWant = this.theirWant = null;
		Select.open('net', 'medium');
	},
	// your own fighter, picked on your device
	localPick(key) {
		this.picks[0] = key;
		this.send({ t: 'pick', k: key });
		if (this.role === 'host') {
			if (this.picks[1]) this.bothPicked();
			else NetUI.message(tx('net.waiting'), tx('net.waitPick'), [[tx('net.leave'), goToMenu, 'ghost']]);
		} else NetUI.message(tx('net.waiting'), tx('net.waitArena'), [[tx('net.leave'), goToMenu, 'ghost']]);
	},
	bothPicked() {
		Select.picks = [this.picks[0], this.picks[1]];
		Select.openArena();
	},
	// the host picked the arena: start on both devices, with the host's settings
	startHost(arena) {
		const m = {
			t: 'start',
			seed: (Math.random() * 0x7fffffff) | 0,
			k: [this.role === 'host' ? this.picks[0] : this.picks[1], this.role === 'host' ? this.picks[1] : this.picks[0]],
			arena,
			rt: Settings.get('roundTime'),
			rw: Settings.get('roundsToWin'),
			sp: Settings.get('speed'),
			d: this.pickDelay(Settings.get('speed')),
		};
		this.send(m);
		this.beginMatch(m);
	},
	beginMatch(m) {
		this.lastStart = m;
		this.cfg = { rt: m.rt, rw: m.rw, sp: m.sp };
		this.delay = m.d || NET_DELAY;
		this.myWant = this.theirWant = null;
		this.startLockstep(m.seed);
		startMatch('net', 'medium', m.k[0], m.k[1], m.arena);
		// the demo behind the menu ran a different number of frames on each device;
		// arena effects key off this counter, so both devices start it from zero
		Game.tick = 0;
	},
	want(w) {
		this.myWant = w;
		this.send({ t: 'want', w });
		document.getElementById('result-record').hidden = false;
		document.getElementById('result-record').textContent = tx('res.waiting');
		this.settleWants();
	},
	settleWants() {
		if (!this.myWant || this.myWant !== this.theirWant) return;
		const w = this.myWant;
		this.myWant = this.theirWant = null;
		if (w === 'change') this.openSelect();
		else if (w === 'rematch' && this.role === 'host') {
			const last = this.lastStart;
			this.startHost(last.arena);
		}
	},

	// ---------- lockstep ----------
	startLockstep(seed) {
		this.active = true;
		this.frame = 0;
		this.localNext = this.delay;
		this.local = new Map();
		this.remote = new Map();
		for (let f = 0; f < this.delay; f++) {
			this.local.set(f, 0);
			this.remote.set(f, 0);
		}
		this.inputs = [new InputState(), new InputState()];
		this.prevBits = [0, 0];
		this.rng = seed >>> 0;
		this.myHashes = new Map();
		this.hostHashes = new Map();
		this.snapAt = null;
		this.pendingSnap = null;
		this.waitingSnap = false;
		this.resyncs = 0;
		this.lastAdvance = performance.now();
		p1Input.clear();
	},
	random() {
		// mulberry32: small, fast and the same on every device
		let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	},
	// this device's buttons, as bits. A press shorter than one frame still counts.
	sample() {
		let b = 0;
		NET_ACTIONS.forEach((a, i) => {
			const pressed = p1Input.buffer[a] > 0;
			p1Input.buffer[a] = 0;
			if (p1Input.down[a] || pressed) b |= 1 << i;
		});
		return b;
	},
	applyBits(side, bits) {
		const inp = this.inputs[side];
		const prev = this.prevBits[side];
		NET_ACTIONS.forEach((a, i) => {
			const now = (bits >> i) & 1;
			const was = (prev >> i) & 1;
			if (now && !was) inp.press(a);
			else if (!now && was) inp.release(a);
		});
		this.prevBits[side] = bits;
	},
	// run one frame if both inputs are in; false means waiting for the other device
	advance() {
		while (this.localNext <= this.frame + this.delay) {
			const b = this.sample();
			this.local.set(this.localNext, b);
			this.send({ t: 'i', f: this.localNext, b });
			this.localNext++;
		}
		if (this.waitingSnap) return false;
		if (!this.remote.has(this.frame)) return false;
		const mine = this.local.get(this.frame);
		const theirs = this.remote.get(this.frame);
		const bits = this.role === 'host' ? [mine, theirs] : [theirs, mine];
		this.applyBits(0, bits[0]);
		this.applyBits(1, bits[1]);
		this.local.delete(this.frame);
		this.remote.delete(this.frame);
		const realRandom = Math.random;
		Math.random = () => this.random();
		try {
			step();
		} finally {
			Math.random = realRandom;
		}
		this.afterStep(this.frame);
		this.frame++;
		this.lastAdvance = performance.now();
		if (Game.state === 'matchEnd') this.active = false;
		return true;
	},
	afterStep(f) {
		if (f % NET_HASH_EVERY === 0) {
			const h = this.hash();
			if (this.role === 'host') this.send({ t: 'h', f, h });
			else {
				this.myHashes.set(f, h);
				this.checkHash(f);
			}
		}
		if (this.snapAt === f) {
			if (this.role === 'host') {
				this.send({ t: 'snap', f, d: this.capture() });
				this.snapAt = null;
			} else if (this.pendingSnap && this.pendingSnap.f === f) this.applySnap();
			else this.waitingSnap = true;
		}
	},
	checkHash(f) {
		if (this.role !== 'guest' || !this.myHashes.has(f) || !this.hostHashes.has(f)) return;
		const same = this.myHashes.get(f) === this.hostHashes.get(f);
		this.myHashes.delete(f);
		this.hostHashes.delete(f);
		if (!same && this.snapAt === null) this.send({ t: 'resync' });
	},
	stateValues() {
		const r = (v) => Math.round(v * 100) / 100;
		const out = [Game.round, Game.timeLeft, Game.timerFrames, Game.wins[0], Game.wins[1], Game.state, this.rng];
		[player, enemy].forEach((f) => out.push(r(f.position.x), r(f.position.y), r(f.velocity.x), r(f.velocity.y), r(f.health), r(f.energy), f.facing, f.stun, f.ko ? 1 : 0));
		return out;
	},
	hash() {
		const s = this.stateValues().join(',');
		let h = 2166136261;
		for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
		return h >>> 0;
	},
	capture() {
		const fields = ['health', 'energy', 'facing', 'stun', 'blockStun', 'invuln', 'ko', 'combo', 'comboTimer', 'knockback'];
		return {
			g: { round: Game.round, timeLeft: Game.timeLeft, timerFrames: Game.timerFrames, wins: Game.wins.slice(), state: Game.state, stateTimer: Game.stateTimer, hitStop: Game.hitStop, slowMo: Game.slowMo },
			f: [player, enemy].map((f) => {
				const o = { x: f.position.x, y: f.position.y, vx: f.velocity.x, vy: f.velocity.y };
				fields.forEach((k) => (o[k] = f[k]));
				return o;
			}),
			rng: this.rng,
		};
	},
	applySnap() {
		const d = this.pendingSnap.d;
		Object.assign(Game, { round: d.g.round, timeLeft: d.g.timeLeft, timerFrames: d.g.timerFrames, wins: d.g.wins, state: d.g.state, stateTimer: d.g.stateTimer, hitStop: d.g.hitStop, slowMo: d.g.slowMo });
		[player, enemy].forEach((f, i) => {
			const o = d.f[i];
			f.position.x = o.x;
			f.position.y = o.y;
			f.velocity.x = o.vx;
			f.velocity.y = o.vy;
			for (const k in o) if (!['x', 'y', 'vx', 'vy'].includes(k)) f[k] = o[k];
		});
		this.rng = d.rng;
		this.pendingSnap = null;
		this.waitingSnap = false;
		this.snapAt = null;
		this.resyncs++;
	},
	get stalledMs() {
		return this.active ? performance.now() - this.lastAdvance : 0;
	},
};

// ---------- the Wi-Fi panel ----------
const NetUI = {
	scanning: null,

	el(id) {
		return document.getElementById(id);
	},
	// title, text, and buttons as [label, fn, class]; extra parts are optional
	message(title, text, buttons, { qr = null, room = null, code = null, copyLabel = null, input = null, field = null, video = false, address = false } = {}) {
		this.stopScan();
		this.el('net-title').textContent = title;
		this.el('net-text').textContent = text;
		const body = this.el('net-body');
		body.innerHTML = '';
		if (qr) body.append(this.qrCanvas(qr));
		if (room) {
			const big = document.createElement('p');
			big.className = 'net-room';
			big.textContent = room;
			big.setAttribute('aria-label', txRaw('online.codeAria', { code: room.split('').join(' ') }));
			body.append(big);
		}
		if (code) {
			const box = document.createElement('div');
			box.className = 'net-code';
			const ta = document.createElement('textarea');
			ta.readOnly = true;
			ta.rows = 2;
			ta.value = code;
			ta.setAttribute('aria-label', tx('net.codeLabel'));
			const copy = document.createElement('button');
			copy.type = 'button';
			copy.className = 'chip';
			const label = copyLabel || tx('net.copy');
			copy.textContent = label;
			copy.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(code);
				} catch (e) {
					ta.select();
					document.execCommand && document.execCommand('copy');
				}
				copy.textContent = tx('net.copied');
				setTimeout(() => (copy.textContent = label), 1500);
			});
			box.append(ta, copy);
			body.append(box);
		}
		if (address) body.append(this.addressBox());
		if (input) {
			const ta = document.createElement('textarea');
			ta.rows = 3;
			ta.id = 'net-input';
			ta.placeholder = input;
			ta.setAttribute('aria-label', input);
			body.append(ta);
		}
		// one short line (a room code); Enter presses the first button
		if (field) {
			const inp = document.createElement('input');
			inp.id = 'net-field';
			inp.className = 'net-field';
			inp.type = 'text';
			inp.maxLength = 12;
			inp.autocomplete = 'off';
			inp.spellcheck = false;
			inp.setAttribute('autocapitalize', 'characters');
			inp.placeholder = field;
			inp.setAttribute('aria-label', field);
			inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase()));
			inp.addEventListener('keydown', (e) => {
				if (e.key !== 'Enter') return;
				e.preventDefault();
				this.el('net-buttons').firstChild?.click();
			});
			body.append(inp);
		}
		if (video) {
			const v = document.createElement('video');
			v.id = 'net-video';
			v.playsInline = true;
			v.muted = true;
			body.append(v);
		}
		const row = this.el('net-buttons');
		row.innerHTML = '';
		buttons.forEach(([label, fn, cls]) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = `btn ${cls || ''}`.trim();
			b.textContent = label;
			b.addEventListener('click', () => {
				Sound.init();
				Sound.click();
				fn();
			});
			row.append(b);
		});
		showPanel('net');
		const first = field ? this.el('net-field') : row.firstChild;
		first && first.focus({ preventScroll: true });
	},
	// host on localhost: where should the QR link point?
	addressBox() {
		const box = document.createElement('form');
		box.className = 'net-addr';
		const label = document.createElement('label');
		label.textContent = tx('net.addressLabel');
		label.htmlFor = 'net-address';
		const inp = document.createElement('input');
		inp.id = 'net-address';
		inp.type = 'text';
		inp.inputMode = 'url';
		inp.autocomplete = 'off';
		inp.spellcheck = false;
		inp.placeholder = 'http://192.168.1.5:8000';
		const cur = Net.savedBase || Net.baseUrl;
		if (!/\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(cur) && !cur.startsWith('file:')) inp.value = cur;
		const go = document.createElement('button');
		go.type = 'submit';
		go.className = 'chip';
		go.textContent = tx('net.addressUse');
		box.addEventListener('submit', (e) => {
			e.preventDefault();
			Sound.click();
			if (Net.setBaseUrl(inp.value)) this.showHost();
			else inp.setCustomValidity(tx('net.addressBad')), inp.reportValidity();
		});
		inp.addEventListener('input', () => inp.setCustomValidity(''));
		const row = document.createElement('div');
		row.append(inp, go);
		box.append(label, row);
		return box;
	},
	qrCanvas(text) {
		const qr = qrcode(0, 'L');
		qr.addData(text);
		qr.make();
		const n = qr.getModuleCount();
		const quiet = 4;
		const scale = Math.max(2, Math.floor(320 / (n + quiet * 2)));
		const cv = document.createElement('canvas');
		cv.className = 'net-qr';
		cv.width = cv.height = (n + quiet * 2) * scale;
		const ctx = cv.getContext('2d');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, cv.width, cv.height);
		ctx.fillStyle = '#000';
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
		cv.setAttribute('role', 'img');
		cv.setAttribute('aria-label', tx('net.qrLabel'));
		return cv;
	},
	error(e, back) {
		this.message(tx('net.error'), e && e.message ? e.message : String(e), [[tx('net.tryAgain'), back, ''], [tx('res.menu'), goToMenu, 'ghost']]);
	},

	async open() {
		Net.kind = 'wifi';
		this.message(tx('net.title'), tx('net.checking'), [[tx('net.back'), openMultiplayer, 'ghost']]);
		const support = await Net.probe();
		if (support !== 'ok') {
			const why =
				support === 'claude'
					? tx('net.whyClaude')
					: tx('net.whyBlocked');
			this.message(tx('net.needsHosted'), tx('net.howHost', { why }), [[tx('net.back'), openMultiplayer, '']]);
			return;
		}
		this.message(tx('net.title'), tx('net.intro'), [
			[tx('net.host'), () => this.startHost(), ''],
			[tx('net.join'), () => this.joinMenu(), ''],
			[tx('net.back'), openMultiplayer, 'ghost'],
		]);
	},

	async startHost() {
		this.message(tx('net.hosting'), tx('net.creating'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
		try {
			await loadScript('src/vendor/qrcode.js');
			const code = await Net.host();
			this.hostCode = code;
			this.showHost();
		} catch (e) {
			this.error(e, () => this.startHost());
		}
	},
	showHost() {
		const code = this.hostCode;
		const url = Net.joinUrl(code);
		// still pointing at localhost: say why the QR won't open on the phone
		const stuck = Net.localOnly && /\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)|^file:/.test(url);
		this.message(
			tx('net.step1'),
			tx('net.step1Text') + (Net.localOnly ? ' ' + tx(stuck ? 'net.localWarn' : 'net.localSet') : ''),
			[
				[tx('net.nextAnswer'), () => this.hostAnswer(), ''],
				[tx('net.cancel'), () => this.cancel(), 'ghost'],
			],
			{ qr: url, code: url, address: Net.localOnly }
		);
	},
	hostAnswer() {
		const buttons = [];
		if (Net.canScan) buttons.push([tx('net.scanAnswer'), () => this.scan(tx('net.scanAnswerText'), (t) => this.useAnswer(t), () => this.hostAnswer()), '']);
		buttons.push([tx('net.pasteAnswer'), () => this.useAnswer(this.el('net-input').value), Net.canScan ? 'ghost' : '']);
		buttons.push([tx('net.back'), () => this.showHost(), 'ghost']);
		this.message(tx('net.step2'), tx('net.step2Text'), buttons, { input: tx('net.answerPlaceholder') });
	},
	async useAnswer(text) {
		if (!text || !text.trim()) return;
		this.message(tx('net.connecting'), tx('net.connectingText'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
		try {
			await Net.acceptAnswer(text);
			setTimeout(() => {
				if (!Net.connected && Net.pc) this.message(tx('net.slow'), tx('net.slowText'), [[tx('net.startOver'), () => this.startHost(), ''], [tx('res.menu'), goToMenu, 'ghost']]);
			}, 10000);
		} catch (e) {
			this.error(e, () => this.hostAnswer());
		}
	},

	joinMenu() {
		const buttons = [];
		if (Net.canScan) buttons.push([tx('net.scanHost'), () => this.scan(tx('net.scanHostText'), (t) => this.useOffer(t), () => this.joinMenu()), '']);
		buttons.push([tx('net.pasteHost'), () => this.useOffer(this.el('net-input').value), Net.canScan ? 'ghost' : '']);
		buttons.push([tx('net.back'), () => this.open(), 'ghost']);
		this.message(tx('net.joinTitle'), tx('net.joinText'), buttons, { input: tx('net.hostPlaceholder') });
	},
	async useOffer(text) {
		if (!text || !text.trim()) return;
		this.message(tx('net.joining'), tx('net.joiningText'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
		try {
			await loadScript('src/vendor/qrcode.js');
			const answer = await Net.join(text);
			this.message(tx('net.showHost'), tx('net.showHostText'), [[tx('net.cancel'), () => this.cancel(), 'ghost']], { qr: answer, code: answer });
		} catch (e) {
			this.error(e, () => this.joinMenu());
		}
	},
	// arrived from a scanned link: join right away
	async fromLink(code) {
		Net.kind = 'wifi';
		const support = await Net.probe();
		if (support !== 'ok') return this.open();
		this.useOffer(code);
	},

	connected() {
		const side = tx(Net.role === 'host' ? 'net.youLeft' : 'net.youRight');
		this.message(tx('net.connected'), Net.dc && Net.dc.relay ? `${side} ${tx('online.relayNote')}` : side, []);
		Sound.fight();
		setTimeout(() => Net.connected && Net.openSelect(), 1100);
	},
	lost() {
		if (Game.mode === 'net') {
			Game.mode = 'cpu';
			startDemo();
		}
		Music.play('title');
		this.message(tx('net.lost'), tx(Net.kind === 'online' ? 'online.lostText' : 'net.lostText'), [[tx('res.menu'), goToMenu, '']]);
	},
	cancel() {
		Net.leave();
		goToMenu();
	},

	// ---------- camera QR scanner ----------
	async scan(text, onText, back) {
		this.message(tx('net.scanning'), text, [[tx('net.stop'), () => back(), 'ghost']], { video: true });
		try {
			await loadScript('src/vendor/jsQR.js');
			const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
			const video = this.el('net-video');
			if (!video) return stream.getTracks().forEach((t) => t.stop());
			video.srcObject = stream;
			await video.play();
			let detector = null;
			try {
				if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] });
			} catch (e) {
				detector = null;
			}
			const cv = document.createElement('canvas');
			const ctx = cv.getContext('2d', { willReadFrequently: true });
			const state = { stream, stop: false };
			this.scanning = state;
			const tick = async () => {
				if (state.stop) return;
				let found = null;
				try {
					if (video.videoWidth) {
						if (detector) {
							const r = await detector.detect(video);
							if (r[0]) found = r[0].rawValue;
						}
						if (!found) {
							const w = Math.min(720, video.videoWidth);
							const h = Math.round((video.videoHeight * w) / video.videoWidth);
							cv.width = w;
							cv.height = h;
							ctx.drawImage(video, 0, 0, w, h);
							const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
							if (r) found = r.data;
						}
					}
				} catch (e) {
					/* try the next frame */
				}
				if (found) {
					this.stopScan();
					Sound.click();
					onText(found);
					return;
				}
				setTimeout(tick, 180);
			};
			tick();
		} catch (e) {
			this.message(tx('net.noCamera'), tx('net.noCameraText'), [[tx('net.back'), () => back(), '']]);
		}
	},
	stopScan() {
		if (!this.scanning) return;
		this.scanning.stop = true;
		this.scanning.stream.getTracks().forEach((t) => t.stop());
		this.scanning = null;
	},
};
