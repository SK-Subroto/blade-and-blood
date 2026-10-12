// ---------- Adaptive learning: the CPU studies the player during the match ----------
// The learner watches every action the player takes and keeps three tables of counts:
//   1. what the player does after their last action        (first-order Markov chain)
//   2. what they do after their last two actions            (second-order Markov chain)
//   3. what they do in the current situation                (distance + what the CPU is doing)
// Old habits fade (each update decays the row a little), so the model follows changes in style.
// The three tables are blended into one probability for each possible next action.
// The CPU then uses the most likely action to pick a counter (see AIController.counterPlan).

const LEARN_ACTIONS = ['light', 'heavy', 'special', 'super', 'jump', 'dash', 'block', 'approach', 'retreat', 'wait', 'throw', 'breaker'];
// action names in the current language (js/i18n.js, keys act.*)
const LEARN_LABEL = new Proxy(
	{},
	{
		get: (_, k) => (STRINGS.en[`act.${String(k)}`] ? tx(`act.${String(k)}`) : String(k).toUpperCase()),
	}
);
const LEARN_DECAY = 0.93;

// Saved learning, kept in this browser between matches. Wrapped in try/catch because
// storage can be blocked (private windows, some embedded views); the game works without it.
const AIMemory = {
	key: 'samurai-duel-ai-memory-v1',
	all() {
		try {
			return JSON.parse(localStorage.getItem(this.key)) || {};
		} catch (e) {
			return {};
		}
	},
	get(id) {
		return this.all()[id] || null;
	},
	set(id, data) {
		try {
			const all = this.all();
			all[id] = data;
			localStorage.setItem(this.key, JSON.stringify(all));
		} catch (e) {
			/* storage unavailable: learning still works for this match */
		}
	},
	clear() {
		try {
			localStorage.removeItem(this.key);
		} catch (e) {
			/* nothing to clear */
		}
	},
	count() {
		return Object.values(this.all()).reduce((n, d) => n + (d.samples || 0), 0);
	},
};

const LEARNER_STYLES = {
	red: { color: '#f87171', rgb: '248,113,113', ghost: 'grayscale(1) sepia(1) hue-rotate(-40deg) saturate(6) brightness(1.1)' },
	blue: { color: '#60a5fa', rgb: '96,165,250', ghost: 'grayscale(1) sepia(1) hue-rotate(180deg) saturate(5) brightness(1.2)' },
};

class Learner {
	// 'CPU AI', 'YOUR AI' ... in the current language
	get name() {
		return tx(`ai.${this.nameKey}`);
	}
	// opts: { name, style: 'red' | 'blue', memKey }
	constructor(watcher, target, levelKey, opts = {}) {
		this.watcher = watcher; // the fighter whose AI is learning
		this.target = target; // the fighter being studied
		this.rate = AI_LEVELS[levelKey].learn;
		this.nameKey = opts.name || 'cpu';
		const st = LEARNER_STYLES[opts.style || 'red'];
		this.color = st.color;
		this.rgb = st.rgb;
		this.ghostFilter = st.ghost;
		this.memKey = opts.memKey || null;
		this.memSamples = 0;
		this.t1 = {};
		this.t2 = {};
		this.sit = {};
		this.prev = 'start';
		this.prev2 = 'start';
		this.samples = 0;
		this.hits = [];
		this.roundAcc = [];
		this.patterns = new Set();
		this.log = [];
		this.heat = new Array(16).fill(0);
		this.trail = [];
		this.pred = null;
		this.flash = null;
		this.stamp = null;
		this.counter = null;
		this.pulse = 0;
		this.ctxKey = '';
		this.runRel = 0;
		this.runFrames = 0;
		this.runEmitted = false;
		this.idleFrames = 0;
		this.box = null;
		this.loadMemory();
		this.predict();
	}

	// ----- memory between matches -----
	loadMemory() {
		const m = this.memKey && AIMemory.get(this.memKey);
		if (!m) return;
		this.t1 = m.t1 || {};
		this.t2 = m.t2 || {};
		this.sit = m.sit || {};
		this.memSamples = m.samples || 0;
		// start part-way confident, but keep room to learn this match
		this.samples = Math.min(this.memSamples, 30);
		(m.patterns || []).forEach((p) => this.patterns.add(p));
		this.addLog(tx('vis.loaded', { n: this.memSamples }), 'info');
	}
	saveMemory() {
		if (!this.memKey) return;
		AIMemory.set(this.memKey, {
			t1: this.t1,
			t2: this.t2,
			sit: this.sit,
			samples: this.memSamples + this.newSamples(),
			patterns: [...this.patterns],
		});
	}
	newSamples() {
		return this.samples - Math.min(this.memSamples, 30);
	}

	// ----- situation -----
	distBucket() {
		const d = Math.abs(this.watcher.centerX - this.target.centerX);
		return d < 220 ? 'close' : d < 420 ? 'mid' : 'far';
	}
	cpuState() {
		const w = this.watcher;
		return w.stun > 0 ? 'hurt' : w.move ? 'attack' : w.blocking ? 'guard' : 'free';
	}
	context() {
		return `${this.distBucket()}|${this.cpuState()}`;
	}

