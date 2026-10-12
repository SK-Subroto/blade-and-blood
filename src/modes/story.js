// ---------- Story mode ----------
// Five chapters, one boss each. Before every fight the boss walks in, stops, and talks.
// One learning AI follows the player through the whole story, so later bosses already
// know the player's habits and say so.

const CHAPTERS = [
	{ boss: 'king', arena: 'forest', level: 'easy', hp: 1, dmg: 0.9, learn: 0.6 },
	{ boss: 'archmage', arena: 'castle', level: 'medium', hp: 0.7, dmg: 0.75, learn: 0.8 },
	{ boss: 'bladekeeper', arena: 'forest', level: 'medium', hp: 0.95, dmg: 0.95, learn: 0.9 },
	{ boss: 'bringer', arena: 'castle', level: 'medium', hp: 0.95, dmg: 0.9, learn: 1 },
	{ boss: 'demon', arena: 'castle', level: 'medium', hp: 0.85, dmg: 0.85, learn: 1 },
];

// how each boss describes the habit the AI found
const HABIT_TEXT = {
	light: 'lean on quick slashes',
	heavy: 'love slow, heavy swings',
	special: 'reach for your special move',
	super: 'save everything for your ultimate',
	jump: 'jump when you are nervous',
	dash: 'dash in without thinking',
	block: 'hide behind your guard',
	approach: 'always walk straight at your enemy',
	retreat: 'back away when pressed',
	throw: 'grab anyone who blocks',
	breaker: 'try to break every guard',
};

// what kind of voice each hero speaks with
const HERO_VOICE = {
	mack: 'honor', warrior: 'honor', knight: 'honor',
	kenji: 'cunning', huntress: 'cunning', martial: 'cunning', lbandit: 'cunning',
	medieval: 'wild', hbandit: 'wild',
	wizard: 'mystic',
};
const HERO_REPLIES = {
	honor: [
		'I kneel to no one. Step aside, Your Majesty.',
		'Habits can be broken. So can wizards.',
		'Then watch closely, steel. I am not the fighter I was.',
		'Not today. I still have a promise to keep.',
		'Then let us end this. The seal closes with you.',
	],
	cunning: [
		'Your crown would fetch a good price.',
		'If you know my habits, you know I am faster.',
		'Adapt all you want. I will already be gone.',
		'Funny. I was going to say the same about you.',
		'Every lord falls. You are just taller.',
	],
	wild: [
		'A king with no kingdom? Out of my way!',
		'Talk less. Fight more!',
		'Steel breaks if you hit it hard enough.',
		'Death? Finally, a real fight.',
		'Big words. Bigger target!',
	],
	mystic: [
		'Your kingdom fell. Your pride did not. Move.',
		'Fire is a child\'s spell. Let me show you shadow.',
		'Living steel. How interesting. Let me take you apart.',
		'We both serve the dark. Only I serve myself.',
		'Your power will make a fine addition to mine.',
	],
};

const STORY_OPENING = [
	{ who: 'narrator', text: 'Beneath the world, the Demon Lord has broken his seal.' },
	{ who: 'narrator', text: 'Four servants guard the road to him: the Fallen King, the Archmage, the Bladekeeper and the Bringer of Death.' },
	{ who: 'narrator', text: 'And they are learning. Every fight you win, they remember how you fought.' },
	{ who: 'narrator', text: 'One warrior walks the road to end it.' },
];

