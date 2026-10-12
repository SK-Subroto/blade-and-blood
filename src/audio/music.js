// ---------- Background music, generated in code (Web Audio, no files) ----------
// A small step sequencer. Each track is a key, a chord progression and a few text patterns:
//   lead / bass:  one character per 16th note. Digits and letters are scale degrees
//                 (0-9, then a=10, b=11 ...), '-' holds the previous note, '.' is a rest.
//                 Bass uses R (chord root), F (fifth), O (octave up) instead of degrees.
//   drums:        'x' hits on that 16th.
// Notes are scheduled a little ahead of time, so the music keeps steady time even when a
// frame is slow.

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

const MUSIC_TRACKS = {
	// the intro / title theme: a slow heroic march with taiko drums
	title: {
		bpm: 92, key: 50, scale: MINOR, prog: [0, 5, 6, 4, 0, 5, 6, 4],
		lead: [
			'4---7---6-5-4---', '5---4-2-3---2---', '6---5-4-6---9---', '8-------7---4---',
			'7-9-b---a-9-7---', '9---7-5-7---5---', '6-7-9-6-4---6---', '4-------........',
		],
		bass: ['R-------R---F---', 'R-------R---F---', 'R-------R---F---', 'R-------R-O-F---'],
		drums: { taiko: 'x.......x..x....', k: '', s: '', h: '....x.......x...' },
		leadWave: 'square', leadVol: 0.07, padWave: 'triangle', padVol: 0.05, bassWave: 'triangle', bassVol: 0.16,
	},
	// forest arena: quick, bright, pentatonic runs
	forest: {
		bpm: 128, key: 57, scale: MINOR, prog: [0, 5, 2, 6, 0, 5, 3, 4],
		lead: [
			'7.9.7.4.7-..9.b.', 'a-9-7.5.4-......', '9.7.4.2.4-7-....', '8.9.8.6.4---....',
			'7.9.b.e.b.9.7...', 'a.9.7.5.4.5.7...', '9-7-4-2-4.7.9...', 'b---a---8---....',
		],
		bass: ['R.R.O.R.R.R.O.F.', 'R.R.O.R.R.F.O.R.'],
		drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
		gain: 1.6, leadWave: 'square', leadVol: 0.05, leadOct: 0, padWave: 'triangle', padVol: 0.035, bassWave: 'sawtooth', bassVol: 0.08, arp: true,
	},
	// castle arena: heavy and dark
	castle: {
		bpm: 108, key: 52, scale: PHRYGIAN, prog: [0, 1, 0, 6, 0, 1, 5, 4],
		lead: [
			'7-------8---7---', '8-------a---8---', '7---5---4---3---', '1-------0-------',
			'7---8---a---b---', 'c-------b---a---', '8---7---5---4---', '5-------4-------',
		],
		bass: ['R..R..R.R..R..F.', 'R..R..R.R.R.O.R.'],
		drums: { k: 'x..x..x.x.......', s: '....x.......x...', h: '..x...x...x...x.' },
		gain: 1.6, leadWave: 'sawtooth', leadVol: 0.045, padWave: 'sawtooth', padVol: 0.03, bassWave: 'square', bassVol: 0.07, organ: true,
	},
	// boss fights: fast, driving 8th-note bass
	boss: {
		bpm: 150, key: 48, scale: HARMONIC, prog: [0, 0, 5, 4, 0, 0, 5, 4],
		lead: [
			'7.7.7.6.7---4---', '7.7.7.8.9---8-7-', '5.5.5.4.5---3---', '6-------6-7-8-9-',
			'e-------d-c-b---', 'c-b-a-9-a---7---', 'a---9---8---7---', '6-7-8-9-b---....',
		],
		bass: ['R.R.R.R.R.R.R.R.', 'R.R.R.R.O.O.F.F.'],
		drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
		gain: 1.6, leadWave: 'sawtooth', leadVol: 0.05, padWave: 'sawtooth', padVol: 0.03, bassWave: 'sawtooth', bassVol: 0.09,
	},
	// story walk-ins and dialogue: slow, tense pad with a heartbeat
	story: {
		bpm: 70, key: 45, scale: HARMONIC, prog: [0, 5, 3, 4],
		lead: ['7-------........', '8-------........', '5-------........', '6-------4-------'],
		bass: ['R---------------'],
		drums: { k: 'x..x............', s: '', h: '' },
		leadWave: 'triangle', leadVol: 0.05, padWave: 'sawtooth', padVol: 0.035, bassWave: 'sine', bassVol: 0.18,
	},
};

// one-shot phrases for the end of a match: [scale degree, length in 16ths]
const MUSIC_STINGS = {
	win: { bpm: 140, key: 50, scale: [0, 2, 4, 5, 7, 9, 11], notes: [[0, 1], [2, 1], [4, 1], [7, 2], [4, 1], [7, 6]], chord: [0, 4, 7] },
	lose: { bpm: 90, key: 50, scale: MINOR, notes: [[7, 2], [6, 2], [5, 2], [4, 2], [3, 3], [0, 6]], chord: [0, 3, 7] },
};

