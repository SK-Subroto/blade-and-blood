// ---------- Input: keyboard + touch, with a short press buffer ----------

const BUFFER_FRAMES = 8; // a press is remembered this long, so slightly early inputs still come out

class InputState {
	constructor() {
		this.down = {};
		this.buffer = {};
	}
	press(action) {
		if (!this.down[action]) this.buffer[action] = BUFFER_FRAMES;
		this.down[action] = true;
	}
	release(action) {
		this.down[action] = false;
	}
	held(action) {
		return !!this.down[action];
	}
	take(action) {
		if (this.buffer[action] > 0) {
			this.buffer[action] = 0;
			return true;
		}
		return false;
	}
	tick() {
		for (const k in this.buffer) if (this.buffer[k] > 0) this.buffer[k]--;
	}
	clear() {
		this.down = {};
		this.buffer = {};
	}
}

// Player 1 uses WASD + J/K/L/U (Space also works for light attack, as in the original).
// Player 2 (two-player mode) uses the arrow keys + numpad 1/2/3/5 or , . / '
const KEYMAP_P1 = {
	KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'block',
	Space: 'light', KeyJ: 'light', KeyK: 'heavy', KeyL: 'special', KeyU: 'super', KeyI: 'super',
	ShiftLeft: 'dash', KeyH: 'dash', KeyO: 'throw',
};
const KEYMAP_P2 = {
	ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'block',
	Numpad1: 'light', Comma: 'light', Numpad2: 'heavy', Period: 'heavy',
	Numpad3: 'special', Slash: 'special', Numpad5: 'super', Quote: 'super',
	ShiftRight: 'dash', Numpad0: 'dash', Numpad6: 'throw', Semicolon: 'throw',
};
// In single-player mode the arrow keys also drive player 1.
const KEYMAP_P1_SOLO_EXTRA = {
	ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'block',
};

const p1Input = new InputState();
const p2Input = new InputState();

function setupKeyboard(getMode, onPause) {
	const route = (code) => {
		const solo = getMode() !== 'pvp';
		if (KEYMAP_P1[code]) return [p1Input, KEYMAP_P1[code]];
		if (solo && KEYMAP_P1_SOLO_EXTRA[code]) return [p1Input, KEYMAP_P1_SOLO_EXTRA[code]];
		if (!solo && KEYMAP_P2[code]) return [p2Input, KEYMAP_P2[code]];
		return null;
	};
	window.addEventListener('keydown', (e) => {
		// while a menu is open, keys belong to the menu buttons
		const panel = document.body.dataset.panel;
		if (panel && panel !== 'pause') return;
		if (e.code === 'Escape' || e.code === 'KeyP') {
			onPause();
			return;
		}
		if (panel === 'pause') return;
		const r = route(e.code);
		if (!r) return;
		e.preventDefault();
		if (e.repeat) return;
		r[0].press(r[1]);
	});
	window.addEventListener('keyup', (e) => {
		const r = route(e.code);
		if (r) r[0].release(r[1]);
	});
	window.addEventListener('blur', () => {
		p1Input.clear();
		p2Input.clear();
	});
}

function setupTouch(root) {
	root.querySelectorAll('[data-action]').forEach((btn) => {
		const action = btn.dataset.action;
		const down = (e) => {
			e.preventDefault();
			btn.setPointerCapture?.(e.pointerId);
			btn.classList.add('is-down');
			Sound.init();
			p1Input.press(action);
		};
		const up = (e) => {
			e.preventDefault();
			btn.classList.remove('is-down');
			p1Input.release(action);
		};
		btn.addEventListener('pointerdown', down);
		btn.addEventListener('pointerup', up);
		btn.addEventListener('pointercancel', up);
		btn.addEventListener('lostpointercapture', up);
		btn.addEventListener('contextmenu', (e) => e.preventDefault());
	});
}

// ---------- swipe up to jump (left half of the screen) ----------
// Works over the arena and over the left-hand buttons, so you can slide a thumb up from
// the arrows to jump without letting go.
const SWIPE_DIST = 38; // pixels upward
const SWIPE_TIME = 350; // ms
function setupSwipe() {
	const starts = new Map();
	const inGame = () => {
		const panel = document.body.dataset.panel;
		return !panel || panel === '';
	};
	window.addEventListener(
		'pointerdown',
		(e) => {
			if (e.pointerType !== 'touch' || !inGame() || e.clientX > window.innerWidth / 2) return;
			starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false });
		},
		{ passive: true }
	);
	window.addEventListener(
		'pointermove',
		(e) => {
			const s = starts.get(e.pointerId);
			if (!s || s.fired) return;
			const dy = s.y - e.clientY;
			if (performance.now() - s.t > SWIPE_TIME) {
				// slow drags restart the gesture from here, so a held arrow can still swipe
				Object.assign(s, { x: e.clientX, y: e.clientY, t: performance.now() });
				return;
			}
			if (dy > SWIPE_DIST && dy > Math.abs(e.clientX - s.x)) {
				s.fired = true;
				p1Input.press('jump');
				setTimeout(() => p1Input.release('jump'), 80);
				swipeSeen();
			}
		},
		{ passive: true }
	);
	const end = (e) => starts.delete(e.pointerId);
	window.addEventListener('pointerup', end, { passive: true });
	window.addEventListener('pointercancel', end, { passive: true });
}

function swipeSeen() {
	const tip = document.getElementById('touch-tip');
	if (tip) tip.hidden = true;
	if (!Progress.data.settings.swipeSeen) {
		Progress.data.settings.swipeSeen = true;
		Progress.save();
	}
}

// ---------- vibration on Android (navigator.vibrate; iPhones ignore it) ----------
const Haptics = {
	// only buzz for a person holding this device, during a real match
	buzz(pattern) {
		if (!navigator.vibrate || !Settings.get('vibration') || !document.body.classList.contains('has-touch')) return;
		if (Game.state === 'demo' || Game.mode === 'aivai' || (Game.mode === 'cpu' && Game.autopilot)) return;
		try {
			navigator.vibrate(pattern);
		} catch (e) {
			/* some browsers block vibration */
		}
	},
	// the fighter held on this device (on Wi-Fi the guest plays the right-hand one)
	get me() {
		return Game.mode === 'net' && Net.role === 'guest' ? enemy : player;
	},
	// att hit def; vibrate when the person on this device is either one
	hit(att, def, heavy) {
		if (def === this.me) this.buzz(heavy ? 45 : 22);
		else if (att === this.me) this.buzz(heavy ? 18 : 8);
	},
	parry(def) {
		if (def === this.me) this.buzz([12, 40, 12]);
	},
	throwSlam(att, def) {
		if (att === this.me || def === this.me) this.buzz(60);
	},
	ko() {
		this.buzz([90, 60, 160]);
	},
};
