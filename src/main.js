// ---------- Blade & Blood: game loop, rounds, combat and HUD ----------


const player = new Fighter('mack', 0);
const enemy = new Fighter('kenji', 1);

const NO_INPUT = new InputState();
const ROUND_TIME = 60; // defaults; the real values come from Settings when a match starts
const ROUNDS_TO_WIN = 2;
const MELEE_SPECIALS = ['charge', 'flash', 'leap', 'rush', 'ambush'];

const Game = {
	state: 'demo', // demo | intro | fight | roundEnd | matchEnd | paused
	pausedFrom: null,
	mode: 'cpu', // cpu | pvp
	level: 'medium',
	arena: 'forest',
	picks: ['mack', 'kenji'],
	round: 1,
	wins: [0, 0],
	timeLeft: ROUND_TIME,
	roundTime: ROUND_TIME,
	roundsToWin: ROUNDS_TO_WIN,
	timerFrames: 0,
	stateTimer: 0,
	tick: 0,
	projectiles: [],
	scheduled: [],
	hitStop: 0,
	slowMo: 0,
	superFreeze: 0,
	superCaster: null,
	result: null,
	combo: null,
	demoReset: 0,
	p1Source: null,
	p2Source: null,
	learner: null,
	aiVision: true,
	playerLearner: null,
	autopilot: false,
	toast: null,

	grab: null,
	cam: { z: 1, tz: 1, x: W / 2, y: H / 2, tx: W / 2, ty: H / 2 },
	startThrow(att, def) {
		return startThrow(att, def);
	},
	onSuperStart(fighter, move) {
		this.superFreeze = 42;
		this.superCaster = fighter;
		FX.flash(fighter.fx.glow, 0.35);
		FX.text(moveName(fighter.key, move === fighter.moves.super ? 'super' : 'special').toUpperCase() + '!', fighter.centerX, fighter.position.y - 40, fighter.fx.core, 20, 60);
		Sound.superCharge();
	},
	later(frames, fn) {
		this.scheduled.push({ t: frames, fn });
	},
};

// ---------- input sources ----------
const demoAI1 = new AIController(player, enemy, 'medium');
const demoAI2 = new AIController(enemy, player, 'medium');
let cpuAI = null;
let playerAI = null; // drives your fighter in Autopilot and AI vs AI

function useDemoSources() {
	demoAI1.setLevel('medium');
	demoAI2.setLevel('medium');
	Game.p1Source = demoAI1;
	Game.p2Source = demoAI2;
}

function randomPick(except) {
	const pool = ROSTER_ORDER.filter((k) => k !== except);
	return pool[Math.floor(Math.random() * pool.length)];
}

function setFighters(k1, k2) {
	player.setCharacter(k1);
	enemy.setCharacter(k2);
	// mirror match: give player 2 a different colour so you can tell them apart
	enemy.tint = k1 === k2 ? 'hue-rotate(150deg) saturate(1.3)' : null;
}

// ---------- match / round flow ----------
function startMatch(mode, level, k1, k2, arena = Game.arena, opts = {}) {
	Game.story = opts.story || null;
	Game.arena = ARENAS[arena] ? arena : 'forest';
	Sound.init();
	Sound.silent = false;
	Game.mode = mode;
	Game.level = level;
	Game.picks = [k1, k2];
	Game.wins = [0, 0];
	Game.round = 1;
	Game.roundTime = Settings.get('roundTime');
	Game.roundsToWin = Settings.get('roundsToWin');
	if (mode === 'net') {
		// Wi-Fi play uses the host's settings on both devices
		Game.roundTime = Net.cfg.rt;
		Game.roundsToWin = Net.cfg.rw;
	}
	MatchStats.reset();
	player.healthMult = 1;
	enemy.healthMult = Game.story ? Game.story.hp : 1;
	enemy.scripted = null;
	enemy.silhouette = false;
	setFighters(k1, k2);
	player.speedMult = 1;
	player.damageMult = 1;
	Game.p1Source = p1Input;
	if (mode === 'cpu') {
		cpuAI = new AIController(enemy, player, level);
		// the CPU studies you; "YOUR AI" studies the CPU in the background, ready for Autopilot
		// story mode keeps one learner for every chapter
		Game.learner = opts.learner || new Learner(enemy, player, level, { name: 'cpu', style: 'red', memKey: 'human' });
		if (Game.story) {
			Game.learner.rate = AI_LEVELS[level].learn * Game.story.learn;
			enemy.damageMult *= Game.story.dmg;
		}
		cpuAI.learner = Game.learner;
		Game.p2Source = cpuAI;
		playerAI = new AIController(player, enemy, 'medium');
		Game.playerLearner = new Learner(player, enemy, 'hard', { name: 'you', style: 'blue', memKey: `cpu:${k2}:${level}` });
		playerAI.learner = Game.playerLearner;
		Game.p1Source = Game.autopilot ? playerAI : p1Input;
	} else if (mode === 'aivai') {
		// both fighters are learning AIs
		cpuAI = new AIController(enemy, player, level);
		playerAI = new AIController(player, enemy, level);
		Game.learner = new Learner(enemy, player, level, { name: 'right', style: 'red', memKey: `cpu:${k1}:${level}` });
		Game.playerLearner = new Learner(player, enemy, level, { name: 'left', style: 'blue', memKey: `cpu:${k2}:${level}` });
		cpuAI.learner = Game.learner;
		playerAI.learner = Game.playerLearner;
		Game.p1Source = playerAI;
		Game.p2Source = cpuAI;
	} else {
		// two people (one keyboard, or Wi-Fi): no learning AI
		cpuAI = null;
		playerAI = null;
		Game.learner = null;
		Game.playerLearner = null;
		enemy.speedMult = 1;
		enemy.damageMult = 1;
		Game.p2Source = p2Input;
		if (mode === 'net') {
			Game.p1Source = Net.inputs[0];
			Game.p2Source = Net.inputs[1];
		}
	}
	player.energy = 0;
	enemy.energy = 0;
	// story fights open with the tense walk-in theme; the boss theme starts after the talk
	Music.play(Game.story ? 'story' : musicForMatch());
	hidePanels();
	startRound();
}

function startRound() {
	player.reset();
	enemy.reset();
	Game.projectiles = [];
	Game.scheduled = [];
	Game.grab = null;
	Game.cam = { z: 1, tz: 1, x: W / 2, y: H / 2, tx: W / 2, ty: H / 2 };
	Game.combo = null;
	Game.hitStop = 0;
	Game.slowMo = 0;
	Game.superFreeze = 0;
	Game.timeLeft = Game.roundTime;
	Game.timerFrames = 0;
	Game.result = null;
	FX.reset();
	p1Input.clear();
	p2Input.clear();
	if (cpuAI) cpuAI.resetMemory();
	if (playerAI) playerAI.resetMemory();
	if (Game.learner) Game.learner.reset();
	if (Game.playerLearner) Game.playerLearner.reset();
	setState('intro');
	Sound.bell();
}

function setState(s) {
	Game.state = s;
	Game.stateTimer = 0;
}

function endRound(reason) {
	let winner = -1;
	if (reason === 'ko') {
		if (player.ko && !enemy.ko) winner = 1;
		else if (enemy.ko && !player.ko) winner = 0;
	} else {
		if (player.healthPct > enemy.healthPct + 0.01) winner = 0;
		else if (enemy.healthPct > player.healthPct + 0.01) winner = 1;
		Sound.bell();
	}
	if (winner >= 0) Game.wins[winner]++;
	if (Game.learner) Game.learner.roundEnd();
	if (Game.playerLearner) Game.playerLearner.roundEnd();
	const w = winner === 0 ? player : winner === 1 ? enemy : null;
	Game.result = { reason, winner, perfect: !!w && w.health >= w.maxHealth };
	setState('roundEnd');
}

function matchOver() {
	return Game.wins[0] >= Game.roundsToWin || Game.wins[1] >= Game.roundsToWin;
}