	// ----- learning -----
	bump(table, key, action) {
		const row = table[key] || (table[key] = {});
		for (const a in row) row[a] *= LEARN_DECAY;
		row[action] = (row[action] || 0) + 1;
	}
	rowDist(row) {
		if (!row) return null;
		let n = 0;
		for (const a in row) n += row[a];
		return n > 0 ? { row, n } : null;
	}
	distribution() {
		const probs = {};
		LEARN_ACTIONS.forEach((a) => (probs[a] = 0.3 / LEARN_ACTIONS.length)); // small even prior
		const sources = [
			[this.rowDist(this.t2[`${this.prev2}>${this.prev}`]), 1.3],
			[this.rowDist(this.t1[this.prev]), 1],
			[this.rowDist(this.sit[this.context()]), 0.8],
		];
		for (const [src, weight] of sources) {
			if (!src) continue;
			const trust = (src.n / (src.n + 2)) * weight;
			for (const a in src.row) probs[a] += (trust * src.row[a]) / src.n;
		}
		let sum = 0;
		for (const a in probs) sum += probs[a];
		for (const a in probs) probs[a] /= sum;
		return probs;
	}
	predict() {
		const probs = this.distribution();
		let top = 'wait';
		for (const a of LEARN_ACTIONS) if (probs[a] > probs[top]) top = a;
		this.pred = { probs, top, p: probs[top] };
		this.ctxKey = this.context();
	}

	record(action, tick) {
		if (this.pred && this.samples >= 2) {
			const hit = this.pred.top === action;
			this.hits.push(hit ? 1 : 0);
			if (this.hits.length > 20) this.hits.shift();
			this.flash = { ok: hit, label: LEARN_LABEL[this.pred.top], t: 45 };
			this.addLog(`${LEARN_LABEL[this.prev]} > ${LEARN_LABEL[action]}`, hit ? 'hit' : 'miss');
		} else {
			this.addLog(tx('vis.saw', { a: LEARN_LABEL[action] }), 'info');
		}
		this.bump(this.t1, this.prev, action);
		this.bump(this.t2, `${this.prev2}>${this.prev}`, action);
		this.bump(this.sit, this.context(), action);
		this.samples++;
		this.pulse = 1;

		// a strong habit becomes a "pattern"
		const r = this.rowDist(this.t1[this.prev]);
		const key = `${this.prev}>${action}`;
		if (this.prev !== 'start' && r && r.n >= 3 && r.row[action] / r.n >= 0.6 && !this.patterns.has(key)) {
			this.patterns.add(key);
			this.stamp = { text: `${LEARN_LABEL[this.prev]} > ${LEARN_LABEL[action]}`, t: 110 };
			this.addLog(tx('vis.pattern', { a: LEARN_LABEL[this.prev], b: LEARN_LABEL[action] }), 'pattern');
			Sound.tone({ freq: 520, to: 1040, type: 'square', dur: 0.18, vol: 0.08 });
		}
		this.prev2 = this.prev;
		this.prev = action;
		this.idleFrames = 0;
		this.predict();
	}

	noteCounter(label) {
		this.counter = { text: label, t: 50 };
		this.addLog(tx('vis.counter', { c: label }), 'counter');
	}

	addLog(text, kind) {
		this.log.push({ text, kind, age: 0 });
		if (this.log.length > 6) this.log.shift();
	}

	// called every live frame
	observe(tick) {
		const tg = this.target;
		// air attacks count as quick attacks; parries already show up as a block press
		this.target.events.splice(0).forEach((e) => {
			if (e === 'parry') return;
			this.record(e === 'air' ? 'light' : e, tick);
		});

		// walking toward or away from the CPU counts as an action once it lasts 8 frames
		const toCpu = sign(this.watcher.centerX - tg.centerX);
		const rel = tg.running ? sign(tg.velocity.x) * toCpu : 0;
		if (rel !== this.runRel) {
			this.runRel = rel;
			this.runFrames = 0;
			this.runEmitted = false;
		} else if (rel !== 0 && ++this.runFrames >= 8 && !this.runEmitted) {
			this.runEmitted = true;
			this.record(rel > 0 ? 'approach' : 'retreat', tick);
		}
		if (tg.canAct() && !tg.running && ++this.idleFrames >= 55) this.record('wait', tick);

		// the situation changed, so refresh the guess
		if (this.context() !== this.ctxKey) this.predict();

		if (tick % 3 === 0) {
			this.trail.push({ x: tg.centerX, y: tg.feetY - tg.height * 0.5 });
			if (this.trail.length > 28) this.trail.shift();
		}
		const bin = clamp(Math.floor((tg.centerX / W) * this.heat.length), 0, this.heat.length - 1);
		this.heat[bin] += 1;
		for (let i = 0; i < this.heat.length; i++) this.heat[i] *= 0.9985;

		if (this.flash && --this.flash.t <= 0) this.flash = null;
		if (this.stamp && --this.stamp.t <= 0) this.stamp = null;
		if (this.counter && --this.counter.t <= 0) this.counter = null;
		this.pulse *= 0.92;
		this.log.forEach((l) => l.age++);
	}

	// the player's most common action so far (used by story dialogue)
	topHabit() {
		const totals = {};
		[this.sit, this.t1].forEach((table) => {
			for (const k in table) for (const a in table[k]) totals[a] = (totals[a] || 0) + table[k][a];
		});
		let best = null;
		for (const a in totals) if (a !== 'wait' && (!best || totals[a] > totals[best])) best = a;
		return best;
	}

	get confidence() {
		return this.samples / (this.samples + 12);
	}
	get accuracy() {
		if (this.hits.length < 3) return null;
		return this.hits.reduce((a, b) => a + b, 0) / this.hits.length;
	}
	roundEnd() {
		this.roundAcc.push(this.accuracy);
	}
	reset() {
		this.trail = [];
		this.flash = null;
		this.counter = null;
		this.box = null;
		this.target.events.length = 0;
	}
}