// {habit} is filled in from what the learning AI has seen
const STORY_SCENES = [
	{
		pre: [
			{ who: 'boss', text: 'Halt. These woods belong to my kingdom.' },
			{ who: 'hero', reply: 0 },
			{ who: 'boss', text: 'My kingdom fell to the dark. Now I guard its gate for the Demon Lord.' },
			{ who: 'boss', text: 'Kneel, or be cut down.' },
		],
		post: [
			{ who: 'boss', text: 'Strong... Go, then. The Archmage waits in the cold halls.' },
			{ who: 'boss', text: 'He watched our fight. He will not be so kind.' },
		],
		lose: 'Kneel. The throne is still mine.',
	},
	{
		pre: [
			{ who: 'boss', text: 'Another hero. The King\'s ghost spoke of you.' },
			{ who: 'boss', text: 'He says you {habit}. How predictable.' },
			{ who: 'hero', reply: 1 },
			{ who: 'boss', text: 'Let us see if fire can break a habit.' },
		],
		post: [{ who: 'boss', text: 'My flame... fades. The Bladekeeper will not tire as I did.' }],
		lose: 'Fire remembers every hand that wielded it. And yours shook.',
	},
	{
		pre: [
			{ who: 'boss', text: 'I was forged to guard the third gate.' },
			{ who: 'boss', text: 'I have studied every fight you won. You {habit}.' },
			{ who: 'hero', reply: 2 },
			{ who: 'boss', text: 'Steel learns. Steel adapts. Show me something new.' },
		],
		post: [{ who: 'boss', text: 'Then I was forged wrong... The Bringer of Death will finish this.' }],
		lose: 'Steel does not bend. You did.',
	},
	{
		pre: [
			{ who: 'boss', text: 'I have waited at the end of every road you walked.' },
			{ who: 'boss', text: 'Three guardians fell. Each one told me how you fight.' },
			{ who: 'boss', text: 'You {habit}. Death remembers.' },
			{ who: 'hero', reply: 3 },
		],
		post: [{ who: 'boss', text: 'You cheated me... for now. Beneath us, he wakes.' }],
		lose: 'Every story ends with me.',
	},
	{
		pre: [
			{ who: 'boss', text: 'SO. THE LITTLE WARRIOR ARRIVES.' },
			{ who: 'boss', text: 'MY SERVANTS TAUGHT ME EVERYTHING. YOU {habit}. I AM READY FOR IT.' },
			{ who: 'hero', reply: 4 },
			{ who: 'boss', text: 'BURN.' },
		],
		post: [{ who: 'boss', text: 'IMPOSSIBLE... THE SEAL... IT CLOSES...' }],
		lose: 'BURN, LITTLE WARRIOR. BURN.',
	},
];

const STORY_ENDING = [
	{ who: 'narrator', text: 'The seal closed with a sound like a held breath let go.' },
	{ who: 'narrator', text: 'The four guardians are free of the dark, and they will fight at your side now.' },
	{ who: 'narrator', text: 'The forest is quiet again. For now.' },
];

// the story in the current language (Bengali lives in js/i18n.js)
function storyText() {
	if (LANG === 'bn') return STORY_BN;
	return { habit: HABIT_TEXT, habitDefault: 'fight like everyone else', replies: HERO_REPLIES, opening: STORY_OPENING, scenes: STORY_SCENES, ending: STORY_ENDING };
}

// split text into whole letters, so a Bengali letter and its vowel sign appear together
function letters(text) {
	if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter(LANG, { granularity: 'grapheme' }).segment(text)].map((g) => g.segment);
	return [...text];
}