function finishMatch() {
	setState('matchEnd');
	const p1won = Game.wins[0] > Game.wins[1];
	const winner = p1won ? player : enemy;
	let won = Game.mode !== 'cpu' || p1won;
	let title = Game.mode === 'cpu' ? tx(p1won ? 'res.win' : 'res.lose') : tx(p1won ? 'res.p1' : 'res.p2');
	if (Game.mode === 'aivai') title = tx(p1won ? 'res.leftAI' : 'res.rightAI');
	if (Game.mode === 'net') {
		won = p1won === (Net.role === 'host');
		title = tx(won ? 'res.win' : 'res.lose');
	}
	const levelText = Game.mode === 'cpu' ? tx('res.vsLevel', { level: levelName(Game.level) }) : '';
	saveAIMemory();
	MatchStats.active = false;
	// records count only matches you fought yourself (not AI vs AI, not with Autopilot on)
	let newHard = false;
	const selfPlayed = Game.mode === 'cpu' && !(Game.playerLearner && Game.playerLearner.drove);
	if (selfPlayed) newHard = Progress.recordMatch({ fighter: Game.picks[0], level: Game.level, won: p1won, combo: MatchStats.sides[0].bestCombo, story: !!Game.story });
	Music.sting(Game.mode === 'cpu' && !p1won ? 'lose' : 'win', Game.story ? 'story' : 'title');
	if (Game.story) {
		Story.onMatchEnd(p1won, newHard);
		return;
	}
	const isYou = (side) => Game.mode === 'net' && (side === 0) === (Net.role === 'host');
	const label = (f, side) => (Game.mode === 'cpu' ? tx(side === 0 ? 'res.you' : 'res.cpu', { f: f.short }) : isYou(side) ? tx('res.you', { f: f.short }) : f.short);
	MatchStats.render(document.getElementById('result-stats'), label(player, 0), label(enemy, 1));
	const unlockLine = document.getElementById('result-unlock');
	unlockLine.hidden = !newHard;
	unlockLine.textContent = tx('res.hard');
	if (selfPlayed) {
		const r = Progress.fighterRecord(Game.picks[0]);
		document.getElementById('result-record').textContent = tx('res.record', { f: player.short, w: r.w, l: r.l });
	}
	document.getElementById('result-record').hidden = !selfPlayed;
	document.getElementById('result-title').textContent = title;
	document.getElementById('result-title').dataset.win = String(won);
	document.getElementById('result-score').textContent = tx('res.score', { a: player.short, wa: Game.wins[0], wb: Game.wins[1], b: enemy.short }) + levelText;
	const wt = fighterText(winner.key);
	document.getElementById('result-quote').textContent = `"${wt.quote}"`;
	document.getElementById('result-who').textContent = `${wt.name}, ${wt.title}`;
	const aiLine = document.getElementById('result-ai');
	const summary = (L) => {
		if (!L) return '';
		const parts = L.roundAcc.map((a, i) => `${tx('res.roundShort', { n: i + 1 })} ${a === null ? '--' : localDigits(Math.round(a * 100)) + '%'}`);
		return tx('res.aiRead', { ai: L.name, target: L.target.short, parts: parts.join(' · ') });
	};
	const lines = [summary(Game.learner)];
	if (Game.playerLearner && (Game.mode === 'aivai' || Game.playerLearner.drove)) lines.unshift(summary(Game.playerLearner));
	aiLine.textContent = lines.filter(Boolean).join('  |  ');
	aiLine.hidden = !Game.learner;
	const next = document.getElementById('btn-harder');
	const order = ['easy', 'medium', 'hard'];
	const nextLevel = order[order.indexOf(Game.level) + 1];
	next.hidden = !(Game.mode === 'cpu' && p1won && nextLevel && Progress.isLevelUnlocked(nextLevel));
	if (nextLevel) {
		next.dataset.level = nextLevel;
		next.textContent = tx('res.try', { level: levelName(nextLevel) });
	}
	showPanel('result');
}

function saveAIMemory() {
	[Game.learner, Game.playerLearner].forEach((L) => {
		if (L && !L.saved && L.memKey) {
			L.saveMemory();
			L.saved = true;
		}
	});
	updateMemoryButton();
}

function goToMenu() {
	if (Net.role) Net.leave();
	Game.story = null;
	enemy.scripted = null;
	enemy.silhouette = false;
	enemy.healthMult = 1;
	// quitting mid-match still keeps what the AIs learned
	if (['intro', 'fight', 'roundEnd', 'paused'].includes(Game.state)) saveAIMemory();
	cpuAI = null;
	playerAI = null;
	Game.playerLearner = null;
	Game.wins = [0, 0];
	startDemo();
	Music.play('title');
	Music.duck(false);
	showPanel('menu');
	updateMenuProgress();
}

function startDemo() {
	const a = randomPick();
	setFighters(a, randomPick(a));
	Game.arena = randomArena();
	player.energy = 0;
	enemy.energy = 0;
	player.speedMult = enemy.speedMult = 1;
	player.damageMult = enemy.damageMult = 1;
	Game.projectiles = [];
	Game.scheduled = [];
	Game.combo = null;
	Game.superFreeze = 0;
	Game.slowMo = 0;
	FX.reset();
	Sound.silent = true;
	MatchStats.active = false;
	useDemoSources();
	// in the attract demo the right-hand CPU studies the left one
	Game.learner = new Learner(enemy, player, 'medium');
	demoAI2.learner = Game.learner;
	demoAI1.learner = null;
	setState('demo');
}

function togglePause() {
	// a Wi-Fi match can't stop for one player: the menu opens, the fight keeps going
	if (Game.mode === 'net' && Net.active) {
		const open = document.body.dataset.panel === 'pause';
		document.getElementById('pause-title').textContent = tx('pause.online');
		if (open) hidePanels();
		else showPanel('pause');
		return;
	}
	document.getElementById('pause-title').textContent = tx('pause.title');
	if (Game.state === 'paused') {
		Game.state = Game.pausedFrom;
		Music.duck(false);
		hidePanels();
		return;
	}
	if (['intro', 'fight', 'roundEnd'].includes(Game.state)) {
		Game.pausedFrom = Game.state;
		Game.state = 'paused';
		p1Input.clear();
		p2Input.clear();
		Music.duck(true);
		showPanel('pause');
	}
}

function tickState() {
	Game.stateTimer++;
	const t = Game.stateTimer;
	switch (Game.state) {
		case 'intro':
			if (t === 72) Sound.fight();
			if (t >= 118) setState('fight');
			break;
		case 'fight':
			if (++Game.timerFrames >= 60) {
				Game.timerFrames = 0;
				Game.timeLeft--;
				if (Game.timeLeft > 0 && Game.timeLeft <= 5) Sound.tick();
				if (Game.timeLeft <= 0) endRound('time');
			}
			break;
		case 'roundEnd':
			if (t >= 240) {
				if (matchOver()) finishMatch();
				else {
					Game.round++;
					startRound();
				}
			}
			break;
		case 'storyWalk':
			if (enemy.centerX <= SPAWN_CENTER[1] || t > 400) {
				enemy.position.x = SPAWN_CENTER[1] - enemy.width / 2;
				Story.arrive();
			}
			break;
		case 'demo':
			if ((player.ko || enemy.ko) && !Game.demoReset) Game.demoReset = 150;
			if (Game.demoReset && --Game.demoReset === 0) startDemo();
			break;
	}
}

// ---------- throws and parries ----------
const THROW_TECH_WINDOW = 10;
const THROW_HOLD = 16;

