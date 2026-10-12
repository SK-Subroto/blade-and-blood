// ---------- CPU opponent ----------
// The AI "sees" the player through a short delay (its reaction time), decides on a plan
// every few frames, and presses the same virtual buttons a human would. Difficulty changes
// how fast it reacts, how often it blocks, punishes, combos and uses specials, plus a small
// speed/damage handicap or bonus.

const AI_LEVELS = {
	easy: {
		label: 'EASY',
		reaction: 30, think: 14, attackGap: 46,
		aggression: 0.35, block: 0.15, attack: 0.4, heavy: 0.15, special: 0.15, superUse: 0.25,
		dodge: 0.12, combo: 0.05, antiAir: 0.05, punish: 0.1, mistake: 0.25,
		speed: 0.85, damage: 0.75, learn: 0.35, parry: 0, tech: 0.1, throwUse: 0.15,
	},
	medium: {
		label: 'MEDIUM',
		reaction: 16, think: 8, attackGap: 24,
		aggression: 0.6, block: 0.45, attack: 0.65, heavy: 0.3, special: 0.35, superUse: 0.55,
		dodge: 0.4, combo: 0.4, antiAir: 0.35, punish: 0.45, mistake: 0.08,
		speed: 1, damage: 1, learn: 0.7, parry: 0.12, tech: 0.35, throwUse: 0.4,
	},
	hard: {
		label: 'HARD',
		reaction: 7, think: 3, attackGap: 9,
		aggression: 0.82, block: 0.78, attack: 0.88, heavy: 0.4, special: 0.55, superUse: 0.9,
		dodge: 0.75, combo: 0.85, antiAir: 0.75, punish: 0.9, mistake: 0.01,
		speed: 1.12, damage: 1.15, learn: 1, parry: 0.35, tech: 0.6, throwUse: 0.65,
	},
};

const AI_MELEE = ['charge', 'flash', 'leap', 'rush', 'ambush', 'sweep'];

class AIController extends InputState {
	constructor(self, opponent, levelKey) {
		super();
		this.self = self;
		this.opp = opponent;
		this.setLevel(levelKey);
	}

	setLevel(levelKey) {
		this.levelKey = levelKey;
		const base = AI_LEVELS[levelKey];
		// blend the difficulty with this fighter's personality
		const st = this.self.cfg.ai;
		const p = (v) => clamp(v, 0, 0.97);
		this.style = st;
		this.lv = Object.assign({}, base, {
			aggression: p(base.aggression * st.aggression),
			block: p(base.block * st.block),
			special: p(base.special * st.special),
			parry: p(base.parry * (this.self.cfg.boss ? 1.6 : 1)),
		});
		this.self.speedMult = base.speed;
		this.self.damageMult = base.damage;
		this.resetMemory();
	}

	resetMemory() {
		this.clear();
		this.history = [];
		this.thinkTimer = 0;
		this.moveDir = 0;
		this.moveTimer = 0;
		this.blockTimer = 0;
		this.attackCooldown = 30;
		this.idleTimer = 0;
		this.pending = null;
	}

	snapshot() {
		const o = this.opp;
		return {
			cx: o.centerX,
			y: o.position.y,
			vy: o.velocity.y,
			grounded: o.grounded,
			moveName: o.moveName,
			move: o.move,
			frame: o.frame,
			stun: o.stun,
			ko: o.ko,
			blocking: o.blocking,
			health: o.healthPct,
		};
	}

	tap(action) {
		this.buffer[action] = BUFFER_FRAMES;
	}