// ---------- dialogue box ----------
const Dialogue = {
	lines: [],
	i: 0,
	shown: 0,
	onDone: null,
	built: false,
	build() {
		this.built = true;
		this.el = document.getElementById('dialogue');
		this.nameEl = document.getElementById('dlg-name');
		this.lineEl = document.getElementById('dlg-line');
		this.portrait = document.getElementById('dlg-portrait');
		this.pctx = this.portrait.getContext('2d');
		this.el.addEventListener('click', (e) => {
			if (e.target.id === 'dlg-skip') return;
			this.advance();
		});
		document.getElementById('dlg-skip').addEventListener('click', () => this.finish());
		window.addEventListener('keydown', (e) => {
			if (document.body.dataset.panel !== 'dialogue') return;
			if (['Enter', 'Space', 'KeyJ', 'NumpadEnter'].includes(e.code)) {
				e.preventDefault();
				if (!e.repeat) this.advance();
			} else if (e.code === 'Escape') {
				e.preventDefault();
				this.finish();
			}
		});
	},
	show(lines, onDone) {
		if (!this.built) this.build();
		this.lines = lines;
		this.i = 0;
		this.onDone = onDone;
		showPanel('dialogue');
		this.startLine();
	},
	startLine() {
		const l = this.lines[this.i];
		this.full = l.text;
		this.parts = letters(l.text);
		this.shown = 0;
		this.speaker = l.who === 'narrator' ? null : l.who === 'hero' ? player : enemy;
		this.el.dataset.who = l.who;
		this.nameEl.textContent = this.speaker ? this.speaker.name : '';
		this.nameEl.style.color = this.speaker ? this.speaker.cfg.bar : '';
		this.portrait.hidden = !this.speaker;
		this.lineEl.textContent = '';
		Sound.click();
	},
	advance() {
		if (this.shown < this.parts.length) {
			this.shown = this.parts.length;
			this.lineEl.textContent = this.full;
			return;
		}
		if (++this.i < this.lines.length) this.startLine();
		else this.finish();
	},
	finish() {
		if (document.body.dataset.panel !== 'dialogue') return;
		hidePanels();
		const fn = this.onDone;
		this.onDone = null;
		if (fn) fn();
	},
	// called every frame while the box is open
	animate(tick) {
		if (this.shown < this.parts.length) {
			this.shown = Math.min(this.parts.length, this.shown + (LANG === 'bn' ? 0.6 : 0.9));
			this.lineEl.textContent = this.parts.slice(0, Math.floor(this.shown)).join('');
			if (tick % 4 === 0) Sound.tone({ freq: 420 + rand(0, 80), type: 'square', dur: 0.025, vol: 0.025 });
		}
		if (this.speaker) {
			const face = this.speaker === player ? 1 : -1;
			drawPortrait(this.pctx, this.speaker.key, Math.floor(tick / this.speaker.cfg.sprites.idle.hold), this.portrait.width, face);
		}
	},
};