function startThrow(att, def) {
	Game.grab = { att, def, t: 0 };
	att.move = { anim: 'attack1', hold: 5, hitFrame: 999, type: 'throw', range: [0, 0], band: [0, 0] };
	att.moveName = 'throw';
	att.moveHit = true;
	att.setAnim('attack1', true, 5);
	att.velocity.x = 0;
	att.events.push('throw');
	def.grabbed = true;
	def.stun = THROW_HOLD + 4;
	def.move = null;
	def.moveName = null;
	def.dashTimer = 0;
	def.blocking = false;
	def.velocity.x = 0;
	def.setAnim('takeHit', true);
	// pull the target in close
	def.position.x = clamp(att.centerX + att.facing * (att.width / 2 + def.width / 2 + 8) - def.width / 2, 10, W - def.width - 10);
	FX.text(tx('fx.grab'), def.centerX, def.position.y - 30, '#fef08a', 13, 30);
	Sound.grab();
}

function updateGrab(src1, src2) {
	const g = Game.grab;
	if (!g) return;
	g.t++;
	const { att, def } = g;
	att.frame = 0;
	att.elapsed = 0;
	def.stun = Math.max(def.stun, 2);
	const defSrc = def === player ? src1 : src2;
	if (g.t <= THROW_TECH_WINDOW && (defSrc.take('heavy') || defSrc.take('throw'))) {
		// throw escape
		Game.grab = null;
		def.grabbed = false;
		def.stun = 0;
		att.move = null;
		att.moveName = null;
		const dir = sign(def.centerX - att.centerX) || att.facing;
		def.knockback = dir * 10;
		att.knockback = -dir * 10;
		FX.burst((att.centerX + def.centerX) / 2, def.feetY - def.height * 0.6, '#ffffff', 16, 8);
		FX.text(tx('fx.escape'), def.centerX, def.position.y - 30, '#86efac', 13, 40);
		Sound.block();
		return;
	}
	if (g.t >= THROW_HOLD) {
		Game.grab = null;
		def.grabbed = false;
		att.move = { anim: 'attack1', hold: 4, hitFrame: 999, type: 'throw', range: [0, 0], band: [0, 0] };
		att.setAnim('attack1', true, 4);
		att.frame = 1;
		def.stun = 0;
		const dir = att.facing;
		MatchStats.onThrow(att);
		Haptics.throwSlam(att, def);
		applyHit(att, def, { damage: 12, stun: 44, push: 18, lift: -11, unblockable: true, heavy: true, throw: true, energy: 10 }, def.centerX, def.feetY - def.height * 0.6, dir);
		FX.dust(def.centerX, FLOOR_Y, 14, dir);
		FX.shake(12, 18);
		Game.cam.tz = 1.08;
		Game.cam.tx = def.centerX;
		Game.cam.ty = def.feetY - def.height / 2;
		Game.cam.punch = 14;
		FX.text(tx('fx.throw'), def.centerX, def.position.y - 46, '#fef08a', 14, 45);
		Sound.throwSlam();
	}
}

function doParry(att, def, props, x, y, dir) {
	def.parryTimer = 0;
	def.blockStun = 0;
	def.gainEnergy(15);
	def.events.push('parry');
	if (!props.projectile) {
		// the attacker is left wide open
		att.stun = 30;
		att.move = null;
		att.moveName = null;
		att.dashTimer = 0;
		att.setAnim('takeHit', true);
		att.knockback = -dir * 5;
	}
	Game.hitStop = 14;
	FX.flash('#ffffff', 0.55);
	FX.shake(6, 10);
	FX.particles.push(new Particle({ x, y, life: 22, size: 14, grow: 9, drag: 1, color: '#ffffff', type: 'ring' }));
	FX.particles.push(new Particle({ x, y, life: 16, size: 8, grow: 5, drag: 1, color: def.fx.core, type: 'ring' }));
	FX.sparks(x, y, -dir, '#ffffff', 22, 12);
	FX.text(tx('fx.parry'), def.centerX, def.position.y - 40, '#ffffff', 16, 50);
	Sound.parry();
}

// ---------- combat ----------
function applyHit(att, def, props, x, y, dir) {
	if (def.ko) return;
	const heavy = !!(props.heavy || props.big);
	let damage = att.outgoingDamage(props.damage);
	const facingAttack = def.facing === -dir;

	// parry: block pressed just before the hit lands
	const canParry = def.grounded && (def.canAct() || def.blocking || def.blockStun > 0);
	if (def.parryTimer > 0 && canParry && facingAttack && !props.unblockable && !props.big) {
		MatchStats.onConnect(att, props);
		MatchStats.onParry(def);
		Haptics.parry(def);
		doParry(att, def, props, x, y, dir);
		return;
	}

	// critical hits on heavy attacks
	let crit = false;
	if (props.heavy && !props.big && !props.throw && chance(0.1)) {
		crit = true;
		damage *= 1.5;
	}

	// block
	if ((def.blocking || def.blockStun > 0) && facingAttack && !props.unblockable) {
		const chip = def.stats.noChip ? 0 : damage * (props.big ? 0.3 : 0.15);
		def.health = Math.max(1, def.health - chip);
		def.blockStun = heavy ? 16 : 10;
		def.knockback = dir * props.push * 0.6;
		def.gainEnergy(4 * def.stats.blockEnergy);
		att.gainEnergy(3);
		const col = def.stats.noChip ? '#fde047' : '#93c5fd';
		FX.sparks(x, y, dir, col, heavy ? 14 : 8, 7);
		FX.text(tx(def.stats.noChip ? 'fx.guard' : 'fx.block'), def.centerX, def.position.y - 14, col, 12, 35);
		Game.hitStop = heavy ? 6 : 3;
		FX.shake(heavy ? 5 : 2, 8);
		Sound.block();
		MatchStats.onConnect(att, props);
		MatchStats.onBlock(def);
		return;
	}

	const healthBefore = def.health;
	def.health = Math.max(0, def.health - damage);

	// armour: heavy swings keep going through normal hits
	const armoured = def.armored && !props.big && def.health > 0;
	const wasStunned = def.stun > 0;
	if (!armoured) {
		def.move = null;
		def.moveName = null;
		def.dashTimer = 0;
		def.leapLanded = true;
		def.stun = props.stun;
		def.setAnim('takeHit', true);
		def.knockback = dir * props.push;
		if (props.lift) def.velocity.y = props.lift;
	} else {
		FX.text(tx('fx.armor'), def.centerX, def.position.y - 40, '#e2e8f0', 12, 35);
	}
	def.hitFlash = 6;

	att.combo = wasStunned && att.comboTimer > 0 ? att.combo + 1 : 1;
	att.comboTimer = 70;
	if (att.combo >= 2) Game.combo = { side: att === player ? 0 : 1, count: att.combo, timer: 80, color: att.fx.core };
	MatchStats.onConnect(att, props);
	MatchStats.onHit(att, props, healthBefore - def.health);
	if (!props.throw) Haptics.hit(att, def, heavy);

	att.gainEnergy(props.energy || 0);
	if (att.stats.lifesteal && !att.ko) {
		const heal = damage * att.stats.lifesteal;
		att.health = Math.min(att.maxHealth, att.health + heal);
		FX.text(`+${Math.round(heal)}`, att.centerX, att.position.y - 20, '#86efac', 12, 40);
	}
	def.gainEnergy(6);
	if (att.stats.steal) {
		const taken = Math.min(def.energy, att.stats.steal);
		def.energy -= taken;
		att.energy = Math.min(100, att.energy + taken);
		if (taken > 1) FX.text(tx('fx.steal', { n: Math.round(taken) }), def.centerX, def.position.y - 48, att.fx.spark, 10, 40);
	}

	FX.sparks(x, y, dir, att.fx.hit, heavy ? 24 : 14, heavy ? 13 : 9);
	if (crit) {
		FX.burst(x, y, '#fde047', 30, 14);
		FX.text(tx('fx.crit'), def.centerX, def.position.y - 50, '#fde047', 14, 50);
		FX.flash('#fde047', 0.25);
		Sound.crit();
	}
	FX.text(String(Math.round(damage)), def.centerX + rand(-12, 12), def.position.y - 24, heavy ? att.fx.core : '#ffffff', heavy ? 22 : 16, 45);
	FX.shake(heavy ? 10 : 4, heavy ? 16 : 8);
	Game.hitStop = Math.max(Game.hitStop, heavy ? 8 : 4);
	Sound.hit(heavy);

	if (def.health <= 0) {
		def.ko = true;
		def.move = null;
		def.moveName = null;
		def.stun = 0;
		def.velocity.y = -6;
		def.knockback = dir * 14;
		Game.scheduled = [];
		Game.slowMo = 90;
		// finisher: zoom in on the final blow
		Game.cam.tz = 1.3;
		Game.cam.tx = x;
		Game.cam.ty = y;
		Game.hitStop = 14;
		FX.flash('#ffffff', 0.85);
		FX.shake(16, 34);
		FX.burst(x, y, att.fx.core, 50, 15);
		Sound.ko();
		Haptics.ko();
	}
}