	// called once per game frame, before the fighter reads its input
	update(projectiles) {
		this.history.push(this.snapshot());
		while (this.history.length > this.lv.reaction + 1) this.history.shift();
		const seen = this.history[0];

		if (this.attackCooldown > 0) this.attackCooldown--;
		if (this.moveTimer > 0 && --this.moveTimer === 0) this.moveDir = 0;
		if (this.blockTimer > 0) this.blockTimer--;

		this.down.left = this.moveDir < 0;
		this.down.right = this.moveDir > 0;
		this.down.block = this.blockTimer > 0;
		this.down.jump = false;

		if (this.self.ko || seen.ko) {
			this.moveDir = 0;
			this.blockTimer = 0;
			return;
		}

		this.airCheck();
		this.reflexes();
		if (this.pending && this.runPending(seen)) return;

		if (this.idleTimer > 0) {
			this.idleTimer--;
			return;
		}

		if (--this.thinkTimer > 0) return;
		this.thinkTimer = this.lv.think + Math.floor(rand(0, this.lv.think));
		this.decide(seen, projectiles);
		this.down.left = this.moveDir < 0;
		this.down.right = this.moveDir > 0;
		this.down.block = this.blockTimer > 0;
	}

	walk(dir, frames) {
		this.moveDir = dir;
		this.moveTimer = frames;
		this.blockTimer = 0;
	}

	guard(frames) {
		this.blockTimer = frames;
		this.moveDir = 0;
		this.moveTimer = 0;
	}

	attack(name) {
		this.tap(name);
		this.moveDir = 0;
		this.blockTimer = 0;
		this.attackCooldown = this.lv.attackGap + Math.floor(rand(0, this.lv.attackGap * 0.5));
	}

