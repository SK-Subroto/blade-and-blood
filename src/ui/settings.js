// ---------- Settings (saved with progress in this browser) ----------
// Round time and rounds to win are read when a match starts, so changing them from the
// pause menu takes effect from the next match.

const SETTING_OPTIONS = {
	// language first, so it is easy to find; Bengali by default on Bengali-language browsers
	language: { label: 'set.language', values: ['en', 'bn'], names: () => ['English', 'বাংলা'], def: /^bn\b/i.test(navigator.language || '') ? 'bn' : 'en' },
	roundTime: { label: 'set.roundTime', values: [30, 60, 99], names: () => [30, 60, 99].map((n) => tx('opt.sec', { n })), def: 60 },
	roundsToWin: { label: 'set.roundsToWin', values: [1, 2, 3], names: () => [tx('opt.round1'), tx('opt.bestOf3'), tx('opt.bestOf5')], def: 2 },
	speed: { label: 'set.speed', values: [1, 1.25, 1.5], names: () => [tx('opt.normal'), tx('opt.fast'), tx('opt.turbo')], def: 1 },
	music: { label: 'set.music', values: [0, 0.35, 0.7, 1], names: () => [tx('opt.off'), tx('opt.low'), tx('opt.mid'), tx('opt.high')], def: 0.7 },
	sfx: { label: 'set.sfx', values: [0, 0.35, 0.7, 1], names: () => [tx('opt.off'), tx('opt.low'), tx('opt.mid'), tx('opt.high')], def: 0.7 },
	vibration: { label: 'set.vibration', values: [true, false], names: () => [tx('opt.on'), tx('opt.off')], def: true },
	aiVision: { label: 'set.aiVision', values: [true, false], names: () => [tx('opt.on'), tx('opt.off')], def: true },
};

const Settings = {
	get(key) {
		const v = Progress.data.settings[key];
		return SETTING_OPTIONS[key].values.includes(v) ? v : SETTING_OPTIONS[key].def;
	},
	set(key, value) {
		Progress.data.settings[key] = value;
		Progress.save();
		this.apply(key);
	},
	// push a setting into the systems that use it
	apply(key) {
		if (key === 'sfx' || key === 'music' || !key) Sound.setVolumes();
		if (key === 'aiVision' || !key) setAIVision(this.get('aiVision'), true);
		if (key === 'language') setLanguage(this.get('language'));
	},
};

const SettingsPanel = {
	returnTo: 'menu',
	build() {
		this.buildRows();
		window.addEventListener('keydown', (e) => {
			if (e.code === 'Escape' && document.body.dataset.panel === 'settings') this.close();
		});
		document.getElementById('set-done').addEventListener('click', () => {
			Sound.click();
			this.close();
		});
		const reset = document.getElementById('set-reset');
		reset.addEventListener('click', () => {
			// two clicks so nobody wipes their progress by accident
			if (reset.dataset.armed !== 'true') {
				reset.dataset.armed = 'true';
				reset.textContent = tx('set.resetConfirm');
				clearTimeout(this.resetTimer);
				this.resetTimer = setTimeout(() => this.disarm(), 3000);
				return;
			}
			const settings = Progress.data.settings;
			Progress.reset();
			Progress.data.settings = settings; // keep settings, erase progress
			Progress.save();
			reset.dataset.armed = 'false';
			reset.textContent = tx('set.resetDone');
			clearTimeout(this.resetTimer);
			this.resetTimer = setTimeout(() => this.disarm(), 1500);
			Select.refresh();
			updateMenuProgress();
		});
	},
	// the option rows; rebuilt when the language changes
	buildRows() {
		const list = document.getElementById('set-list');
		list.innerHTML = '';
		for (const key in SETTING_OPTIONS) {
			const o = SETTING_OPTIONS[key];
			const row = document.createElement('div');
			row.className = 'set-row';
			row.setAttribute('role', 'radiogroup');
			row.setAttribute('aria-label', tx(o.label));
			const name = document.createElement('span');
			name.className = 'set-name';
			name.textContent = tx(o.label);
			const opts = document.createElement('div');
			opts.className = 'set-opts';
			const names = o.names();
			o.values.forEach((v, i) => {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'seg';
				b.textContent = names[i];
				if (key === 'language') b.lang = v;
				b.setAttribute('role', 'radio');
				b.addEventListener('click', () => {
					Sound.init();
					Settings.set(key, v);
					this.refresh();
					Sound.click();
				});
				b.dataset.key = key;
				b.dataset.index = i;
				opts.append(b);
			});
			row.append(name, opts);
			list.append(row);
		}
	},
	disarm() {
		const reset = document.getElementById('set-reset');
		reset.dataset.armed = 'false';
		reset.textContent = tx('set.reset');
	},
	refresh() {
		document.querySelectorAll('#set-list .seg').forEach((b) => {
			const key = b.dataset.key;
			const on = SETTING_OPTIONS[key].values[b.dataset.index] === Settings.get(key);
			b.classList.toggle('on', on);
			b.setAttribute('aria-checked', String(on));
		});
		const midMatch = this.returnTo === 'pause';
		document.getElementById('set-note').hidden = !midMatch;
	},
	open(from) {
		this.returnTo = from || 'menu';
		this.disarm();
		this.refresh();
		showPanel('settings');
		document.querySelector('#set-list .seg.on')?.focus({ preventScroll: true });
	},
	close() {
		showPanel(this.returnTo);
		if (this.returnTo === 'menu') updateMenuProgress();
	},
};