// ---------- story flow ----------
const Story = {
	hero: null,
	chapter: 0,
	learner: null,

	open() {
		const save = Progress.data.story;
		if (save && !save.complete && save.hero && ROSTER[save.hero]) {
			const ch = CHAPTERS[save.chapter];
			this.panel(tx('story.title'), tx('story.continueText', { hero: fighterText(save.hero).name, n: save.chapter + 1, m: CHAPTERS.length, boss: fighterText(ch.boss).name }), [
				[tx('story.continue'), () => this.resume(save.hero, save.chapter), ''],
				[tx('story.new'), () => Select.open('story', 'easy'), 'ghost'],
				[tx('story.back'), goToMenu, 'ghost'],
			]);
		} else {
			Select.open('story', 'easy');
		}
	},

	newGame(hero) {
		this.hero = hero;
		this.chapter = 0;
		this.learner = null;
		Progress.data.story = { hero, chapter: 0 };
		Progress.save();
		this.beginChapter(0, true);
	},

	resume(hero, chapter) {
		this.hero = hero;
		this.chapter = chapter;
		this.learner = null;
		this.beginChapter(chapter, false);
	},

	beginChapter(i, opening) {
		this.chapter = i;
		const ch = CHAPTERS[i];
		startMatch('cpu', ch.level, this.hero, ch.boss, ch.arena, { story: ch, learner: this.learner });
		this.learner = Game.learner;
		this.learner.saved = false;
		// the boss walks in from the edge of the screen as a silhouette
		enemy.position.x = W + 40;
		enemy.scripted = { vx: -3.2, face: -1 };
		enemy.silhouette = true;
		Game.storyIntro = opening;
		setState('storyWalk');
	},

	// the boss has reached its spot
	arrive() {
		enemy.scripted = null;
		enemy.silhouette = false;
		FX.flash(enemy.fx.glow, 0.5);
		FX.burst(enemy.centerX, chestY(enemy), enemy.fx.glow, 30, 10);
		Sound.superCharge();
		setState('storyTalk');
		const lines = this.fill(storyText().scenes[this.chapter].pre);
		const go = () =>
			Dialogue.show(lines, () => {
				Music.play('boss');
				setState('intro');
				Sound.bell();
			});
		if (Game.storyIntro) {
			Game.storyIntro = false;
			Dialogue.show(storyText().opening, go);
		} else go();
	},

	fill(lines) {
		const habit = this.learner && this.learner.samples >= 6 ? this.learner.topHabit() : null;
		const st = storyText();
		const voice = st.replies[HERO_VOICE[this.hero] || 'honor'];
		return lines.map((l) => {
			if (l.who === 'hero') return { who: 'hero', text: voice[l.reply] };
			let text = l.text;
			if (text.includes('{habit}')) {
				const h = st.habit[habit] || st.habitDefault;
				text = text.replace('{habit}', text === text.toUpperCase() ? h.toUpperCase() : h);
			}
			return { who: l.who, text };
		});
	},

	onMatchEnd(won, newHard = false) {
		const scene = storyText().scenes[this.chapter];
		const last = this.chapter === CHAPTERS.length - 1;
		if (won) {
			const boss = CHAPTERS[this.chapter].boss;
			const fresh = Progress.unlock(boss);
			Progress.data.story = last ? { hero: this.hero, chapter: this.chapter, complete: true } : { hero: this.hero, chapter: this.chapter + 1 };
			Progress.save();
			Dialogue.show(scene.post, () => {
				if (last) {
					BOSS_ORDER.forEach((k) => Progress.unlock(k));
					Dialogue.show(storyText().ending, () => this.complete());
					return;
				}
				const next = CHAPTERS[this.chapter + 1];
				const hard = newHard ? tx('story.unlockHard') : '';
				const unlocked = fresh ? tx('story.unlockBoss', { boss: fighterText(boss).name }) : '';
				this.panel(tx('story.cleared', { n: this.chapter + 1 }), unlocked + hard + tx('story.next', { n: this.chapter + 2, boss: fighterText(next.boss).name }), [
					[tx('story.nextBtn'), () => this.beginChapter(this.chapter + 1, false), ''],
					[tx('res.menu'), goToMenu, 'ghost'],
				], true);
			});
		} else {
			Dialogue.show([{ who: 'boss', text: scene.lose }], () => {
				this.panel(tx('story.defeated'), tx('story.defeatedText', { boss: enemy.name }), [
					[tx('story.retry'), () => this.beginChapter(this.chapter, false), ''],
					[tx('res.menu'), goToMenu, 'ghost'],
				], true);
			});
		}
	},

	complete() {
		const L = this.learner;
		const acc = L && L.accuracy !== null ? tx('story.completeAcc', { p: Math.round(L.accuracy * 100) }) : '';
		this.panel(tx('story.complete'), tx('story.completeText') + acc, [[tx('res.menu'), goToMenu, '']], true);
	},

	panel(title, text, buttons, showStats = false) {
		document.getElementById('story-title').textContent = title;
		document.getElementById('story-text').textContent = text;
		const table = document.getElementById('story-stats');
		table.hidden = !showStats;
		if (showStats) MatchStats.render(table, tx('res.you', { f: player.short }), enemy.short);
		const row = document.getElementById('story-buttons');
		row.innerHTML = '';
		buttons.forEach(([label, fn, cls]) => {
			const b = document.createElement('button');
			b.className = `btn ${cls}`.trim();
			b.type = 'button';
			b.textContent = label;
			b.addEventListener('click', () => {
				Sound.init();
				Sound.click();
				fn();
			});
			row.append(b);
		});
		showPanel('story');
		row.firstChild.focus({ preventScroll: true });
	},
};