	decide(seen, projectiles) {
		const me = this.self;
		const lv = this.lv;
		const st = this.style;
		const dx = seen.cx - me.centerX;
		const dist = Math.abs(dx);
		const dir = sign(dx) || me.facing;
		const myReach = me.moves.light.range[1] - 5;
		const myHeavyReach = me.moves.heavy.range[1] - 5;
		const oppReach = this.opp.moves.heavy.range[1] + 30;
		const lowHealth = me.healthPct < 35;
		const sp = me.moves.special;
		const sup = me.moves.super;
		const isMelee = (m) => !m.special || AI_MELEE.includes(m.type);
		const cornered = (me.position.x < 70 && dir > 0) || (me.position.x > W - 130 && dir < 0);

		if (chance(lv.mistake)) {
			// hesitate or wander a little, which keeps easier levels beatable
			if (chance(0.5)) this.idleTimer = Math.floor(rand(15, 40));
			else this.walk(chance(0.5) ? dir : -dir, Math.floor(rand(10, 30)));
			return;
		}

		// 0. a ground quake is coming: get off the floor
		if (seen.move && seen.move.type === 'quake' && seen.frame <= seen.move.hitFrame && me.canAct() && chance(lv.dodge + 0.1)) {
			this.tap('jump');
			return;
		}

		// 1. incoming projectile
		const threat = projectiles.find((p) => p.active && p.owner !== me && p.vx && sign(me.centerX - p.x) === sign(p.vx) && Math.abs(me.centerX - p.x) < 340);
		const rain = projectiles.find((p) => p.owner !== me && !p.dead && (p.kind === 'rain' || p.kind === 'spell') && Math.abs(p.x - me.centerX) < 90);
		if (rain && me.canAct() && chance(lv.dodge)) return this.walk(sign(me.centerX - rain.x) || -dir, 18);
		if (threat && me.canAct()) {
			if (chance(lv.dodge)) {
				if (me.energy >= sp.cost && !AI_MELEE.includes(sp.type) && threat.power <= 1 && chance(lv.special * 0.6)) return this.attack('special');
				if (threat.kind === 'wave') {
					this.tap('jump');
					return;
				}
				if (threat.big || chance(0.55)) {
					if (me.dashCooldown <= 0 && chance(0.5)) {
						// dash through it using the dash's invulnerability
						this.walk(sign(threat.x - me.centerX), 4);
						this.tap('dash');
						return;
					}
					this.tap('jump');
					this.walk(-sign(threat.vx), 18);
					return;
				}
				return this.guard(26);
			}
		}

		// 1b. use what the learner has figured out about this player
		if (this.learner && me.canAct() && this.counterPlan(seen, dist, dir, myReach, myHeavyReach, oppReach)) return;

		// 2. opponent is swinging at us
		if (seen.move && isMelee(seen.move) && seen.move.type !== 'quake' && dist < oppReach + (seen.move.lunge ? 160 : 0) && seen.frame <= seen.move.hitFrame + (seen.move.active || 0)) {
			if (seen.move.type !== 'ambush' && chance(lv.block)) return this.guard(seen.move.heavy ? 28 : 20);
			if (chance(lv.dodge * 0.4) && me.dashCooldown <= 0) {
				this.walk(-dir, 4);
				this.tap('dash');
				return;
			}
		}

		if (!me.canAct() || this.attackCooldown > 0) {
			// waiting to recover: keep a little space or stay guarded
			if (dist < oppReach && chance(lv.block * 0.5)) this.guard(14);
			return;
		}

		// 3. punish a whiffed attack
		if (seen.move && isMelee(seen.move) && seen.frame > seen.move.hitFrame + (seen.move.active || 0) && dist < myHeavyReach + 30 && chance(lv.punish)) {
			if (dist > myReach && me.dashCooldown <= 0) {
				this.walk(dir, 6);
				this.tap('dash');
				return;
			}
			return this.attack(dist <= myHeavyReach && me.heavyCooldown <= 0 ? 'heavy' : 'light');
		}

		// 4. keep a combo going
		if (seen.stun > 0 && dist < myHeavyReach && chance(lv.combo)) {
			if (me.energy >= 100 && ['rush', 'ambush', 'blast', 'volley'].includes(sup.type) && chance(lv.superUse * 0.5)) return this.attack('super');
			const finisher = me.combo >= 2 && me.heavyCooldown <= 0;
			return this.attack(finisher ? 'heavy' : 'light');
		}

		// 5. anti-air
		if (!seen.grounded && dist < myHeavyReach + 60) {
			if (chance(lv.antiAir)) {
				if (dist < myHeavyReach && seen.vy > -6) return this.attack(me.heavyCooldown <= 0 ? 'heavy' : 'light');
				return this.guard(16);
			}
		}

		// 6. ultimate, chosen by what it does
		if (me.energy >= 100 && chance(lv.superUse * 0.5)) {
			const want = seen.stun > 0 || seen.health < 35 || lowHealth || chance(0.2);
			const use = {
				blast: want && dist > 120,
				volley: want && dist > 120,
				fan: want && dist > 120,
				spell3: want,
				sweep: want && dist < 330,
				rain: want,
				quake: want && seen.grounded,
				rush: want && dist < 450,
				ambush: want && seen.grounded,
				rage: !me.raging && (dist < 320 || lowHealth),
			}[sup.type];
			if (use) return this.attack('super');
		}

		// 7. special move, used at the range it works best
		if (me.energy >= sp.cost) {
			const ranged = !AI_MELEE.includes(sp.type) && sp.type !== 'leap';
			const ok = ranged ? dist > (st.zone ? 220 : 300) : sp.type === 'leap' ? dist > 160 && dist < 430 : dist > 130 && dist < 380;
			if (ok && chance(lv.special * 0.4)) return this.attack('special');
		}

		// 8. keep-away fighters back off when you get close
		if (st.zone && dist < st.zone - 90 && chance(0.55)) {
			if (cornered) {
				this.tap('jump');
				return this.walk(dir, 30);
			}
			if (dist < myReach && chance(lv.attack * 0.6)) return this.attack('light');
			if (chance(0.3 * st.jump)) this.tap('jump');
			return this.walk(-dir, Math.floor(rand(14, 26)));
		}

		// 9. in striking range
		if (dist < myReach + 10) {
			if ((seen.blocking || chance(0.05)) && me.canThrow(this.opp) && chance(lv.throwUse)) {
				this.tap('throw');
				this.attackCooldown = lv.attackGap;
				return;
			}
			if (seen.blocking && me.energy >= me.moves.breaker.cost && chance(lv.throwUse * 0.4)) return this.attack('breaker');
			if (seen.blocking && chance(0.4)) {
				// opponent is turtling: back off or go around
				if (chance(0.5)) return this.walk(-dir, 14);
				this.tap('jump');
				return this.walk(dir, 20);
			}
			if (chance(lv.attack)) {
				const heavy = me.heavyCooldown <= 0 && chance(lv.heavy) && dist < myHeavyReach;
				return this.attack(heavy ? 'heavy' : 'light');
			}
			if (chance(lv.block * 0.5)) return this.guard(16);
			return this.walk(-dir, Math.floor(rand(8, 18)));
		}

		// 10. cornered: jump out
		if (cornered && dist < 260 && chance(0.25 + lv.dodge * 0.3)) {
			this.tap('jump');
			return this.walk(dir, 30);
		}

		// 11. footsies: approach, hover or jump in
		if (st.zone && dist < st.zone + 60) {
			// zoners are happy at this distance: hold position and wait for a chance
			if (chance(0.5)) return this.guard(10);
			this.idleTimer = Math.floor(rand(6, 16));
			return;
		}
		const aggression = lowHealth ? lv.aggression * 0.8 : lv.aggression;
		if (chance(aggression)) {
			if (dist > 420 && me.dashCooldown <= 0 && chance(lv.aggression * 0.3)) {
				this.walk(dir, 8);
				this.tap('dash');
				return;
			}
			if (dist < 330 && chance(0.12 * st.jump)) {
				this.tap('jump');
				return this.walk(dir, 26);
			}
			return this.walk(dir, Math.floor(rand(10, 30)));
		}
		if (chance(0.5)) return this.walk(-dir, Math.floor(rand(8, 20)));
		this.idleTimer = Math.floor(rand(4, 14));
	}

