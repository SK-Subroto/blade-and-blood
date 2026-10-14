// ---------- Quick chat: preset lines for Wi-Fi and online matches ----------
// A player picks a line from the Chat menu (or presses 1-8). It pops up in a speech bubble
// on their side of the screen, on both devices, with a sound. Only the line's number is
// sent, so each player reads it in their own language. Chat never touches the fight itself,
// so it can't knock the two devices out of step.

const CHAT_LINES = ['haha', 'ready', 'bringIt', 'nice', 'easy', 'loser', 'gg', 'oneMore'];
const CHAT_GAP_MS = 1200; // one line at a time, so nobody can flood the screen
const CHAT_SHOW_MS = 2600;

const Chat = {
	lastSent: 0,
	lastGot: 0,
	bubbles: { left: null, right: null },

	el(id) {
		return document.getElementById(id);
	},
	build() {
		const chip = this.el('btn-chat');
		const menu = this.el('chat-menu');
		chip.addEventListener('click', () => {
			Sound.init();
			this.toggle(menu.hidden);
		});
		menu.addEventListener('keydown', (e) => {
			const items = [...menu.querySelectorAll('button')];
			const i = items.indexOf(document.activeElement);
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
			}
		});
		// tapping anywhere else closes the menu
		document.addEventListener('pointerdown', (e) => {
			if (!menu.hidden && !menu.contains(e.target) && e.target !== chip) this.toggle(false);
		});
		// 1-8 send a line; Escape closes the menu (before it can pause the game)
		window.addEventListener(
			'keydown',
			(e) => {
				if (!Net.connected) return;
				if (e.key === 'Escape' && !menu.hidden) {
					e.stopImmediatePropagation();
					this.toggle(false, true);
					return;
				}
				if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
				const n = /^Digit([1-8])$/.exec(e.code);
				if (n) this.send(Number(n[1]) - 1);
			},
			{ capture: true }
		);
		this.refresh();
	},
	// labels in the current language (called again when the language changes)
	refresh() {
		const menu = this.el('chat-menu');
		menu.innerHTML = '';
		CHAT_LINES.forEach((key, i) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.setAttribute('role', 'menuitem');
			const num = document.createElement('kbd');
			num.textContent = i + 1; // the keyboard key, so not turned into Bengali digits
			b.append(num, ' ', tx(`chat.${key}`));
			b.addEventListener('click', () => this.send(i));
			menu.append(b);
		});
		menu.setAttribute('aria-label', tx('chat.menu'));
	},
	toggle(open, focusChip = false) {
		const menu = this.el('chat-menu');
		const chip = this.el('btn-chat');
		menu.hidden = !open;
		chip.setAttribute('aria-expanded', String(open));
		if (open) menu.querySelector('button')?.focus({ preventScroll: true });
		else if (focusChip) chip.focus({ preventScroll: true });
	},
	// shown while connected to another player
	setAvailable(on) {
		this.el('btn-chat').hidden = !on;
		if (!on) {
			this.toggle(false);
			this.clear();
		}
	},

	mySide() {
		return Net.role === 'host' ? 'left' : 'right';
	},
	send(i) {
		const now = performance.now();
		if (!Net.connected || !CHAT_LINES[i] || now - this.lastSent < CHAT_GAP_MS) return;
		this.lastSent = now;
		Net.send({ t: 'chat', c: i });
		this.show(this.mySide(), i, true);
		this.toggle(false);
		// back to the fight, so the next key press moves your fighter
		if (!document.body.dataset.panel) canvas.focus({ preventScroll: true });
	},
	receive(i) {
		const now = performance.now();
		if (!Number.isInteger(i) || !CHAT_LINES[i] || now - this.lastGot < CHAT_GAP_MS / 2) return;
		this.lastGot = now;
		this.show(this.mySide() === 'left' ? 'right' : 'left', i, false);
	},
	show(side, i, mine) {
		const old = this.bubbles[side];
		if (old) old.remove();
		const b = document.createElement('p');
		b.className = `chat-bubble ${side}${mine ? ' mine' : ''}`;
		const who = document.createElement('small');
		who.textContent = tx(mine ? 'chat.you' : 'chat.them');
		b.append(who, tx(`chat.${CHAT_LINES[i]}`));
		this.el('chat-layer').append(b);
		this.bubbles[side] = b;
		if (mine) Sound.chatSend();
		else Sound.chatGet();
		setTimeout(() => b.classList.add('out'), CHAT_SHOW_MS);
		setTimeout(() => {
			b.remove();
			if (this.bubbles[side] === b) this.bubbles[side] = null;
		}, CHAT_SHOW_MS + 300);
	},
	clear() {
		this.el('chat-layer').innerHTML = '';
		this.bubbles = { left: null, right: null };
	},
};
