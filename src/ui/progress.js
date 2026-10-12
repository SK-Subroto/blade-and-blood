// ---------- Saved progress (this browser only) ----------
// Story chapter, unlocked bosses, the Hard level, win records and settings.
// Every read and write is wrapped in try/catch: storage can be blocked, and the game
// must still work, it just won't remember anything.

const Progress = {
	key: 'samurai-duel-progress-v1',
	data: null,
	defaults() {
		return { unlocked: [], story: null, hardUnlocked: false, records: {}, settings: {} };
	},
	load() {
		let d = null;
		try {
			d = JSON.parse(localStorage.getItem(this.key));
		} catch (e) {
			d = null;
		}
		this.data = Object.assign(this.defaults(), d || {});
		return this.data;
	},
	save() {
		try {
			localStorage.setItem(this.key, JSON.stringify(this.data));
		} catch (e) {
			/* storage unavailable: progress lasts until the page is closed */
		}
	},
	isUnlocked(key) {
		return !ROSTER[key].boss || this.data.unlocked.includes(key);
	},
	unlock(key) {
		if (!this.data.unlocked.includes(key)) {
			this.data.unlocked.push(key);
			this.save();
			return true;
		}
		return false;
	},
	isLevelUnlocked(level) {
		return level !== 'hard' || this.data.hardUnlocked;
	},
	// one finished match against the CPU; returns true if this win just unlocked Hard
	recordMatch({ fighter, level, won, combo, story }) {
		const r = this.data.records;
		r.fighters = r.fighters || {};
		r.levels = r.levels || {};
		const f = (r.fighters[fighter] = r.fighters[fighter] || { w: 0, l: 0 });
		won ? f.w++ : f.l++;
		if (!story) {
			const lv = (r.levels[level] = r.levels[level] || { w: 0, l: 0 });
			won ? lv.w++ : lv.l++;
		}
		r.bestCombo = Math.max(r.bestCombo || 0, combo || 0);
		r.matches = (r.matches || 0) + 1;
		let newHard = false;
		if (won && level === 'medium' && !this.data.hardUnlocked) {
			this.data.hardUnlocked = true;
			newHard = true;
		}
		this.save();
		return newHard;
	},
	fighterRecord(key) {
		return (this.data.records.fighters || {})[key] || { w: 0, l: 0 };
	},
	totals() {
		let w = 0;
		let l = 0;
		Object.values(this.data.records.fighters || {}).forEach((f) => {
			w += f.w;
			l += f.l;
		});
		return { w, l, bestCombo: this.data.records.bestCombo || 0 };
	},
	reset() {
		this.data = this.defaults();
		this.save();
	},
};
Progress.load();