	// Throw escapes and parries are timing skills: rolled once per grab / per incoming swing.
	reflexes() {
		const me = this.self;
		const opp = this.opp;
		const g = typeof Game !== 'undefined' ? Game.grab : null;
		if (g && g.def === me) {
			if (this.techFor !== g) {
				this.techFor = g;
				this.techAt = chance(this.lv.tech) ? Math.floor(rand(3, THROW_TECH_WINDOW)) : -1;
			}
			if (g.t === this.techAt) this.tap('heavy');
			return;
		}
		const m = opp.move;
		if (m && !m.projectile && !m.unblockable && !m.big && opp.moveId !== this.parryFor && me.grounded && (me.canAct() || me.blocking)) {
			const toHit = (m.hitFrame - opp.frame) * opp.hold - (opp.elapsed % opp.hold);
			const dist = Math.abs(opp.centerX - me.centerX);
			if (toHit > 0 && toHit <= 6 && dist < (m.range ? m.range[1] : 200) + 40) {
				this.parryFor = opp.moveId;
				if (chance(this.lv.parry)) {
					me.parryTimer = 7;
					this.guard(16);
				}
			}
		}
	}

	// Pick a counter for the player's most likely next action. The more the learner has
	// seen (confidence) and the surer it is (p), the more often the CPU acts on it.
	counterPlan(seen, dist, dir, myReach, myHeavyReach, oppReach) {
		const L = this.learner;
		const pr = L.pred;
		if (!pr || L.samples < 4) return false;
		const me = this.self;
		const sp = me.moves.special;
		const strength = Math.min(0.8, pr.p * L.confidence * this.lv.learn);
		if (!chance(strength)) return false;
		const ranged = !AI_MELEE.includes(sp.type) && sp.type !== 'leap';
		switch (pr.top) {
			case 'light':
			case 'heavy':
				// block the swing we expect, then punish its recovery
				if (dist < oppReach + 40) {
					this.pending = { type: 'guard', t: pr.top === 'heavy' ? 40 : 32 };
					this.moveDir = 0;
					L.noteCounter(tx('ctr.blockPunish'));
					return true;
				}
				break;
			case 'jump':
				// they like to jump in: step back so the jump-in lands short, then poke on landing
				if (dist < myHeavyReach + 60 && dist > myReach * 0.6) {
					this.walk(-dir, 14);
					this.pending = { type: 'landing', t: 40 };
					L.noteCounter(tx('ctr.spacePoke'));
					return true;
				}
				break;
			case 'special':
			case 'super':
				if (dist > 220) {
					this.tap('jump');
					this.walk(dir, 26);
					L.noteCounter(tx('ctr.jumpIn'));
				} else {
					this.pending = { type: 'guard', t: 40 };
					this.moveDir = 0;
					L.noteCounter(tx('ctr.blockPunish'));
				}
				return true;
			case 'dash':
			case 'approach':
				// they are about to walk into range: swing first
				if (dist < myReach + 30 && this.attackCooldown <= 0) {
					this.attack('light');
					L.noteCounter(tx('ctr.poke'));
					return true;
				}
				if (dist < myReach + 260) {
					this.pending = { type: 'poke', t: 28 };
					this.moveDir = 0;
					L.noteCounter(tx('ctr.poke'));
					return true;
				}
				break;
			case 'retreat':
			case 'wait':
				if (ranged && me.energy >= sp.cost && dist > 200) {
					this.attack('special');
					L.noteCounter(tx('ctr.zone'));
					return true;
				}
				if (me.dashCooldown <= 0 && dist > 260) {
					this.walk(dir, 8);
					this.tap('dash');
					L.noteCounter(tx('ctr.chase'));
					return true;
				}
				break;
			case 'throw':
				if (dist < 170) {
					this.tap('jump');
					this.walk(-dir, 12);
					L.noteCounter(tx('ctr.jumpOut'));
					return true;
				}
				break;
			case 'breaker':
				if (dist < oppReach + 60 && me.dashCooldown <= 0) {
					this.walk(-dir, 6);
					this.tap('dash');
					L.noteCounter(tx('ctr.backOff'));
					return true;
				}
				break;
			case 'block':
				if (dist < myReach + 40) {
					this.tap('jump');
					this.walk(dir, 24);
					L.noteCounter(tx('ctr.crossUp'));
					return true;
				}
				if (ranged && me.energy >= sp.cost) {
					this.attack('special');
					L.noteCounter(tx('ctr.chip'));
					return true;
				}
				break;
		}
		return false;
	}

