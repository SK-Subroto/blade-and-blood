// ---------- Character select screen ----------

function drawPortrait(ctx, key, frameIndex, size, face = 1) {
	const cfg = ROSTER[key];
	const idle = cfg.sprites.idle;
	const img = loadImage(cfg.folder + idle.file);
	ctx.clearRect(0, 0, size, size);
	if (!imageReady(img)) return;
	const fw = img.width / idle.frames;
	const frame = frameIndex % idle.frames;
	// crop a square around the body, feet at the bottom
	const body = cfg.hurt.h / cfg.scale;
	const cs = Math.min(body * 1.3, fw, img.height);
	let sx = cfg.anchor[0] - cs / 2;
	sx = clamp(sx, 0, fw - cs);
	const sy = clamp(cfg.anchor[1] + 3 - cs, 0, img.height - cs);
	ctx.save();
	ctx.imageSmoothingEnabled = false;
	if (cfg.facing !== face) {
		ctx.translate(size, 0);
		ctx.scale(-1, 1);
	}
	ctx.drawImage(img, frame * fw + sx, sy, cs, cs, 0, 0, size, size);
	ctx.restore();
}

// Fighters are shown a page at a time (six big tiles): heroes, more heroes, bosses
// (quick match shows everyone in one run of pages).
// Arrow keys move between tiles and roll over to the next or previous page at the edges;
// Q / E, Page Up / Page Down, the ◀ ▶ buttons, or a swipe also change page.
const SELECT_COLS = 3;
const SELECT_PER_PAGE = 6;