function midiToFreq(m) {
	return 440 * Math.pow(2, (m - 69) / 12);
}

function parseLine(str) {
	// -> [{ step, ch, len }] with '-' folded into the note before it
	const out = [];
	for (let i = 0; i < str.length; i++) {
		const ch = str[i];
		if (ch === '.' || ch === '-') continue;
		let len = 1;
		while (str[i + len] === '-') len++;
		out.push({ step: i, ch, len });
	}
	return out;
}

const Music = {
	out: null, // music volume
	bus: null, // the current track, faded on change
	want: null, // the track that should be playing
	name: null,
	track: null,
	timer: null,
	nextTime: 0,
	stepIndex: 0,
	ducked: false,
	stingTimer: null,

	get ctx() {
		return Sound.ctx;
	},

	// called by Sound.init once the audio context exists
	onContext() {
		if (this.out) return;
		this.out = this.ctx.createGain();
		this.out.connect(this.ctx.destination);
		this.setVolume();
		if (this.want) {
			const w = this.want;
			this.want = null;
			this.play(w);
		}
	},

	setVolume() {
		if (!this.out) return;
		const v = Sound.enabled ? Settings.get('music') * 0.55 * (this.ducked ? 0.35 : 1) : 0;
		this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
	},

	duck(on) {
		this.ducked = on;
		this.setVolume();
	},

	play(name) {
		clearTimeout(this.stingTimer);
		if (!MUSIC_TRACKS[name]) return;
		if (!this.ctx || !this.out) {
			this.want = name;
			return;
		}
		if (this.name === name && this.timer) return;
		this.fadeOut();
		this.name = name;
		this.track = this.prepare(MUSIC_TRACKS[name]);
		this.bus = this.ctx.createGain();
		this.bus.gain.value = 0.0001;
		this.bus.gain.exponentialRampToValueAtTime(this.track.gain || 1, this.ctx.currentTime + 0.6);
		this.bus.connect(this.out);
		this.stepIndex = 0;
		this.nextTime = this.ctx.currentTime + 0.08;
		clearInterval(this.timer);
		this.timer = setInterval(() => this.schedule(), 25);
		this.schedule();
	},

	stop() {
		clearTimeout(this.stingTimer);
		clearInterval(this.timer);
		this.timer = null;
		this.name = null;
		this.want = null;
		this.fadeOut();
	},

	fadeOut() {
		const old = this.bus;
		this.bus = null;
		if (!old || !this.ctx) return;
		const t = this.ctx.currentTime;
		old.gain.cancelScheduledValues(t);
		old.gain.setValueAtTime(Math.max(0.0001, old.gain.value), t);
		old.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
		setTimeout(() => old.disconnect(), 800);
	},

	// end-of-match phrase, then another track (the title theme by default) comes back
	sting(kind, after = 'title') {
		const s = MUSIC_STINGS[kind];
		if (!s || !this.ctx || !this.out) return;
		this.stop();
		const bus = this.ctx.createGain();
		bus.connect(this.out);
		const sixteenth = 60 / s.bpm / 4;
		let t = this.ctx.currentTime + 0.05;
		const note = (deg) => s.key + 12 + s.scale[deg % 7] + 12 * Math.floor(deg / 7);
		s.notes.forEach(([deg, len]) => {
			this.voice(bus, midiToFreq(note(deg)), t, len * sixteenth, 'square', 0.09);
			t += len * sixteenth;
		});
		const last = t - s.notes[s.notes.length - 1][1] * sixteenth;
		s.chord.forEach((iv) => this.voice(bus, midiToFreq(s.key + iv), last, 1.4, 'triangle', 0.08));
		this.stingTimer = setTimeout(() => {
			bus.disconnect();
			this.play(after);
		}, (t - this.ctx.currentTime) * 1000 + 2600);
	},

	prepare(def) {
		return Object.assign({}, def, {
			sixteenth: 60 / def.bpm / 4,
			leadBars: def.lead.map(parseLine),
			bassBars: def.bass.map(parseLine),
			drumSteps: Object.fromEntries(Object.entries(def.drums).map(([k, p]) => [k, p])),
		});
	},

	// scale degree -> MIDI note in the track's key
	degree(tr, d, octave = 0) {
		const n = tr.scale.length;
		return tr.key + tr.scale[((d % n) + n) % n] + 12 * (Math.floor(d / n) + octave);
	},

	schedule() {
		if (!this.track || !this.bus) return;
		const ctx = this.ctx;
		// a hidden tab throttles timers, so skip ahead instead of piling notes up
		if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
		while (this.nextTime < ctx.currentTime + 0.15) {
			this.playStep(this.stepIndex, this.nextTime);
			this.nextTime += this.track.sixteenth;
			this.stepIndex++;
		}
	},

	playStep(i, t) {
		const tr = this.track;
		const bus = this.bus;
		const s16 = tr.sixteenth;
		const step = i % 16;
		const bar = Math.floor(i / 16);
		const chord = tr.prog[bar % tr.prog.length];

		// pad: the chord, held for the bar
		if (step === 0) {
			[0, 2, 4].forEach((iv, k) => {
				const f = midiToFreq(this.degree(tr, chord + iv, 0));
				this.voice(bus, f, t, s16 * 16, tr.padWave, tr.padVol * (k === 0 ? 1 : 0.8), { attack: 0.25, release: 0.4, cutoff: tr.organ ? 1400 : 900 });
			});
		}
		// arpeggio under the forest theme
		if (tr.arp && step % 2 === 1) {
			const iv = [0, 2, 4, 7][Math.floor(step / 2) % 4];
			this.voice(bus, midiToFreq(this.degree(tr, chord + iv, 1)), t, s16 * 0.9, 'triangle', 0.025);
		}
		// lead
		tr.leadBars[bar % tr.leadBars.length].forEach((n) => {
			if (n.step !== step) return;
			const d = parseInt(n.ch, 36);
			if (Number.isNaN(d)) return;
			this.voice(bus, midiToFreq(this.degree(tr, d, tr.leadOct ?? 1)), t, n.len * s16, tr.leadWave, tr.leadVol, { attack: 0.01, release: 0.08, cutoff: 3200, vibrato: n.len >= 4 });
		});
		// bass
		tr.bassBars[bar % tr.bassBars.length].forEach((n) => {
			if (n.step !== step) return;
			const off = n.ch === 'F' ? 4 : 0;
			const oct = n.ch === 'O' ? 0 : -1;
			this.voice(bus, midiToFreq(this.degree(tr, chord + off, oct)), t, n.len * s16 * 0.95, tr.bassWave, tr.bassVol, { attack: 0.005, release: 0.05, cutoff: 700 });
		});
		// drums
		const d = tr.drumSteps;
		if (d.k && d.k[step] === 'x') this.kick(bus, t);
		if (d.s && d.s[step] === 'x') this.snare(bus, t);
		if (d.h && d.h[step] === 'x') this.hat(bus, t, step % 4 === 0 ? 0.05 : 0.03);
		if (d.taiko && d.taiko[step] === 'x') this.taiko(bus, t);
	},

	voice(bus, freq, t, dur, type, vol, { attack = 0.01, release = 0.1, cutoff = 2400, vibrato = false } = {}) {
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, t);
		if (vibrato) {
			const lfo = ctx.createOscillator();
			const depth = ctx.createGain();
			lfo.frequency.value = 5.5;
			depth.gain.setValueAtTime(0, t);
			depth.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
			lfo.connect(depth).connect(osc.frequency);
			lfo.start(t);
			lfo.stop(t + dur + release);
		}
		const f = ctx.createBiquadFilter();
		f.type = 'lowpass';
		f.frequency.value = cutoff;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + attack);
		g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
		osc.connect(f).connect(g).connect(bus);
		osc.start(t);
		osc.stop(t + dur + release + 0.02);
	},

	noiseHit(bus, t, { dur, vol, freq, filter = 'bandpass', q = 1 }) {
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = Sound.noiseBuffer;
		const f = ctx.createBiquadFilter();
		f.type = filter;
		f.frequency.value = freq;
		f.Q.value = q;
		const g = ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(g).connect(bus);
		src.start(t, Math.random() * 0.5);
		src.stop(t + dur + 0.02);
	},

	kick(bus, t) {
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(140, t);
		osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
		g.gain.setValueAtTime(0.45, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
		osc.connect(g).connect(bus);
		osc.start(t);
		osc.stop(t + 0.25);
	},
	snare(bus, t) {
		this.noiseHit(bus, t, { dur: 0.14, vol: 0.16, freq: 1900, q: 0.7 });
		this.voice(bus, 190, t, 0.05, 'triangle', 0.06, { attack: 0.002, release: 0.05 });
	},
	hat(bus, t, vol) {
		this.noiseHit(bus, t, { dur: 0.035, vol, freq: 7500, filter: 'highpass' });
	},
	taiko(bus, t) {
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(95, t);
		osc.frequency.exponentialRampToValueAtTime(55, t + 0.35);
		g.gain.setValueAtTime(0.5, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
		osc.connect(g).connect(bus);
		osc.start(t);
		osc.stop(t + 0.55);
		this.noiseHit(bus, t, { dur: 0.12, vol: 0.12, freq: 300, filter: 'lowpass' });
	},
};

// which track plays during a match
function musicForMatch() {
	if (enemy.cfg.boss || player.cfg.boss) return 'boss';
	return ARENAS[Game.arena].music || 'forest';
}