	// A counter that waits for the right moment. It was planned ahead from the prediction,
	// so it reacts to the live state instead of waiting out the normal reaction delay.
	runPending(seen) {
		const me = this.self;
		const pd = this.pending;
		const now = this.history[this.history.length - 1];
		const dist = Math.abs(now.cx - me.centerX);
		if (--pd.t <= 0) {
			this.pending = null;
			return false;
		}
		if (pd.type === 'guard') {
			this.down.left = this.down.right = false;
			this.down.block = true;
			if (me.blockStun > 0) pd.blocked = true;
			const m = now.move;
			const recovering = m && !m.projectile && now.frame > m.hitFrame + (m.active || 0);
			// strike back the moment our block-stun ends, or when their swing whiffs
			if (me.canAct() && (pd.blocked || recovering) && dist < me.moves.heavy.range[1]) {
				this.pending = null;
				this.down.block = false;
				this.attack(dist < me.moves.light.range[1] - 10 ? 'light' : me.heavyCooldown <= 0 ? 'heavy' : 'light');
			}
			return true;
		}
		if (!me.canAct()) return true;
		const height = this.opp.groundY - now.y;
		if (pd.type === 'antiair' && !now.grounded && now.vy > -2 && height < 170 && dist < me.moves.heavy.range[1] + 10) {
			this.pending = null;
			this.attack(me.heavyCooldown <= 0 ? 'heavy' : 'light');
		} else if (pd.type === 'landing') {
			if (!now.grounded) pd.air = true;
			else if (pd.air && dist < me.moves.light.range[1] + 20) {
				this.pending = null;
				this.attack('light');
			}
		} else if (pd.type === 'poke' && dist < me.moves.light.range[1]) {
			this.pending = null;
			this.attack('light');
		}
		return true;
	}

	// air attack when falling onto the opponent
	airCheck() {
		const me = this.self;
		if (me.grounded || !me.canAct() || this.attackCooldown > 0) return;
		const dist = Math.abs(this.opp.centerX - me.centerX);
		if (me.velocity.y > 0 && dist < me.moves.light.range[1] && chance(this.lv.attack * 0.25)) this.attack('light');
	}
}