function meleeHit(att, def, m, extra = {}) {
	const box = att.attackBoxFor(m);
	if (def.ko || def.invuln > 0 || !rectsOverlap(box, def.hurtbox())) return false;
	const x = att.facing === 1 ? Math.max(box.x, def.position.x) + 10 : Math.min(box.x + box.w, def.position.x + def.width) - 10;
	const y = clamp(box.y + box.h / 2, def.position.y + 10, def.feetY - 10);
	applyHit(att, def, Object.assign({}, m, extra), x, y, att.facing);
	return true;
}

function chestY(f) {
	return f.feetY - f.height * 0.58;
}

function spawn(att, kind, opts = {}) {
	Game.projectiles.push(new Projectile(Object.assign({ owner: att, kind, x: att.centerX + att.facing * 60, y: chestY(att), dir: att.facing, damage: att.moves.special.damage }, opts)));
}

function resolveAttack(att, def) {
	const m = att.move;
	// dashing moves can connect from `activeFrom`, everything else on the hit frame
	if (!m || att.moveHit || att.frame < (m.activeFrom ?? m.hitFrame)) return;
	const type = m.type;
	const muzzle = att.centerX + att.facing * 60;

	// multi-hit chains: one hit on each listed frame, the last one knocks back
	if (m.hitFrames) {
		const next = m.hitFrames[att.hitIndex];
		if (next !== undefined && att.frame >= next) {
			att.hitIndex++;
			const last = att.hitIndex >= m.hitFrames.length;
			meleeHit(att, def, m, last ? { stun: 34, push: 11, lift: -6, heavy: true } : {});
		}
		if (att.hitIndex >= m.hitFrames.length) att.moveHit = true;
		return;
	}

	// moves that stay active over several frames
	if (type === 'charge' || type === 'flash' || type === 'rush') {
		const windowEnd = m.hitFrame + (m.active || 0);
		if (att.frame > windowEnd) {
			att.moveHit = true;
			return;
		}
		const box = att.attackBoxFor(m);
		if (def.ko || def.invuln > 0 || !rectsOverlap(box, def.hurtbox())) return;
		att.moveHit = true;
		if (type === 'rush') return startRush(att, def, m);
		meleeHit(att, def, m, type === 'charge' ? { push: 15, stun: 36, heavy: true } : { stun: 30, push: 4 });
		if (type === 'charge') att.lungeStop = true;
		return;
	}

	if (att.frame < m.hitFrame) return;
	att.moveHit = true;
	switch (type) {
		case 'orb':
		case 'crescent':
		case 'lance':
		case 'spear':
			spawn(att, type, { damage: m.damage });
			FX.sparks(muzzle, chestY(att), att.facing, att.fx.spark, 10, 6);
			break;
		case 'sprite':
			spawn(att, 'sprite', { damage: m.damage });
			FX.sparks(muzzle, chestY(att), att.facing, att.fx.spark, 8, 5);
			break;
		case 'fan':
			[-2.6, -1.3, 0, 1.3, 2.6].forEach((vy, i) => spawn(att, 'sprite', { damage: m.damage, vy, delay: i * 3 }));
			FX.shake(6, 14);
			Sound.superFire();
			break;
		case 'spell':
			spawn(att, 'spell', { damage: m.damage, x: clamp(def.centerX, 40, W - 40), y: FLOOR_Y, dir: 0 });
			break;
		case 'spell3':
			[0, -140, 140].forEach((dx, i) => spawn(att, 'spell', { damage: m.damage, x: clamp(def.centerX + dx, 40, W - 40), y: FLOOR_Y, dir: 0, delay: i * 12 }));
			FX.flash(att.fx.glow, 0.3);
			Sound.superFire();
			break;
		case 'sweep':
			FX.shake(14, 26);
			FX.dust(att.centerX, FLOOR_Y, 18);
			FX.particles.push(new Particle({ x: att.centerX, y: FLOOR_Y - 6, life: 24, size: 30, grow: 14, drag: 1, color: att.fx.glow, type: 'ring' }));
			Sound.superFire();
			meleeHit(att, def, m, { big: true, heavy: true, stun: 44, push: 14, lift: -10 });
			break;
		case 'homing':
			spawn(att, 'homing', { damage: m.damage, target: def });
			FX.sparks(muzzle, chestY(att), att.facing, att.fx.spark, 10, 6);
			break;
		case 'knives':
			[0, 7, 14].forEach((d, i) => spawn(att, 'knife', { damage: m.damage, delay: d, y: chestY(att) + (i - 1) * 14 }));
			break;
		case 'wave':
			spawn(att, 'wave', { damage: m.damage, x: att.centerX + att.facing * 50, y: FLOOR_Y - 25 });
			FX.shake(6, 12);
			FX.dust(att.centerX + att.facing * 50, FLOOR_Y, 10, -att.facing);
			Sound.explode();
			break;
		case 'blast':
			spawn(att, 'blast', { damage: m.damage });
			FX.shake(9, 20);
			Sound.superFire();
			break;
		case 'volley':
			[0, 5, 10].forEach((d, i) => spawn(att, 'spear', { damage: m.damage, delay: d, y: att.feetY - [40, 85, 135][i] }));
			FX.shake(5, 12);
			Sound.superFire();
			break;
		case 'rain': {
			const xs = [-150, 0, 150, -75, 75, 0];
			xs.forEach((dx, i) => spawn(att, 'rain', { damage: m.damage, x: clamp(def.centerX + dx, 30, W - 30), y: -40, dir: 0, delay: i * 9, vy: 3 }));
			FX.flash(att.fx.glow, 0.3);
			Sound.superFire();
			break;
		}
		case 'quake':
			doQuake(att, def, m);
			break;
		case 'leap': {
			FX.shake(10, 16);
			FX.dust(att.centerX, FLOOR_Y, 16);
			FX.particles.push(new Particle({ x: att.centerX, y: FLOOR_Y - 6, life: 20, size: 20, grow: 9, drag: 1, color: att.fx.glow, type: 'ring' }));
			Sound.explode();
			meleeHit(att, def, Object.assign({}, m, { band: [0, 120] }), { stun: 34, push: 12, lift: -8, heavy: true });
			break;
		}
		case 'rage':
			att.rageTimer = 480;
			att.health = Math.min(att.maxHealth, att.health + att.maxHealth * 0.1);
			FX.burst(att.centerX, chestY(att), '#ef4444', 40, 12);
			FX.flash('#7f1d1d', 0.4);
			FX.text(tx('fx.rage'), att.centerX, att.position.y - 30, '#fca5a5', 12, 60);
			Sound.superFire();
			break;
		case 'ambush':
			FX.smoke(att.centerX, chestY(att));
			if (!meleeHit(att, def, m, { unblockable: true, stun: 40, push: 14, lift: -9, big: true, heavy: true })) FX.text(tx('fx.miss'), att.centerX, att.position.y - 20, '#ffffff', 12, 35);
			break;
		default:
			meleeHit(att, def, m);
	}
}

