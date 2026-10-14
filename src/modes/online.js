// ---------- Online play: a friend anywhere, through a room code ----------
//
// Firebase Realtime Database only introduces the two players. The host creates rooms/<CODE>
// and adds a WebRTC offer to it, the guest writes an answer, and the same lockstep match as
// Wi-Fi play (net.js) runs over a direct connection; once the guest says hello over it, the
// host deletes the room. When the two networks can't reach each other directly (some mobile
// and office networks), the host switches the room to relay mode and the match messages
// travel through the database instead: more lag, but it always connects.
//
// Phones drop their connection whenever the game goes to the background (the host sharing
// the link in a chat app, for one), so nothing here treats a dropped connection as leaving:
// the room stays until the host cancels or it's 3 hours old, and the Firebase SDK delivers
// the messages that waited meanwhile. Net's heartbeat decides when the other side is gone.
// Who may read and write a room is set in database.rules.json.
//
// The Firebase SDK is only downloaded when someone opens Online.

const FIREBASE_CONFIG = {
	apiKey: 'AIzaSyAy8o9OQQDt8IRyfpWcl4FK4fQAb0IOmeY',
	authDomain: 'blade-and-blood-84ac0.firebaseapp.com',
	databaseURL: 'https://blade-and-blood-84ac0-default-rtdb.asia-southeast1.firebasedatabase.app',
	projectId: 'blade-and-blood-84ac0',
	appId: '1:577083528138:web:57827347d5f0892a137533',
};
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1 to misread
const ROOM_LEN = 6;
const ROOM_MAX_AGE = 3 * 60 * 60 * 1000; // older rooms were left behind by a closed tab (same age in the rules)
const DIRECT_WAIT_MS = 8000; // then the host switches the room to the relay
const JOIN_WAIT_MS = 120000; // the host may still be in a chat app, sharing the link
const RELAY_FLUSH_MS = 30; // match messages go out in batches, about 33 writes a second
const RELAY_KEEP = 600; // sent batches kept in the room; older ones are deleted

function randomRoomCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(ROOM_LEN));
	return [...bytes].map((b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
}
// "k7q f2m", a pasted link, or "#room=K7QF2M" -> "K7QF2M"
function cleanRoomCode(text) {
	const m = String(text || '').match(/#room=([A-Za-z0-9]+)/);
	return (m ? m[1] : String(text || ''))
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, ROOM_LEN);
}

// The relay: the same shape as a WebRTC data channel (readyState, send, close, onopen,
// onclose, onmessage), so Net.bind() uses it unchanged. Each side writes numbered batches
// under its own key in the room and listens to the other side's key.
class RelayChannel {
	constructor(room, mine, theirs) {
		this.relay = true;
		this.out = Online.fb.child(room, mine);
		this.in = Online.fb.child(room, theirs);
		this.readyState = 'connecting';
		this.queue = [];
		this.sent = [];
		this.seq = 0;
		this.next = 0;
		this.held = new Map();
		this.onopen = this.onclose = this.onmessage = null;
	}
	start() {
		this.off = Online.fb.onChildAdded(this.in, (snap) => this.receive(snap.val()));
		this.flusher = setInterval(() => this.flush(), RELAY_FLUSH_MS);
		this.readyState = 'open';
		this.onopen && this.onopen();
	}
	send(text) {
		if (this.readyState === 'open') this.queue.push(text);
	}
	flush() {
		const fb = Online.fb;
		while (this.queue.length) {
			let n = 0;
			let size = 0;
			while (n < this.queue.length && (n === 0 || size + this.queue[n].length < 8000)) size += this.queue[n++].length;
			const key = fb.push(this.out).key;
			const write = { [key]: { s: this.seq++, m: JSON.stringify(this.queue.splice(0, n)) } };
			this.sent.push(key);
			// the oldest batch is deleted in the same write, so the room stays small
			if (this.sent.length > RELAY_KEEP) write[this.sent.shift()] = null;
			Online.pending = fb.update(this.out, write).catch(() => this.fail());
		}
	}
	receive(v) {
		if (!v || typeof v.s !== 'number' || v.s < this.next) return;
		this.held.set(v.s, v.m);
		while (this.held.has(this.next) && this.readyState === 'open') {
			const batch = JSON.parse(this.held.get(this.next));
			this.held.delete(this.next++);
			for (const text of batch) if (this.readyState === 'open' && this.onmessage) this.onmessage({ data: text });
		}
		// a batch never arrived: the two fights can't be kept in step any more
		if (this.held.size > 100) this.fail();
	}
	fail() {
		if (this.readyState === 'closed') return;
		this.close();
		this.onclose && this.onclose();
	}
	close() {
		if (this.readyState === 'closed') return;
		this.flush(); // the last messages (like "bye") still go out
		this.readyState = 'closed';
		clearInterval(this.flusher);
		this.off && this.off();
	}
}

const Online = {
	fb: null, // the Firebase Realtime Database functions
	db: null,
	code: null,
	room: null, // database reference to rooms/<code>
	offs: [], // listeners to detach when the room closes
	timer: null,
	relaying: false,
	pending: null, // the last relay write, so leaving can wait for "bye" to go out
	gen: 0, // counts rooms, so a late goOffline from an old room can't cut off a new one

	async load() {
		this.gen++;
		if (this.fb) {
			this.fb.goOnline(this.db);
			return this.fb;
		}
		const [app, db] = await Promise.all([import(FIREBASE_SDK + 'firebase-app.js'), import(FIREBASE_SDK + 'firebase-database.js')]);
		this.db = db.getDatabase(app.initializeApp(FIREBASE_CONFIG));
		this.fb = db;
		return db;
	},
	listen(path, fn) {
		this.offs.push(this.fb.onValue(this.fb.child(this.room, path), (snap) => fn(snap.val())));
	},
	link(code) {
		return `${location.origin}${location.pathname}#room=${code}`;
	},
	reset() {
		clearTimeout(this.timer);
		this.offs.forEach((off) => off());
		this.offs = [];
		this.room = null;
		this.code = null;
		this.relaying = false;
		this.answered = false;
		Net.onPeerFailed = null;
	},

	// ---------- host ----------
	// The room (and its code) exists straight away; the WebRTC offer, which takes a few
	// seconds to gather network addresses, is added to it afterwards.
	async create() {
		const fb = await this.load();
		this.reset();
		Net.kind = 'online';
		Net.role = 'host';
		for (let tries = 0; tries < 5; tries++) {
			const code = randomRoomCode();
			const room = fb.ref(this.db, 'rooms/' + code);
			try {
				await fb.set(room, { v: NET_VERSION, t: fb.serverTimestamp() });
			} catch (e) {
				continue; // that code is in use (the rules refuse to overwrite a live room)
			}
			this.code = code;
			this.room = room;
			this.hostWait();
			this.addOffer(room);
			return code;
		}
		throw new Error(tx('online.noRoom'));
	},
	async addOffer(room) {
		let offer = '';
		try {
			// no WebRTC in this browser: an empty offer sends the room straight to the relay
			if ((await Net.probe()) === 'ok') offer = await Net.host(true);
		} catch (e) {
			offer = '';
		}
		if (this.room !== room) return; // cancelled meanwhile
		await this.fb.set(this.fb.child(room, 'offer'), offer).catch(() => {});
	},
	hostWait() {
		this.listen('answer', (answer) => {
			if (typeof answer !== 'string' || this.answered) return;
			this.answered = true;
			OnlineUI.connecting();
			if (!answer || !Net.pc) return this.useRelay();
			Net.onPeerFailed = () => this.useRelay();
			Net.acceptAnswer(answer).catch(() => this.useRelay());
			this.timer = setTimeout(() => !Net.connected && this.useRelay(), DIRECT_WAIT_MS);
		});
	},
	async useRelay() {
		if (this.relaying || !this.room) return;
		this.relaying = true;
		clearTimeout(this.timer);
		this.dropPeer();
		try {
			await this.fb.set(this.fb.child(this.room, 'relay'), true);
		} catch (e) {
			return OnlineUI.failed();
		}
		this.bindRelay('h', 'g');
	},

	// ---------- guest ----------
	async join(text) {
		const code = cleanRoomCode(text);
		if (code.length !== ROOM_LEN) throw new Error(tx('online.badCode'));
		const fb = await this.load();
		this.reset();
		const room = fb.ref(this.db, 'rooms/' + code);
		const r = (await fb.get(room)).val();
		if (!r || Date.now() - r.t > ROOM_MAX_AGE) throw new Error(tx('online.noSuchRoom'));
		if (r.v !== NET_VERSION) throw new Error(tx('net.versionText'));
		if (r.answer !== undefined) throw new Error(tx('online.full'));
		Net.kind = 'online';
		Net.role = 'guest';
		this.code = code;
		this.room = room;
		let offer = r.offer;
		if (typeof offer !== 'string') {
			OnlineUI.waiting();
			offer = await this.waitOffer(room);
		}
		let answer = '';
		if (offer && (await Net.probe()) === 'ok') {
			answer = await Net.join(offer, true);
			Net.onPeerFailed = () => {}; // the host decides when to switch to the relay
		}
		if (this.room !== room) return null; // cancelled meanwhile
		try {
			await fb.set(fb.child(room, 'answer'), answer);
		} catch (e) {
			throw new Error(tx('online.full')); // someone else answered first
		}
		this.listen('relay', (on) => on && this.guestRelay());
		this.listen('v', (v) => v === null && this.roomGone());
		this.timer = setTimeout(() => !Net.connected && OnlineUI.failed(), JOIN_WAIT_MS);
		return code;
	},
	// the host's offer isn't in the room yet: it was only just made, or the host's game went to
	// the background before it could add it (they're sharing the link) and adds it when they're back
	// (cancelling resets the room, which stops the timer and the listener: the promise is dropped)
	waitOffer(room) {
		return new Promise((resolve, reject) => {
			this.timer = setTimeout(() => {
				off();
				reject(new Error(tx('online.failText')));
			}, JOIN_WAIT_MS);
			const off = this.fb.onValue(this.fb.child(room, 'offer'), (snap) => {
				if (typeof snap.val() !== 'string') return;
				clearTimeout(this.timer);
				off();
				resolve(snap.val());
			});
			this.offs.push(off);
		});
	},
	guestRelay() {
		if (this.relaying) return;
		this.relaying = true;
		clearTimeout(this.timer);
		this.dropPeer();
		this.bindRelay('g', 'h');
	},
	// the host deleted the room: fine after a direct connection, otherwise they left
	roomGone() {
		if (Net.connected && Net.dc && !Net.dc.relay) return this.finish();
		if (Net.dc) return Net.lost();
		this.closeRoom();
		Net.leave();
		OnlineUI.hostLeft();
	},

	// ---------- both ----------
	bindRelay(mine, theirs) {
		const ch = new RelayChannel(this.room, mine, theirs);
		Net.bind(ch);
		ch.start();
	},
	// close the direct attempt without leaving the room
	dropPeer() {
		Net.onPeerFailed = null;
		const { pc, dc } = Net;
		Net.pc = Net.dc = null;
		Net.connected = false;
		try {
			dc && dc.close();
			pc && pc.close();
		} catch (e) {
			/* already closed */
		}
	},
	// called by Net when a channel opens
	opened(dc) {
		if (dc.relay) return;
		clearTimeout(this.timer);
		Net.onPeerFailed = null;
	},
	// called by Net when the other side's hello arrives. Over a direct connection the guest's
	// hello means both ends are open: the room has done its job, and the host deletes it
	// (which tells the guest to let go of it too).
	heard(dc) {
		if (dc && !dc.relay && Net.role === 'host' && this.room) this.fb.remove(this.room).finally(() => this.finish());
	},
	finish() {
		this.reset();
		this.pending = null;
		if (this.fb) this.fb.goOffline(this.db);
	},
	// leaving on purpose: the host deletes the room (the guest just lets go of it). Either way
	// the last messages (like "bye") reach the server first, or 3 s pass, before going offline.
	closeRoom() {
		const room = this.room;
		const host = Net.role !== 'guest';
		const pending = this.pending;
		const gen = this.gen;
		this.pending = null;
		this.reset();
		if (!this.fb) return;
		Promise.race([Promise.resolve(pending), new Promise((r) => setTimeout(r, 3000))])
			.then(() => room && host && this.fb.remove(room))
			.catch(() => {})
			.finally(() => this.gen === gen && this.fb.goOffline(this.db));
	},
};

// ---------- the Online panels (they reuse the Wi-Fi panel's layout) ----------
const OnlineUI = {
	open() {
		Net.kind = 'online';
		NetUI.message(tx('online.title'), tx('online.intro'), [
			[tx('online.create'), () => this.create(), ''],
			[tx('online.join'), () => this.joinMenu(), ''],
			[tx('net.back'), openMultiplayer, 'ghost'],
		]);
	},
	async create() {
		NetUI.message(tx('online.title'), tx('online.creating'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
		try {
			this.showRoom(await Online.create());
		} catch (e) {
			this.error(e, () => this.open());
		}
	},
	showRoom(code) {
		const url = Online.link(code);
		const buttons = [];
		// txRaw: Bengali text must not turn the code's digits into Bengali digits
		if (navigator.share) buttons.push([tx('online.share'), () => navigator.share({ title: tx('app.title'), text: txRaw('online.shareText', { code }), url }).catch(() => {}), '']);
		buttons.push([tx('net.cancel'), () => this.cancel(), 'ghost']);
		NetUI.message(tx('online.roomTitle'), tx('online.roomText'), buttons, { room: code, code: url, copyLabel: tx('online.copyLink') });
	},
	connecting() {
		NetUI.message(tx('net.connecting'), tx('online.connectingText'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
	},
	// the guest, until the host's game answers
	waiting() {
		NetUI.message(tx('net.connecting'), tx('online.waitHost'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
	},
	joinMenu(prefill = '') {
		NetUI.message(
			tx('online.join'),
			tx('online.joinText'),
			[
				[tx('online.joinGo'), () => this.join(document.getElementById('net-field').value), ''],
				[tx('net.back'), () => this.open(), 'ghost'],
			],
			{ field: tx('online.codePlaceholder') }
		);
		if (prefill) document.getElementById('net-field').value = prefill;
	},
	async join(text) {
		if (!cleanRoomCode(text)) return;
		NetUI.message(tx('online.joining'), tx('online.joiningText'), [[tx('net.cancel'), () => this.cancel(), 'ghost']]);
		try {
			if (!(await Online.join(text))) return; // cancelled
			if (!Net.connected) this.waiting();
		} catch (e) {
			Online.closeRoom();
			Net.leave();
			this.error(e, () => this.joinMenu(cleanRoomCode(text)));
		}
	},
	// opened from a shared #room= link
	fromLink(code) {
		Net.kind = 'online';
		this.join(code);
	},
	failed() {
		Online.closeRoom();
		Net.leave();
		NetUI.message(tx('online.failTitle'), tx('online.failText'), [
			[tx('net.tryAgain'), () => this.open(), ''],
			[tx('res.menu'), goToMenu, 'ghost'],
		]);
	},
	hostLeft() {
		NetUI.message(tx('online.closedTitle'), tx('online.closedText'), [
			[tx('online.join'), () => this.joinMenu(), ''],
			[tx('res.menu'), goToMenu, 'ghost'],
		]);
	},
	error(e, back) {
		const text = e && e.message ? e.message : String(e);
		// the SDK couldn't be downloaded, or the database refused: most often no internet
		const offline = /Failed to fetch|import|network|PERMISSION_DENIED|dynamically imported/i.test(text);
		NetUI.message(tx('net.error'), offline ? tx('online.offline') : text, [
			[tx('net.tryAgain'), back, ''],
			[tx('res.menu'), goToMenu, 'ghost'],
		]);
	},
	cancel() {
		Online.closeRoom();
		Net.leave();
		goToMenu();
	},
};
