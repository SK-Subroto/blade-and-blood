// ---------- Match stats: hits, accuracy, combos ----------
// Accuracy counts each attack once: an attack is "on target" if any of its hits connected
// (hit or blocked), so multi-hit moves and fireball volleys can't push it over 100%.

const ATTACK_MOVES = ['light', 'heavy', 'special', 'super', 'air', 'breaker'];

const MatchStats = {
	active: false,
	sides: null,

	reset() {
		this.active = true;
		this.sides = [0, 1].map(() => ({ thrown: 0, onTarget: new Set(), hits: 0, damage: 0, bestCombo: 0, blocks: 0, parries: 0, throws: 0, specials: 0, supers: 0 }));
	},
	side(f) {
		return this.sides[f === player ? 0 : 1];
	},
	onMove(f, name) {
		if (!this.active) return;
		const s = this.side(f);
		if (ATTACK_MOVES.includes(name)) s.thrown++;
		if (name === 'special') s.specials++;
		if (name === 'super') s.supers++;
	},
	onConnect(att, props) {
		if (!this.active || props.throw) return;
		this.side(att).onTarget.add(props.moveId ?? att.moveId);
	},
	onHit(att, props, damage) {
		if (!this.active) return;
		const s = this.side(att);
		s.hits++;
		s.damage += damage;
		s.bestCombo = Math.max(s.bestCombo, att.combo);
	},
	onBlock(def) {
		if (this.active) this.side(def).blocks++;
	},
	onParry(def) {
		if (this.active) this.side(def).parries++;
	},
	onThrow(att) {
		if (this.active) this.side(att).throws++;
	},
	accuracy(s) {
		return s.thrown ? Math.min(1, s.onTarget.size / s.thrown) : null;
	},

	// fills a <table> with both fighters side by side
	render(table, leftName, rightName) {
		const [a, b] = this.sides || this.emptyPair();
		const pct = (s) => {
			const v = this.accuracy(s);
			return v === null ? '--' : `${Math.round(v * 100)}%`;
		};
		const rows = [
			[tx('st.damage'), (s) => Math.round(s.damage)],
			[tx('st.hits'), (s) => s.hits],
			[tx('st.accuracy'), pct],
			[tx('st.combo'), (s) => s.bestCombo],
			[tx('st.blocks'), (s) => s.blocks],
			[tx('st.parries'), (s) => s.parries],
			[tx('st.throws'), (s) => s.throws],
			[tx('st.specials'), (s) => `${s.specials} / ${s.supers}`],
		];
		table.innerHTML = '';
		const head = table.createTHead().insertRow();
		[leftName, '', rightName].forEach((t, i) => {
			const th = document.createElement('th');
			th.textContent = t;
			th.scope = 'col';
			if (i === 1) th.className = 'st-label';
			head.append(th);
		});
		const body = table.createTBody();
		rows.forEach(([label, fn]) => {
			const tr = body.insertRow();
			const va = fn(a);
			const vb = fn(b);
			const na = parseFloat(va);
			const nb = parseFloat(vb);
			const cells = [va, label, vb];
			cells.forEach((t, i) => {
				const td = tr.insertCell();
				td.textContent = i === 1 ? String(t) : localDigits(t);
				if (i === 1) td.className = 'st-label';
				// highlight the better number in each row
				else if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb && (i === 0 ? na > nb : nb > na)) td.className = 'st-best';
			});
		});
	},
	emptyPair() {
		this.reset();
		this.active = false;
		return this.sides;
	},
};