function startRush(att, def, m) {
	// Thousand Cuts: lock the target and land six quick slashes
	att.lungeStop = true;
	att.velocity.x = 0;
	def.stun = 60;
	def.knockback = 0;
	const hits = 6;
	for (let i = 0; i < hits; i++) {
		Game.later(i * 6, () => {
			if (def.ko || att.ko) return;
			const last = i === hits - 1;
			const x = def.centerX + rand(-18, 18);
			const y = def.feetY - rand(30, def.height - 20);
			const dir = sign(def.centerX - att.centerX) || att.facing;
			applyHit(att, def, { damage: m.damage, stun: last ? 40 : 22, push: last ? 15 : 0.5, lift: last ? -10 : 0, big: last, heavy: last, unblockable: true }, x, y, dir);
			FX.particles.push(new Particle({ x, y, life: 10, size: 60, color: att.fx.core, type: 'glow' }));
			// keep the attacker glued to the target between slashes
			if (!last) att.position.x = clamp(def.centerX - dir * 70 - att.width / 2, 10, W - att.width - 10);
		});
	}
}

function doQuake(att, def, m) {
	FX.shake(20, 40);
	FX.flash(att.fx.glow, 0.35);
	Sound.superFire();
	for (let x = 20; x < W; x += 36) {
		Game.later(Math.abs(x - att.centerX) / 40, () => {
			FX.dust(x, FLOOR_Y, 2);
			FX.particles.push(new Particle({ x, y: FLOOR_Y - 4, vx: rand(-1, 1), vy: rand(-9, -4), life: 30, size: rand(4, 7), color: '#7a5c3e', type: 'ember', gravity: 0.5, drag: 0.98 }));
		});
	}
	const onGround = def.position.y >= def.groundY - 6;
	if (!onGround || def.ko || def.invuln > 0) {
		FX.text(tx('fx.dodged'), def.centerX, def.position.y - 30, '#ffffff', 12, 40);
		return;
	}
	const dir = sign(def.centerX - att.centerX) || att.facing;
	Game.later(Math.abs(def.centerX - att.centerX) / 40, () => {
		if (def.position.y < def.groundY - 6) return;
		applyHit(att, def, { damage: m.damage, stun: 50, push: 10, lift: -12, big: true, heavy: true }, def.centerX, def.feetY - 20, dir);
	});
}

function updateProjectiles() {
	const list = Game.projectiles;
	list.forEach((p) => p.update());

	// projectiles clash: the stronger one survives, equal ones cancel
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i];
			const b = list[j];
			if (!a.active || !b.active || a.owner === b.owner || !a.power || !b.power) continue;
			if (rectsOverlap(a.box(), b.box())) {
				if (a.power > b.power) b.dead = true;
				else if (b.power > a.power) a.dead = true;
				else a.dead = b.dead = true;
				FX.burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 26, 10);
				FX.shake(6, 12);
				Sound.explode();
			}
		}
	}

	list.forEach((p) => {
		if (!p.active) return;
		const target = p.owner === player ? enemy : player;
		if (target.ko || target.invuln > 0) return;
		if (rectsOverlap(p.box(), target.hurtbox())) {
			if (p.kind === 'spell') p.spent = true;
			else p.dead = true;
			const dir = p.kind === 'rain' ? sign(target.centerX - p.owner.centerX) || 1 : sign(p.vx) || 1;
			applyHit(p.owner, target, p.hitProps(), p.x, p.y, dir);
			FX.burst(p.x, p.y, p.colors.glow, p.big ? 40 : 18, p.big ? 14 : 9);
			Sound.explode();
		}
	});
	Game.projectiles = list.filter((p) => {
		if (p.dead) p.cleanup();
		return !p.dead;
	});
}

function pushApart(a, b) {
	if (a.ko || b.ko || a.phasing || b.phasing) return;
	const ha = a.hurtbox();
	const hb = b.hurtbox();
	if (!rectsOverlap(ha, hb)) return;
	const overlap = Math.min(ha.x + ha.w - hb.x, hb.x + hb.w - ha.x);
	const dir = sign(a.centerX - b.centerX) || a.facing * -1;
	a.position.x += (dir * overlap) / 2;
	b.position.x -= (dir * overlap) / 2;
	a.position.x = clamp(a.position.x, 10, W - a.width - 10);
	b.position.x = clamp(b.position.x, 10, W - b.width - 10);
}

function runScheduled() {
	if (!Game.scheduled.length) return;
	const due = [];
	Game.scheduled = Game.scheduled.filter((s) => {
		if (--s.t <= 0) {
			due.push(s.fn);
			return false;
		}
		return true;
	});
	due.forEach((fn) => fn());
}

// ---------- main update ----------
function worldUpdate() {
	const live = Game.state === 'fight' || Game.state === 'demo';
	const src1 = live ? Game.p1Source : NO_INPUT;
	const src2 = live ? Game.p2Source : NO_INPUT;
	if (live) {
		if (src1 instanceof AIController) src1.update(Game.projectiles);
		if (src2 instanceof AIController) src2.update(Game.projectiles);
		[player, enemy].forEach((f) => (f.energy = Math.min(100, f.energy + 0.03 * f.stats.energyRegen)));
	}

	player.control(src1, enemy, Game);
	enemy.control(src2, player, Game);
	src1.tick();
	src2.tick();
	if (live && Game.learner) Game.learner.observe(Game.tick);
	if (live && Game.playerLearner) Game.playerLearner.observe(Game.tick);
	player.events.length = 0;
	enemy.events.length = 0;

	player.physics();
	enemy.physics();
	pushApart(player, enemy);

	resolveAttack(player, enemy);
	resolveAttack(enemy, player);
	updateGrab(src1, src2);
	runScheduled();
	updateProjectiles();

	player.updateAnim();
	enemy.updateAnim();

	if (Game.state === 'fight' && (player.ko || enemy.ko)) endRound('ko');
	if (Game.combo && --Game.combo.timer <= 0) Game.combo = null;
}


function setAutopilot(on, quiet = false) {
	if (Game.mode !== 'cpu' || !playerAI) {
		Game.autopilot = on;
		updateAutopilotButton();
		return;
	}
	Game.autopilot = on;
	p1Input.clear();
	playerAI.resetMemory();
	Game.p1Source = on ? playerAI : p1Input;
	if (on) Game.playerLearner.drove = true;
	if (!quiet) Game.toast = { text: tx(on ? 'hud.autoOn' : 'hud.autoOff'), t: 90 };
	updateAutopilotButton();
}

function updateCamera() {
	const cam = Game.cam;
	if (cam.punch > 0 && --cam.punch === 0) cam.tz = 1;
	if (Game.slowMo <= 0 && !cam.punch) cam.tz = 1;
	if (cam.tz <= 1) {
		cam.tx = W / 2;
		cam.ty = H / 2;
	}
	cam.z = lerp(cam.z, cam.tz, 0.12);
	cam.x = lerp(cam.x, cam.tx, 0.15);
	cam.y = lerp(cam.y, cam.ty, 0.15);
}

function step() {
	Game.tick++;
	if (Game.toast && --Game.toast.t <= 0) Game.toast = null;
	// pressing any fight key while Autopilot drives takes control back
	if (Game.mode === 'cpu' && Game.autopilot && Game.p1Source === playerAI && Object.values(p1Input.buffer).some((v) => v > 0)) setAutopilot(false);
	if (Game.state === 'paused') return;
	ARENAS[Game.arena].step(Game.tick);
	tickState();

	if (Game.superFreeze > 0) {
		Game.superFreeze--;
		const f = Game.superCaster;
		if (Game.tick % 2 === 0) {
			const a = rand(0, Math.PI * 2);
			FX.particles.push(new Particle({ x: f.centerX + Math.cos(a) * 140, y: chestY(f) + Math.sin(a) * 140, vx: -Math.cos(a) * 7, vy: -Math.sin(a) * 7, life: 20, size: 3, color: f.fx.spark, type: 'spark', drag: 1 }));
		}
		FX.update();
		return;
	}
	if (Game.hitStop > 0) {
		Game.hitStop--;
		FX.update();
		return;
	}
	updateCamera();
	if (Game.slowMo > 0) {
		Game.slowMo--;
		if (Game.slowMo % 3 !== 0) return;
	}
	FX.update();
	worldUpdate();
}