const Select = {
	mode: 'cpu',
	level: 'medium',
	step: 0,
	picks: [null, null],
	focusKey: 'mack',
	tiles: {},
	page: 0,

	// pages for the current mode (story mode has no boss page; quick match mixes everyone together)
	get pages() {
		const pages = [];
		if (this.mode === 'cpu') {
			for (let i = 0; i < ALL_FIGHTERS.length; i += SELECT_PER_PAGE) pages.push({ name: 'sel.fighters', keys: ALL_FIGHTERS.slice(i, i + SELECT_PER_PAGE) });
			return pages;
		}
		for (let i = 0; i < ROSTER_ORDER.length; i += SELECT_PER_PAGE) pages.push({ name: 'sel.heroes', keys: ROSTER_ORDER.slice(i, i + SELECT_PER_PAGE) });
		if (this.mode !== 'story') pages.push({ name: 'sel.bosses', keys: BOSS_ORDER.slice() });
		return pages;
	},
	pageOf(key) {
		return Math.max(0, this.pages.findIndex((p) => p.keys.includes(key)));
	},

	build() {
		const grid = document.getElementById('sel-grid');
		ALL_FIGHTERS.forEach((key) => {
			const cfg = ROSTER[key];
			const btn = document.createElement('button');
			btn.className = 'tile';
			btn.type = 'button';
			btn.dataset.key = key;
			btn.style.setProperty('--tile', cfg.bar);
			const cv = document.createElement('canvas');
			cv.width = cv.height = 96;
			const name = document.createElement('span');
			const badge = document.createElement('i');
			badge.className = 'badge';
			btn.append(cv, name, badge);
			btn.addEventListener('pointerenter', () => this.show(key));
			btn.addEventListener('focus', () => this.show(key));
			btn.addEventListener('click', () => this.pick(key));
			grid.append(btn);
			this.tiles[key] = { btn, ctx: cv.getContext('2d'), badge, name };
		});
		grid.addEventListener('keydown', (e) => this.onGridKey(e));
		document.getElementById('sel-prev').addEventListener('click', () => this.turn(-1));
		document.getElementById('sel-next').addEventListener('click', () => this.turn(1));
		// swipe left or right on the grid to change page
		let swipe = null;
		grid.addEventListener('pointerdown', (e) => (swipe = { x: e.clientX, y: e.clientY }));
		grid.addEventListener('pointerup', (e) => {
			if (!swipe) return;
			const dx = e.clientX - swipe.x;
			if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) this.turn(dx < 0 ? 1 : -1);
			swipe = null;
		});
		document.getElementById('sel-back').addEventListener('click', () => this.back());
		document.getElementById('sel-random').addEventListener('click', () => {
			const k = randomPick(this.step === 1 ? this.picks[0] : null);
			this.focusOn(k);
			this.pick(k);
		});
		document.getElementById('select').addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				this.back();
			} else if (['PageUp', 'PageDown', 'q', 'e', 'Q', 'E'].includes(e.key)) {
				e.preventDefault();
				this.turn(['PageUp', 'q', 'Q'].includes(e.key) ? -1 : 1);
			}
		});
		this.previewCtx = document.getElementById('sel-preview').getContext('2d');
		this.show('mack');
	},

	onGridKey(e) {
		const key = document.activeElement?.dataset?.key;
		if (!key) return;
		const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
		if (!move) return;
		e.preventDefault();
		const pages = this.pages;
		const keys = pages[this.page].keys;
		const i = keys.indexOf(key);
		const col = i % SELECT_COLS;
		const row = Math.floor(i / SELECT_COLS);
		const rowLen = Math.min(SELECT_COLS, keys.length - row * SELECT_COLS);
		if (move[0]) {
			const nc = col + move[0];
			if (nc >= 0 && nc < rowLen) return this.focusOn(keys[i + move[0]]);
			// past the edge: the next or previous page, same row
			const p = (this.page + move[0] + pages.length) % pages.length;
			const pk = pages[p].keys;
			const r = Math.min(row, Math.floor((pk.length - 1) / SELECT_COLS));
			const c = move[0] > 0 ? 0 : Math.min(SELECT_COLS, pk.length - r * SELECT_COLS) - 1;
			return this.focusOn(pk[r * SELECT_COLS + c]);
		}
		const ni = i + move[1] * SELECT_COLS;
		if (ni >= 0 && ni < keys.length) this.focusOn(keys[ni]);
		else if (move[1] > 0 && row * SELECT_COLS + SELECT_COLS < keys.length) this.focusOn(keys[keys.length - 1]);
	},

	// go to the page holding `key`, then focus its tile
	focusOn(key) {
		const p = this.pageOf(key);
		if (p !== this.page) this.showPage(p);
		this.show(key);
		this.tiles[key].btn.focus({ preventScroll: true });
	},
	turn(dir) {
		const pages = this.pages;
		const p = (this.page + dir + pages.length) % pages.length;
		Sound.click();
		this.showPage(p);
		this.focusOn(pages[p].keys[0]);
	},
	showPage(p) {
		const pages = this.pages;
		this.page = clamp(p, 0, pages.length - 1);
		const page = pages[this.page];
		for (const k in this.tiles) this.tiles[k].btn.hidden = !page.keys.includes(k);
		// number the hero pages only when there is more than one
		const same = pages.filter((q) => q.name === page.name);
		const label = tx(page.name);
		document.getElementById('sel-page').textContent = same.length > 1 ? tx('sel.page', { name: label, n: same.indexOf(page) + 1, m: same.length }) : label;
		const dots = document.getElementById('sel-dots');
		dots.innerHTML = '';
		pages.forEach((_, i) => {
			const d = document.createElement('b');
			if (i === this.page) d.className = 'on';
			dots.append(d);
		});
		document.getElementById('sel-pager').hidden = pages.length < 2;
		this.drawTiles(0, true);
	},

	open(mode, level) {
		this.mode = mode;
		this.level = level;
		this.step = 0;
		this.picks = [null, null];
		this.refresh();
		showPanel('select');
		const start = this.pages.some((p) => p.keys.includes(Game.picks[0])) ? Game.picks[0] : 'mack';
		this.page = -1;
		this.focusOn(start);
	},

	isPickable(key) {
		if (this.mode === 'story') return !ROSTER[key].boss;
		return Progress.isUnlocked(key);
	},

	refresh() {
		for (const key in this.tiles) {
			const tile = this.tiles[key];
			const ok = this.isPickable(key);
			const ft = fighterText(key);
			tile.btn.classList.toggle('locked', !ok);
			tile.name.textContent = ok || this.mode === 'story' ? ft.short : '???';
			tile.btn.setAttribute('aria-label', ok ? `${ft.name}, ${ft.title}` : tx('sel.locked'));
			tile.btn.setAttribute('aria-disabled', String(!ok));
		}
		document.getElementById('sel-prev').setAttribute('aria-label', tx('sel.prev'));
		document.getElementById('sel-next').setAttribute('aria-label', tx('sel.next'));
		const title = document.getElementById('sel-title');
		const back = document.getElementById('sel-back');
		const clearBadges = () => {
			for (const key in this.tiles) {
				this.tiles[key].badge.textContent = '';
				this.tiles[key].btn.classList.remove('picked');
			}
		};
		if (this.mode === 'net') {
			title.textContent = tx('sel.net', { side: tx(Net.role === 'host' ? 'side.left' : 'side.right') });
			back.textContent = tx('sel.leave');
			clearBadges();
		} else if (this.mode === 'story') {
			title.textContent = tx('sel.story');
			back.textContent = tx('sel.menu');
			clearBadges();
		} else {
			if (this.mode === 'aivai') title.textContent = tx(this.step === 0 ? 'sel.aiLeft' : 'sel.aiRight');
			else if (this.step === 0) title.textContent = tx(this.mode === 'pvp' ? 'sel.p1' : 'sel.choose');
			else title.textContent = this.mode === 'pvp' ? tx('sel.p2') : tx('sel.opponent', { level: levelName(this.level) });
			back.textContent = tx(this.step === 0 ? 'sel.menu' : 'sel.back');
			for (const key in this.tiles) {
				const tile = this.tiles[key];
				const isP1 = this.picks[0] === key;
				tile.badge.textContent = isP1 ? (this.mode === 'aivai' ? 'L' : 'P1') : '';
				tile.btn.classList.toggle('picked', isP1);
			}
		}
		if (this.page >= 0 && this.page < this.pages.length) this.showPage(this.page);
	},

	show(key) {
		this.focusKey = key;
		const cfg = ROSTER[key];
		const ft = fighterText(key);
		document.getElementById('sel-card').style.setProperty('--tile', cfg.bar);
		const hidden = this.mode !== 'story' && !Progress.isUnlocked(key);
		document.getElementById('sel-card').classList.toggle('is-locked', hidden);
		for (const k in this.tiles) this.tiles[k].btn.classList.toggle('focus', k === key);
		if (hidden) {
			document.getElementById('sel-name').textContent = tx('sel.locked');
			document.getElementById('sel-ttl').textContent = tx('sel.locked.sub');
			document.getElementById('sel-blurb').textContent = '';
			return;
		}
		document.getElementById('sel-name').textContent = ft.name;
		document.getElementById('sel-ttl').textContent = ft.title;
		document.getElementById('sel-blurb').textContent = ft.blurb;
		document.getElementById('sel-special').textContent = ft.special;
		document.getElementById('sel-super').textContent = ft.super;
		document.getElementById('sel-passive').textContent = `${ft.passiveName}: ${ft.passiveText}`;
		document.getElementById('sel-hp').textContent = localDigits(cfg.stats.health);
		const rec = Progress.fighterRecord(key);
		document.getElementById('sel-record').textContent = rec.w + rec.l ? tx('sel.recordVal', { w: rec.w, l: rec.l }) : tx('sel.noRecord');
		const stats = document.getElementById('sel-stats');
		stats.innerHTML = '';
		['power', 'speed', 'defense', 'range'].forEach((k) => {
			const dt = document.createElement('dt');
			dt.textContent = tx(`stat.${k}`);
			const dd = document.createElement('dd');
			dd.setAttribute('aria-label', tx('stat.of5', { n: cfg.ratings[k] }));
			for (let i = 0; i < 5; i++) {
				const pip = document.createElement('b');
				if (i < cfg.ratings[k]) pip.className = 'on';
				dd.append(pip);
			}
			stats.append(dt, dd);
		});
	},

	pick(key) {
		Sound.init();
		if (!this.isPickable(key)) {
			const tile = this.tiles[key];
			tile.btn.classList.remove('shake');
			void tile.btn.offsetWidth;
			tile.btn.classList.add('shake');
			Sound.block();
			return;
		}
		Sound.click();
		if (this.mode === 'story') return Story.newGame(key);
		if (this.mode === 'net') return Net.localPick(key);
		this.picks[this.step] = key;
		if (this.step === 0) {
			this.step = 1;
			this.refresh();
			this.focusOn(randomPick(key));
			return;
		}
		this.openArena();
	},

	// ----- arena step -----
	buildArenas() {
		const grid = document.getElementById('arena-grid');
		this.arenaThumbs = [];
		ARENA_ORDER.forEach((key) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'arena-card';
			btn.dataset.arena = key;
			const cv = document.createElement('canvas');
			cv.width = 256;
			cv.height = 144;
			const name = document.createElement('b');
			const blurb = document.createElement('small');
			btn.append(cv, name, blurb);
			btn.addEventListener('click', () => this.pickArena(key));
			grid.append(btn);
			this.arenaThumbs.push({ key, ctx: cv.getContext('2d'), name, blurb });
		});
		document.getElementById('arena-random').addEventListener('click', () => this.pickArena(randomArena()));
		document.getElementById('arena-back').addEventListener('click', () => {
			if (this.mode === 'net') return Net.openSelect();
			this.step = 1;
			this.refresh();
			showPanel('select');
		});
	},
	openArena() {
		if (!this.arenaThumbs) this.buildArenas();
		this.arenaThumbs.forEach((a) => {
			ARENAS[a.key].thumb(a.ctx, 256, 144);
			a.name.textContent = tx(`arena.${a.key}`).toUpperCase();
			a.blurb.textContent = tx(`arena.${a.key}.sub`);
		});
		document.getElementById('arena-sub').textContent = tx('arena.vs', { a: fighterText(this.picks[0]).short, b: fighterText(this.picks[1]).short });
		showPanel('arena');
		const current = document.querySelector(`[data-arena="${Game.arena}"]`) || document.querySelector('.arena-card');
		current.focus({ preventScroll: true });
	},
	pickArena(key) {
		Sound.click();
		if (this.mode === 'net') return Net.startHost(key);
		startMatch(this.mode, this.level, this.picks[0], this.picks[1], key);
	},

	back() {
		if (this.step === 1) {
			this.step = 0;
			this.picks = [null, null];
			this.refresh();
			this.focusOn(this.focusKey);
			return;
		}
		if (this.mode === 'cpu') return openQuickMatch();
		goToMenu();
	},

	// tile portraits: the focused fighter animates, locked bosses are shadows
	drawTiles(tick, all = false) {
		const f = Math.floor(tick / 6);
		const page = this.pages[this.page];
		if (!page) return;
		page.keys.forEach((k) => {
			if (!all && k !== this.focusKey && tick % 30 !== 0) return;
			const tile = this.tiles[k];
			drawPortrait(tile.ctx, k, k === this.focusKey ? f : 0, 96);
			if (!Progress.isUnlocked(k) && this.mode !== 'story') {
				tile.ctx.save();
				tile.ctx.globalCompositeOperation = 'source-atop';
				tile.ctx.fillStyle = '#0d0b14';
				tile.ctx.fillRect(0, 0, 96, 96);
				tile.ctx.restore();
			}
		});
	},

	animate(tick) {
		const cfg = ROSTER[this.focusKey];
		const pc = this.previewCtx;
		drawPortrait(pc, this.focusKey, Math.floor(tick / cfg.sprites.idle.hold), pc.canvas.width);
		if (this.mode !== 'story' && !Progress.isUnlocked(this.focusKey)) {
			pc.save();
			pc.globalCompositeOperation = 'source-atop';
			pc.fillStyle = '#0d0b14';
			pc.fillRect(0, 0, pc.canvas.width, pc.canvas.height);
			pc.restore();
		}
		if (tick % 6 === 0) this.drawTiles(tick);
	},
};
