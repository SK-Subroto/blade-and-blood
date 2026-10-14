// ---------- Synthesized sound effects (Web Audio, no files needed) ----------

const Sound = {
	ctx: null,
	master: null,
	enabled: true,
	silent: false, // true during the attract-mode demo behind the menu

	init() {
		if (this.ctx) {
			if (this.ctx.state === 'suspended') this.ctx.resume();
			return;
		}
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.connect(this.ctx.destination);
		this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
		const data = this.noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		this.setVolumes();
		Music.onContext();
	},

	// effects volume from the settings; music has its own volume (js/music.js)
	setVolumes() {
		if (this.master) this.master.gain.value = 0.5 * Settings.get('sfx');
		Music.setVolume();
	},

	get ready() {
		return this.ctx && this.enabled && !this.silent && this.ctx.state === 'running' && Settings.get('sfx') > 0;
	},

	tone({ freq = 440, to = null, type = 'square', dur = 0.15, vol = 0.2, delay = 0 }) {
		if (!this.ready) return;
		const t = this.ctx.currentTime + delay;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, t);
		if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
		gain.gain.setValueAtTime(vol, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(gain).connect(this.master);
		osc.start(t);
		osc.stop(t + dur + 0.02);
	},

	noise({ dur = 0.2, vol = 0.3, freq = 1200, to = null, q = 1, filter = 'bandpass', delay = 0 }) {
		if (!this.ready) return;
		const t = this.ctx.currentTime + delay;
		const src = this.ctx.createBufferSource();
		src.buffer = this.noiseBuffer;
		const f = this.ctx.createBiquadFilter();
		f.type = filter;
		f.Q.value = q;
		f.frequency.setValueAtTime(freq, t);
		if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
		const gain = this.ctx.createGain();
		gain.gain.setValueAtTime(vol, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(gain).connect(this.master);
		src.start(t);
		src.stop(t + dur + 0.02);
	},

	swing(heavy) {
		this.noise({ dur: heavy ? 0.22 : 0.13, vol: heavy ? 0.35 : 0.22, freq: 900, to: heavy ? 3000 : 4500, q: 0.8 });
	},
	hit(heavy) {
		this.tone({ freq: heavy ? 160 : 220, to: 45, type: 'sine', dur: heavy ? 0.3 : 0.18, vol: 0.6 });
		this.noise({ dur: heavy ? 0.2 : 0.12, vol: heavy ? 0.5 : 0.35, freq: 1800, filter: 'lowpass' });
	},
	block() {
		this.tone({ freq: 1250, to: 900, type: 'square', dur: 0.08, vol: 0.12 });
		this.tone({ freq: 1900, type: 'triangle', dur: 0.12, vol: 0.1 });
	},
	jump() {
		this.tone({ freq: 260, to: 520, type: 'square', dur: 0.1, vol: 0.06 });
	},
	dash() {
		this.noise({ dur: 0.18, vol: 0.25, freq: 600, to: 2400, q: 2 });
	},
	special() {
		this.tone({ freq: 180, to: 900, type: 'sawtooth', dur: 0.35, vol: 0.12 });
		this.noise({ dur: 0.35, vol: 0.2, freq: 400, to: 3000, q: 3 });
	},
	superCharge() {
		this.tone({ freq: 110, to: 880, type: 'sawtooth', dur: 0.6, vol: 0.15 });
		this.tone({ freq: 220, to: 1760, type: 'square', dur: 0.6, vol: 0.06 });
	},
	superFire() {
		this.noise({ dur: 0.6, vol: 0.55, freq: 300, to: 80, filter: 'lowpass' });
		this.tone({ freq: 90, to: 40, type: 'sine', dur: 0.6, vol: 0.6 });
	},
	explode() {
		this.noise({ dur: 0.35, vol: 0.45, freq: 900, to: 120, filter: 'lowpass' });
	},
	ko() {
		this.tone({ freq: 70, to: 30, type: 'sine', dur: 1.2, vol: 0.8 });
		this.noise({ dur: 0.9, vol: 0.5, freq: 500, to: 60, filter: 'lowpass' });
	},
	bell() {
		this.tone({ freq: 880, type: 'sine', dur: 0.9, vol: 0.25 });
		this.tone({ freq: 1320, type: 'sine', dur: 0.7, vol: 0.12 });
	},
	fight() {
		this.tone({ freq: 440, to: 660, type: 'square', dur: 0.15, vol: 0.12 });
		this.tone({ freq: 660, to: 990, type: 'square', dur: 0.25, vol: 0.12, delay: 0.12 });
	},
	parry() {
		this.tone({ freq: 1800, to: 2400, type: 'triangle', dur: 0.25, vol: 0.2 });
		this.tone({ freq: 900, type: 'sine', dur: 0.4, vol: 0.15 });
		this.noise({ dur: 0.15, vol: 0.2, freq: 5000, filter: 'highpass' });
	},
	grab() {
		this.noise({ dur: 0.1, vol: 0.3, freq: 700, filter: 'lowpass' });
		this.tone({ freq: 300, to: 200, type: 'square', dur: 0.1, vol: 0.08 });
	},
	throwSlam() {
		this.tone({ freq: 120, to: 40, type: 'sine', dur: 0.5, vol: 0.7 });
		this.noise({ dur: 0.4, vol: 0.5, freq: 600, to: 80, filter: 'lowpass' });
	},
	crit() {
		this.tone({ freq: 1320, to: 1760, type: 'square', dur: 0.12, vol: 0.1 });
		this.tone({ freq: 1760, to: 2640, type: 'square', dur: 0.16, vol: 0.08, delay: 0.06 });
	},
	tick() {
		this.tone({ freq: 1500, type: 'square', dur: 0.04, vol: 0.05 });
	},
	click() {
		this.tone({ freq: 700, to: 1000, type: 'square', dur: 0.06, vol: 0.08 });
	},
	// quick chat: a short blip when you send, a brighter two-note pop when the other player does
	chatSend() {
		this.tone({ freq: 880, to: 1175, type: 'square', dur: 0.07, vol: 0.07 });
	},
	chatGet() {
		this.tone({ freq: 988, to: 1319, type: 'square', dur: 0.08, vol: 0.1 });
		this.tone({ freq: 1319, to: 1760, type: 'square', dur: 0.1, vol: 0.1, delay: 0.09 });
	},
};