// ---------- rendering ----------
function drawHealthBar(f, x, y, w, side) {
	const h = 26;
	const hp = clamp(f.shownHealth / f.maxHealth, 0, 1);
	const trail = clamp(f.trailHealth / f.maxHealth, 0, 1);
	const low = f.healthPct < 25 && Math.floor(Game.tick / 8) % 2 === 0;
	c.fillStyle = '#1b1726';
	c.fillRect(x, y, w, h);
	const fill = (t, col) => {
		c.fillStyle = col;
		if (side === 0) c.fillRect(x, y, w * t, h);
		else c.fillRect(x + w * (1 - t), y, w * t, h);
	};
	fill(trail, '#e5484d');
	fill(hp, low ? '#ff7a7a' : f.tint ? '#e879f9' : f.cfg.bar);
	c.fillStyle = 'rgba(255,255,255,0.25)';
	if (side === 0) c.fillRect(x, y + 3, w * hp, 5);
	else c.fillRect(x + w * (1 - hp), y + 3, w * hp, 5);
	if (f.raging) {
		c.fillStyle = `rgba(239,68,68,${0.35 + Math.sin(Game.tick * 0.3) * 0.2})`;
		c.fillRect(x, y, w, h);
	}
	c.strokeStyle = '#f4ecd8';
	c.lineWidth = 4;
	c.strokeRect(x - 2, y - 2, w + 4, h + 4);
}

function drawEnergyBar(f, x, y, w, side) {
	const h = 10;
	const e = clamp(f.energy, 0, 100) / 100;
	const cost = f.moves.special.cost;
	c.fillStyle = '#1b1726';
	c.fillRect(x, y, w, h);
	const full = f.energy >= 100;
	const pulse = full ? 0.6 + Math.sin(Game.tick * 0.25) * 0.4 : 1;
	c.save();
	c.globalAlpha = pulse;
	c.fillStyle = f.energy >= cost ? f.fx.core : '#8a7a5a';
	if (side === 0) c.fillRect(x, y, w * e, h);
	else c.fillRect(x + w * (1 - e), y, w * e, h);
	c.restore();
	c.fillStyle = '#f4ecd8';
	const notch = side === 0 ? x + (w * cost) / 100 : x + w - (w * cost) / 100;
	c.fillRect(notch - 1, y - 2, 2, h + 4);
	c.strokeStyle = '#f4ecd8';
	c.lineWidth = 2;
	c.strokeRect(x - 1, y - 1, w + 2, h + 2);
	const label = full ? tx('hud.ready', { move: moveName(f.key, 'super') }) : f.energy >= cost ? tx('hud.ready', { move: moveName(f.key, 'special') }) : tx('hud.power');
	const lx = side === 0 ? x : x + w;
	drawText(label.toUpperCase(), lx, y + 22, { size: 8, align: side === 0 ? 'left' : 'right', color: full ? f.fx.core : '#f4ecd8', strokeWidth: 3 });
}

function drawHUD() {
	const barW = 430;
	drawHealthBar(player, 20, 22, barW, 0);
	drawHealthBar(enemy, W - 20 - barW, 22, barW, 1);

	const midX = W / 2;
	c.fillStyle = '#0d0b14';
	c.fillRect(midX - 40, 12, 80, 50);
	c.strokeStyle = '#f4ecd8';
	c.lineWidth = 4;
	c.strokeRect(midX - 40, 12, 80, 50);
	const urgent = Game.timeLeft <= 10 && Game.state === 'fight';
	drawText(String(Math.max(0, Game.timeLeft)), midX, 39, { size: 22, color: urgent ? '#ff6b6b' : '#f4ecd8', stroke: null });

	const netYou = (side) => Game.mode === 'net' && (side === 0) === (Net.role === 'host');
	const p1name = netYou(0) ? tx('hud.you', { name: player.name }) : Game.mode === 'aivai' ? tx('hud.ai', { name: player.name }) : Game.mode === 'cpu' && Game.autopilot ? tx('hud.auto', { name: player.name }) : player.name;
	drawText(p1name, 20, 64, { size: 11, align: 'left', strokeWidth: 3, color: Game.autopilot && Game.mode === 'cpu' ? '#93c5fd' : '#ffffff' });
	const p2name = netYou(1) ? tx('hud.you', { name: enemy.name }) : Game.story ? tx('hud.chapterName', { n: Story.chapter + 1, name: enemy.name }) : Game.mode === 'cpu' ? tx('hud.cpu', { level: levelName(Game.level), name: enemy.name }) : Game.mode === 'aivai' ? tx('hud.ai', { name: enemy.name }) : enemy.name;
	drawText(p2name, W - 20, 64, { size: 11, align: 'right', strokeWidth: 3 });

	for (let i = 0; i < Game.roundsToWin; i++) {
		[[midX - 58 - i * 20, 0, player], [midX + 58 + i * 20, 1, enemy]].forEach(([px, side, f]) => {
			c.beginPath();
			c.arc(px, 78, 7, 0, Math.PI * 2);
			c.fillStyle = Game.wins[side] > i ? f.cfg.bar : '#1b1726';
			c.fill();
			c.strokeStyle = '#f4ecd8';
			c.lineWidth = 2;
			c.stroke();
		});
	}

	drawEnergyBar(player, 20, 78, 220, 0);
	drawEnergyBar(enemy, W - 240, 78, 220, 1);

	if (Game.combo) {
		const cmb = Game.combo;
		const age = 80 - cmb.timer;
		const s = age < 8 ? 1 + (8 - age) * 0.06 : 1;
		const x = cmb.side === 0 ? 24 : W - 24;
		const align = cmb.side === 0 ? 'left' : 'right';
		drawText(tx('hud.hits', { n: cmb.count }), x, 190, { size: Math.round(24 * s), align, color: cmb.color, strokeWidth: 6, alpha: Math.min(1, cmb.timer / 20) });
		drawText(tx('hud.combo'), x, 218, { size: 12, align, alpha: Math.min(1, cmb.timer / 20) });
	}
}

function drawBanner(text, localT, { color = '#f4ecd8', size = 56, sub = null, subColor = '#f5b041', y = H / 2 - 30 } = {}) {
	const t = clamp(localT / 14, 0, 1);
	const s = lerp(2.2, 1, easeOutBack(t));
	c.save();
	c.translate(W / 2, y);
	c.scale(s, s);
	drawText(text, 0, 0, { size, color, strokeWidth: 10, alpha: t });
	c.restore();
	if (sub) drawText(sub, W / 2, y + 64, { size: 14, color: subColor, strokeWidth: 6, alpha: t });
}

function drawBanners() {
	const t = Game.stateTimer;
	if (Game.state === 'storyWalk') {
		const a = clamp(t / 20, 0, 1);
		drawText(tx('hud.chapter', { n: Story.chapter + 1 }), W / 2, H / 2 - 70, { size: 18, color: '#f4ecd8', strokeWidth: 6, alpha: a });
		drawText(enemy.name, W / 2, H / 2 - 30, { size: 30, color: enemy.cfg.bar, strokeWidth: 8, alpha: a });
		drawText(fighterText(enemy.key).title.toUpperCase(), W / 2, H / 2 + 8, { size: 12, color: '#f4ecd8', strokeWidth: 5, alpha: a });
	}
	if (Game.state === 'intro') {
		const finalRound = Game.roundsToWin > 1 && Game.wins[0] === Game.roundsToWin - 1 && Game.wins[1] === Game.roundsToWin - 1;
		if (t < 72) {
			drawBanner(finalRound ? tx('hud.final') : tx('hud.round', { n: Game.round }), t, { size: finalRound ? 44 : 56 });
			if (Game.round === 1) {
				const a = clamp(t / 14, 0, 1);
				drawText(player.short, W / 2 - 150, H / 2 + 50, { size: 18, color: player.cfg.bar, strokeWidth: 6, alpha: a });
				drawText(tx('hud.vs'), W / 2, H / 2 + 50, { size: 14, strokeWidth: 6, alpha: a });
				drawText(enemy.short, W / 2 + 150, H / 2 + 50, { size: 18, color: enemy.tint ? '#e879f9' : enemy.cfg.bar, strokeWidth: 6, alpha: a });
			}
		} else drawBanner(tx('hud.fight'), t - 72, { color: '#f5b041', size: 72 });
	}
	if (Game.state === 'roundEnd' || (Game.state === 'paused' && Game.pausedFrom === 'roundEnd')) {
		const r = Game.result;
		if (t < 110) {
			drawBanner(r.reason === 'ko' ? tx('hud.ko') : tx('hud.time'), t, { color: r.reason === 'ko' ? '#ff6b6b' : '#f4ecd8', size: r.reason === 'ko' ? 96 : 56 });
		} else {
			let text = tx('hud.draw');
			if (r.winner >= 0) {
				const w = r.winner === 0 ? player : enemy;
				text = Game.mode === 'cpu' && r.winner === 0 ? tx('hud.youRound') : tx('hud.winsRound', { name: w.short });
			}
			drawBanner(text, t - 110, { size: 26, sub: r.perfect ? tx('hud.perfect') : null });
		}
	}
}

function render() {
	c.imageSmoothingEnabled = false;
	c.fillStyle = '#000';
	c.fillRect(0, 0, W, H);
	const shake = FX.shakeOffset();
	c.save();
	c.translate(shake.x, shake.y);
	// camera: zoom for finishers and throws, kept inside the arena
	const cam = Game.cam;
	if (cam.z > 1.001) {
		const half = { w: W / (2 * cam.z), h: H / (2 * cam.z) };
		const cx = clamp(cam.x, half.w, W - half.w);
		const cy = clamp(cam.y, half.h, H - half.h);
		c.translate(W / 2, H / 2);
		c.scale(cam.z, cam.z);
		c.translate(-cx, -cy);
	}

	ARENAS[Game.arena].draw(Game.tick);
	// a boss colours the whole arena a little
	const boss = enemy.cfg.boss ? enemy : player.cfg.boss ? player : null;
	if (boss && Game.state !== 'demo') {
		const g = c.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 640);
		g.addColorStop(0, boss.fx.aura + '0)');
		g.addColorStop(1, boss.fx.aura + '0.22)');
		c.fillStyle = g;
		c.fillRect(0, 0, W, H);
	}

	if (Game.superFreeze > 0) {
		const f = Game.superCaster;
		const a = Math.min(1, (42 - Game.superFreeze) / 8) * 0.72;
		c.fillStyle = `rgba(6, 4, 14, ${a})`;
		c.fillRect(-20, -20, W + 40, H + 40);
		c.save();
		c.globalCompositeOperation = 'lighter';
		c.strokeStyle = f.fx.aura + '0.35)';
		c.lineWidth = 3;
		for (let i = 0; i < 18; i++) {
			const ang = (i / 18) * Math.PI * 2 + Game.tick * 0.02;
			const r1 = 120 + rand(0, 40);
			c.beginPath();
			c.moveTo(f.centerX + Math.cos(ang) * r1, chestY(f) + Math.sin(ang) * r1);
			c.lineTo(f.centerX + Math.cos(ang) * 700, chestY(f) + Math.sin(ang) * 700);
			c.stroke();
		}
		c.restore();
	}

	player.drawShadow();
	enemy.drawShadow();
	const order = enemy.move && !player.move ? [player, enemy] : [enemy, player];
	order.forEach((f) => f.draw(Game.tick));

	Game.projectiles.forEach((p) => p.draw());
	FX.sprites.forEach((sp) => sp.draw());
	FX.particles.forEach((p) => p.draw());
	const visionList = [];
	if (Game.aiVision && Game.learner && Game.state !== 'demo') {
		const showPlayerAI = Game.mode === 'aivai' || Game.autopilot;
		visionList.push({ L: Game.learner, side: 1, full: true });
		if (Game.playerLearner) visionList.push({ L: Game.playerLearner, side: 0, full: showPlayerAI });
	}
	const vision = visionList.length > 0;
	visionList.filter((e) => e.full).forEach((e, i) => drawVisionWorld(e.L, Game.tick, i));
	FX.texts.forEach((t) => t.draw());
	c.restore();

	if (FX.flashAlpha > 0) {
		c.save();
		c.globalAlpha = FX.flashAlpha;
		c.fillStyle = FX.flashColor;
		c.fillRect(0, 0, W, H);
		c.restore();
	}

	if (Game.state === 'demo') {
		const g = c.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 620);
		g.addColorStop(0, 'rgba(8,6,16,0.15)');
		g.addColorStop(1, 'rgba(8,6,16,0.75)');
		c.fillStyle = g;
		c.fillRect(0, 0, W, H);
		return;
	}
	drawHUD();
	if (vision) drawVisionPanels(visionList, Game.tick);
	drawAutopilotBanner();
	drawBanners();
}

function drawAutopilotBanner() {
	if (Game.mode === 'cpu' && Game.autopilot && Game.state !== 'matchEnd') {
		const a = 0.6 + Math.sin(Game.tick * 0.12) * 0.4;
		drawText(tx('hud.autoBanner'), W / 2, 176, { size: 9, color: '#93c5fd', strokeWidth: 4, alpha: a });
	}
	if (Net.active && Net.stalledMs > 400) {
		const a = 0.6 + Math.sin(Game.tick * 0.2) * 0.4;
		drawText(tx('hud.waiting'), W / 2, H / 2 - 40, { size: 14, color: '#ffffff', strokeWidth: 6, alpha: a });
	}
	if (Game.toast) {
		const t = Game.toast;
		drawText(t.text, W / 2, 156, { size: 12, color: '#ffffff', strokeWidth: 5, alpha: Math.min(1, t.t / 20) });
	}
}

// ---------- fixed-timestep loop (same speed on 60 Hz and 120 Hz screens) ----------
let lastTime = performance.now();
let accumulator = 0;
const STEP_MS = 1000 / 60;
function frame(now) {
	requestAnimationFrame(frame);
	accumulator += Math.min(100, now - lastTime);
	lastTime = now;
	// the speed setting runs more game steps per second during matches
	const speed = Game.mode === 'net' ? Net.cfg.sp : Settings.get('speed');
	const stepMs = Game.state === 'demo' ? STEP_MS : STEP_MS / speed;
	while (accumulator >= stepMs) {
		if (Net.active) {
			// Wi-Fi: only step when the other device's input for this frame is in
			if (!Net.advance()) {
				accumulator = 0;
				break;
			}
		} else step();
		accumulator -= stepMs;
	}
	render();
	if (document.body.dataset.panel === 'select') Select.animate(Game.tick);
	if (document.body.dataset.panel === 'dialogue') Dialogue.animate(Game.tick);
}

// ---------- page UI ----------
function showPanel(id) {
	document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== id));
	document.body.dataset.panel = id;
}
function hidePanels() {
	document.querySelectorAll('.panel').forEach((p) => (p.hidden = true));
	document.body.dataset.panel = '';
	canvas.focus({ preventScroll: true });
}

function setAIVision(on, quiet = false) {
	Game.aiVision = on;
	const btn = document.getElementById('btn-vision');
	if (btn) {
		btn.textContent = tx(on ? 'chip.visionOn' : 'chip.visionOff');
		btn.setAttribute('aria-pressed', String(on));
	}
	if (!quiet && Settings.get('aiVision') !== on) Settings.set('aiVision', on);
}

function setMuted(muted) {
	Sound.enabled = !muted;
	Progress.data.settings.muted = muted;
	Progress.save();
	const btn = document.getElementById('btn-sound');
	btn.textContent = tx(muted ? 'chip.soundOff' : 'chip.soundOn');
	btn.setAttribute('aria-pressed', String(!muted));
	Music.setVolume();
}

// quick match: pick a difficulty, then fighters
function openQuickMatch() {
	showPanel('quick');
	const pick = document.querySelector(`#quick [data-level="${Game.level}"]`) || document.querySelector('#quick [data-level]');
	pick.focus({ preventScroll: true });
}

// menu: lock Hard until Medium is beaten, show the win record
function updateMenuProgress() {
	const hard = document.querySelector('#quick [data-level="hard"]');
	const open = Progress.isLevelUnlocked('hard');
	hard.classList.toggle('locked', !open);
	hard.setAttribute('aria-disabled', String(!open));
	hard.querySelector('small').textContent = tx(open ? 'level.hard.sub' : 'level.hard.locked.sub');
	hard.querySelector('b').textContent = tx(open ? 'level.hard' : 'level.hard.locked');
	const t = Progress.totals();
	const rec = document.getElementById('menu-record');
	rec.hidden = t.w + t.l === 0;
	rec.textContent = tx('menu.record', { w: t.w, l: t.l, c: t.bestCombo });
}

// called by setLanguage: redraw every piece of text that was filled in from code
function onLanguageChanged() {
	SettingsPanel.buildRows();
	SettingsPanel.refresh();
	updateMenuProgress();
	updateMemoryButton();
	updateAutopilotButton();
	setAIVision(Game.aiVision, true);
	document.getElementById('btn-sound').textContent = tx(Sound.enabled ? 'chip.soundOn' : 'chip.soundOff');
	document.getElementById('pause-title').textContent = tx(Game.mode === 'net' && Net.active ? 'pause.online' : 'pause.title');
	Select.refresh();
	if (Select.focusKey) Select.show(Select.focusKey);
	if (document.body.dataset.panel === 'settings') document.querySelector('#set-list .seg[data-key="language"].on')?.focus({ preventScroll: true });
}

function updateMemoryButton() {
	const btn = document.getElementById('btn-forget');
	if (!btn || btn.dataset.armed === 'true') return;
	const n = AIMemory.count();
	btn.textContent = n ? tx('chip.memForget', { n }) : tx('chip.memEmpty');
	btn.disabled = !n;
}
function updateAutopilotButton() {
	const btn = document.getElementById('btn-auto');
	if (!btn) return;
	btn.textContent = tx(Game.autopilot ? 'chip.autoOn' : 'chip.autoOff');
	btn.setAttribute('aria-pressed', String(Game.autopilot));
}

function setupUI() {
	setLanguage(Settings.get('language'), { quiet: true });
	document.querySelectorAll('#quick [data-level]').forEach((btn) =>
		btn.addEventListener('click', () => {
			Sound.init();
			Sound.click();
			if (!Progress.isLevelUnlocked(btn.dataset.level)) {
				btn.classList.remove('shake');
				void btn.offsetWidth;
				btn.classList.add('shake');
				return;
			}
			Select.open('cpu', btn.dataset.level);
		})
	);
	SettingsPanel.build();
	document.getElementById('btn-settings').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		SettingsPanel.open('menu');
	});
	document.getElementById('btn-pause-settings').addEventListener('click', () => {
		Sound.click();
		SettingsPanel.open('pause');
	});
	document.getElementById('chip-settings').addEventListener('click', () => {
		Sound.init();
		const panel = document.body.dataset.panel;
		if (panel === 'settings') return SettingsPanel.close();
		if (!panel) {
			togglePause();
			if (Game.state === 'paused') SettingsPanel.open('pause');
		} else if (panel === 'menu' || panel === 'pause') SettingsPanel.open(panel);
	});
	// browsers only start audio after a tap or key press; the title theme starts then
	const wake = () => Sound.init();
	window.addEventListener('pointerdown', wake, { once: true });
	window.addEventListener('keydown', wake, { once: true });
	document.getElementById('btn-quick').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		openQuickMatch();
	});
	document.getElementById('quick-back').addEventListener('click', () => {
		Sound.click();
		goToMenu();
	});
	document.getElementById('quick').addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		e.stopPropagation();
		goToMenu();
	});
	document.getElementById('btn-story').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		Story.open();
	});
	document.getElementById('btn-pvp').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		Select.open('pvp', Game.level);
	});
	document.getElementById('btn-resume').addEventListener('click', togglePause);
	document.getElementById('btn-quit').addEventListener('click', goToMenu);
	document.getElementById('btn-rematch').addEventListener('click', () => (Game.mode === 'net' ? Net.want('rematch') : startMatch(Game.mode, Game.level, Game.picks[0], Game.picks[1], Game.arena)));
	document.getElementById('btn-change').addEventListener('click', () => (Game.mode === 'net' ? Net.want('change') : Select.open(Game.mode, Game.level)));
	document.getElementById('btn-menu').addEventListener('click', goToMenu);
	document.getElementById('btn-harder').addEventListener('click', (e) => startMatch('cpu', e.currentTarget.dataset.level, Game.picks[0], Game.picks[1]));
	document.getElementById('btn-pause').addEventListener('click', togglePause);
	const visionBtn = document.getElementById('btn-vision');
	const toggleVision = () => setAIVision(!Game.aiVision);
	visionBtn.addEventListener('click', toggleVision);
	window.addEventListener('keydown', (e) => {
		if (e.code === 'KeyV' && !e.repeat && !document.body.dataset.panel) toggleVision();
	});
	document.getElementById('btn-auto').addEventListener('click', () => setAutopilot(!Game.autopilot));
	window.addEventListener('keydown', (e) => {
		if (e.code === 'KeyT' && !e.repeat && !document.body.dataset.panel) setAutopilot(!Game.autopilot);
	});
	document.getElementById('btn-wifi').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		NetUI.open();
	});
	document.getElementById('btn-aivai').addEventListener('click', () => {
		Sound.init();
		Sound.click();
		Select.open('aivai', 'medium');
	});
	const forgetBtn = document.getElementById('btn-forget');
	forgetBtn.addEventListener('click', () => {
		// two clicks so nobody wipes the memory by accident
		if (forgetBtn.dataset.armed !== 'true') {
			forgetBtn.dataset.armed = 'true';
			forgetBtn.textContent = tx('chip.memConfirm');
			setTimeout(() => {
				forgetBtn.dataset.armed = 'false';
				updateMemoryButton();
			}, 3000);
			return;
		}
		AIMemory.clear();
		forgetBtn.dataset.armed = 'false';
		forgetBtn.textContent = tx('chip.memCleared');
		setTimeout(updateMemoryButton, 1500);
	});
	updateMemoryButton();
	updateAutopilotButton();
	const soundBtn = document.getElementById('btn-sound');
	soundBtn.addEventListener('click', () => {
		Sound.init();
		setMuted(Sound.enabled);
	});
	setMuted(!!Progress.data.settings.muted);
	Settings.apply();

	const touch = document.getElementById('touch');
	const enableTouch = () => {
		touch.hidden = false;
		document.body.classList.add('has-touch');
	};
	if (window.matchMedia('(pointer: coarse)').matches) enableTouch();
	window.addEventListener('touchstart', enableTouch, { once: true, passive: true });
	setupTouch(touch);
	setupSwipe();
	if (Progress.data.settings.swipeSeen) document.getElementById('touch-tip').hidden = true;
	setupKeyboard(() => (Game.state !== 'demo' ? Game.mode : 'cpu'), togglePause);
	Select.build();
}

setupUI();
startDemo();
showPanel('menu');
updateMenuProgress();
Music.play('title');
// opened from a scanned Wi-Fi QR code: join that game
if (location.hash.startsWith('#join=')) {
	const code = location.hash.slice(6);
	history.replaceState(null, '', location.pathname + location.search);
	NetUI.fromLink(code);
}
document.fonts?.load(`16px ${FONT}`).finally(() => requestAnimationFrame(frame));
if (!document.fonts) requestAnimationFrame(frame);
