// ---------- Sprites and fighters ----------

class Sprite {
	constructor({ position, imageSrc, scale = 1, framesMax = 1, offset = { x: 0, y: 0 }, framesHold = 5 }) {
		this.position = position;
		this.image = loadImage(imageSrc);
		this.scale = scale;
		this.framesMax = framesMax;
		this.framesCurrent = 0;
		this.framesElapsed = 0;
		this.framesHold = framesHold;
		this.offset = offset;
	}
	draw() {
		if (!imageReady(this.image)) return;
		const fw = this.image.width / this.framesMax;
		c.drawImage(
			this.image,
			this.framesCurrent * fw, 0, fw, this.image.height,
			this.position.x - this.offset.x, this.position.y - this.offset.y,
			fw * this.scale, this.image.height * this.scale
		);
	}
	animateFrames() {
		this.framesElapsed++;
		if (this.framesElapsed % this.framesHold === 0) {
			this.framesCurrent = (this.framesCurrent + 1) % this.framesMax;
		}
	}
}

const SPAWN_CENTER = [225, 799];
const LUNGE_TYPES = ['charge', 'flash', 'rush'];

class Fighter {
	constructor(key, side) {
		this.side = side;
		this.speedMult = 1;
		this.damageMult = 1;
		this.energy = 0;
		this.tint = null;
		this.healthMult = 1;
		this.scripted = null;
		this.silhouette = false;
		this.setCharacter(key);
	}

	// names follow the chosen language
	get name() {
		return fighterText(this.key).name;
	}
	get short() {
		return fighterText(this.key).short;
	}

	setCharacter(key) {
		const cfg = ROSTER[key];
		this.key = key;
		this.cfg = cfg;
		this.fx = cfg.fx;
		this.stats = cfg.stats;
		this.moves = cfg.moves;
		this.scale = cfg.scale;
		this.anchor = cfg.anchor;
		this.naturalFacing = cfg.facing;
		this.width = cfg.hurt.w;
		this.height = cfg.hurt.h;
		this.groundY = FLOOR_Y - this.height;
		this.maxHealth = Math.round(cfg.stats.health * this.healthMult);
		this.anims = {};
		for (const k in cfg.sprites) {
			const s = cfg.sprites[k];
			this.anims[k] = { image: loadImage(cfg.folder + s.file), framesMax: s.frames, hold: s.hold, loop: s.loop };
		}
		this.reset();
	}

	reset() {
		this.maxHealth = Math.round(this.stats.health * this.healthMult);
		this.position = { x: SPAWN_CENTER[this.side] - this.width / 2, y: this.groundY };
		this.velocity = { x: 0, y: 0 };
		this.knockback = 0;
		this.facing = this.side === 0 ? 1 : -1;
		this.health = this.maxHealth;
		this.trailHealth = this.maxHealth;
		this.shownHealth = this.maxHealth;
		this.move = null;
		this.moveName = null;
		this.moveHit = false;
		this.stun = 0;
		this.blockStun = 0;
		this.blocking = false;
		this.dashTimer = 0;
		this.dashDir = 0;
		this.dashCooldown = 0;
		this.invuln = 0;
		this.airJumps = this.stats.airJumps;
		this.airDashes = this.stats.airDashes;
		this.heavyCooldown = 0;
		this.rageTimer = 0;
		this.grabbed = false;
		this.leapLanded = true;
		this.ko = false;
		this.combo = 0;
		this.comboTimer = 0;
		this.hitFlash = 0;
		this.afterimages = [];
		this.wasGrounded = true;
		this.running = false;
		this.anim = null;
		this.events = [];
		this.wasBlocking = false;
		this.parryTimer = 0;
		this.prevBlockHeld = false;
		this.motion = [];
		this.clock = 0;
		this.prevDirs = {};
		this.moveId = 0;
		this.setAnim('idle');
	}

	get centerX() {
		return this.position.x + this.width / 2;
	}
	get feetY() {
		return this.position.y + this.height;
	}
	get grounded() {
		return this.position.y >= this.groundY - 0.5 && this.velocity.y >= 0;
	}
	get healthPct() {
		return (this.health / this.maxHealth) * 100;
	}
	get raging() {
		return this.rageTimer > 0;
	}
	get phasing() {
		// flash step and the rush ultimate pass straight through the opponent
		const m = this.move;
		return !!m && (m.type === 'flash' || m.type === 'rush') && this.frame <= m.hitFrame + (m.active || 0);
	}
	get armored() {
		return !!this.move && !!this.move.armor && !this.animDone;
	}

	hurtbox() {
		return { x: this.position.x, y: this.position.y, w: this.width, h: this.height };
	}
	attackBoxFor(move) {
		const [near, far] = move.range;
		const [bottom, top] = move.band || [0, this.height];
		const x = this.facing === 1 ? this.centerX + near : this.centerX - far;
		return { x, y: this.feetY - top, w: far - near, h: top - bottom };
	}
	canAct() {
		return !this.ko && this.stun <= 0 && this.blockStun <= 0 && !this.move;
	}

	outgoingDamage(base) {
		let mult = this.damageMult * this.stats.damage;
		if (this.stats.fury) mult *= 1 + 0.5 * (1 - this.health / this.maxHealth);
		if (this.raging) mult *= 1.5;
		return base * mult;
	}
	gainEnergy(amount) {
		this.energy = clamp(this.energy + amount * this.stats.energyGain, 0, 100);
	}
	walkSpeed() {
		return 5 * this.speedMult * this.stats.speed * (this.raging ? 1.25 : 1);
	}

	setAnim(name, force = false, hold = null) {
		if (this.anim === name && !force) return;
		const a = this.anims[name];
		this.anim = name;
		this.frame = 0;
		this.elapsed = 0;
		this.animDone = false;
		this.hold = hold || a.hold;
	}

	startMove(name, opp, game) {
		const m = this.moves[name];
		this.events.push(name);
		this.move = m;
		this.moveName = name;
		this.moveHit = false;
		this.hitIndex = 0;
		this.lungeStop = false;
		this.setAnim(m.anim, true, m.hold);
		if (this.grounded) this.velocity.x = 0;
		if (m.cost) this.energy -= m.cost;
		this.moveId++;
		MatchStats.onMove(this, name);
		if (m.breaker) FX.text(tx('fx.breaker'), this.centerX, this.position.y - 30, '#d8b4fe', 12, 40);

		if (m.type === 'leap') {
			// jump toward the opponent and land on them
			const dist = clamp(Math.abs(opp.centerX - this.centerX) - 30, 60, 420);
			this.velocity.y = -13;
			this.velocity.x = this.facing * (dist / 37);
			this.leapLanded = false;
			FX.dust(this.centerX, FLOOR_Y, 8);
		}
		if (m.type === 'ambush') {
			// vanish in smoke and reappear behind the opponent
			FX.smoke(this.centerX, this.feetY - 60);
			const behind = clamp(opp.centerX - opp.facing * 75, 40, W - 40);
			this.position.x = behind - this.width / 2;
			this.position.y = this.groundY;
			this.velocity.x = 0;
			this.velocity.y = 0;
			this.facing = sign(opp.centerX - this.centerX) || this.facing;
			FX.smoke(this.centerX, this.feetY - 60);
		}

		if (m.big) game.onSuperStart(this, m);
		else if (m.special) Sound.special();
		else Sound.swing(!!m.heavy);
	}

	// Reads an input source (keyboard, touch or AI) and turns it into actions.
	control(input, opp, game) {
		if (this.stun > 0) this.stun--;
		if (this.blockStun > 0) this.blockStun--;
		if (this.dashCooldown > 0) this.dashCooldown--;
		if (this.heavyCooldown > 0) this.heavyCooldown--;
		if (this.invuln > 0) this.invuln--;
		if (this.rageTimer > 0) this.rageTimer--;
		if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
		if (this.parryTimer > 0) this.parryTimer--;
		this.trackMotion(input);
		this.wasBlocking = this.blocking || this.blockStun > 0;
		this.blocking = false;
		this.running = false;

		if (this.ko) {
			this.velocity.x = 0;
			return;
		}

		// story walk-ins move the fighter by script
		if (this.scripted) {
			this.velocity.x = this.scripted.vx;
			this.facing = this.scripted.face;
			this.running = true;
			return;
		}

		if (this.dashTimer > 0) {
			this.dashTimer--;
			this.velocity.x = this.dashDir * 15;
			if (!this.grounded) this.velocity.y = Math.min(this.velocity.y, 0.5);
			if (this.dashTimer % 2 === 0) this.pushAfterimage();
			return;
		}

		if (!this.canAct()) {
			if (this.grounded && !(this.move && this.move.type === 'leap')) this.velocity.x = 0;
			return;
		}

		// always turn to face the opponent when free
		const toOpp = sign(opp.centerX - this.centerX);
		if (toOpp !== 0 && Math.abs(opp.centerX - this.centerX) > 8) this.facing = toOpp;

		const sp = this.moves.special;
		const toward = this.facing > 0 ? 'right' : 'left';
		if (this.energy >= 100 && input.take('super')) return this.startMove('super', opp, game);
		if (this.energy >= sp.cost && input.take('special')) return this.startMove('special', opp, game);
		// throw: the throw button, or toward + heavy when close
		const throwPress = input.take('throw') || (input.buffer.heavy > 0 && input.held(toward) && this.canThrow(opp) && input.take('heavy'));
		if (throwPress) {
			if (this.canThrow(opp)) return game.startThrow(this, opp);
			FX.text('MISS', this.centerX, this.position.y - 20, '#9fb3c8', 10, 25);
		}
		// guard break: ↓ ← + heavy (or the virtual button the CPU uses), costs 25 power
		const breakerPress = input.take('breaker') || (input.buffer.heavy > 0 && this.motionMatch('back') && this.energy >= this.moves.breaker.cost && input.take('heavy'));
		if (breakerPress && this.energy >= this.moves.breaker.cost && this.grounded) return this.startMove('breaker', opp, game);
		// ↓ → + quick = special
		if (input.buffer.light > 0 && this.motionMatch('fwd') && this.energy >= sp.cost && input.take('light')) return this.startMove('special', opp, game);
		if (this.heavyCooldown <= 0 && input.take('heavy')) return this.startMove('heavy', opp, game);
		if (input.take('light')) return this.startMove(!this.grounded && this.moves.air ? 'air' : 'light', opp, game);

		if (this.dashCooldown <= 0 && (this.grounded || this.airDashes > 0) && input.take('dash')) {
			const dir = input.held('left') ? -1 : input.held('right') ? 1 : this.facing;
			this.dashDir = dir;
			this.dashTimer = 11;
			this.events.push('dash');
			this.dashCooldown = Math.round(42 * this.stats.dashCooldown);
			this.invuln = 9;
			if (!this.grounded) this.airDashes--;
			this.velocity.y = Math.min(this.velocity.y, 0);
			if (this.stats.blink) {
				// teleport instead of dashing
				FX.smoke(this.centerX, this.feetY - this.height / 2);
				this.position.x = clamp(this.position.x + dir * 190, 10, W - this.width - 10);
				this.dashTimer = 0;
				this.invuln = 14;
				FX.smoke(this.centerX, this.feetY - this.height / 2);
				FX.burst(this.centerX, this.feetY - this.height / 2, this.fx.glow, 16, 6);
				Sound.special();
				return;
			}
			FX.dust(this.centerX, FLOOR_Y, 8, dir);
			Sound.dash();
			return;
		}

		if (input.take('jump')) {
			if (this.grounded || this.airJumps > 0) this.events.push('jump');
			if (this.grounded) {
				this.velocity.y = -this.stats.jump;
				FX.dust(this.centerX, FLOOR_Y, 5);
				Sound.jump();
			} else if (this.airJumps > 0) {
				this.airJumps--;
				this.velocity.y = -this.stats.jump * 0.82;
				FX.particles.push(new Particle({ x: this.centerX, y: this.feetY, life: 18, size: 10, grow: 3, drag: 1, color: this.fx.glow, type: 'ring' }));
				Sound.jump();
			}
		}

		if (input.held('block') && this.grounded) {
			this.blocking = true;
			if (!this.wasBlocking) this.events.push('block');
			this.velocity.x = 0;
			return;
		}

		const dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
		const speed = this.walkSpeed();
		if (this.grounded) {
			this.velocity.x = dir * speed;
		} else {
			this.velocity.x = clamp(this.velocity.x + dir * 0.6, -speed * 1.1, speed * 1.1);
		}
		this.running = dir !== 0 && this.grounded;
	}

	// Remember recent direction presses (relative to facing) for motion inputs,
	// and open a short parry window whenever block is freshly pressed.
	trackMotion(input) {
		this.clock++;
		const dirs = {
			down: input.held('block'),
			fwd: input.held(this.facing > 0 ? 'right' : 'left'),
			back: input.held(this.facing > 0 ? 'left' : 'right'),
		};
		for (const d in dirs) {
			if (dirs[d] && !this.prevDirs[d]) {
				this.motion.push({ d, t: this.clock });
				if (this.motion.length > 8) this.motion.shift();
			}
		}
		if (dirs.down && !this.prevDirs.down && this.grounded && !this.move && this.stun <= 0) this.parryTimer = 7;
		this.prevDirs = dirs;
	}
	// true when ↓ then `dir` were pressed in the last few frames
	motionMatch(dir) {
		const m = this.motion;
		for (let i = m.length - 1; i >= 1; i--) {
			if (m[i].d !== dir || this.clock - m[i].t > 10) continue;
			for (let j = i - 1; j >= 0; j--) {
				if (m[j].d === 'down' && m[i].t - m[j].t <= 12) {
					this.motion.length = 0;
					return true;
				}
			}
		}
		return false;
	}
	canThrow(opp) {
		const reach = (this.width + opp.width) / 2 + 65;
		return this.grounded && opp.grounded && !opp.ko && opp.invuln <= 0 && opp.stun <= 0 && opp.dashTimer <= 0 && !opp.grabbed && Math.abs(opp.centerX - this.centerX) < reach;
	}

	pushAfterimage() {
		this.afterimages.push({ cx: this.centerX, feet: this.feetY, anim: this.anim, frame: this.frame, facing: this.facing, life: 14 });
	}

	physics() {
		const m = this.move;
		if (m && m.lunge && !this.lungeStop) {
			const windowEnd = LUNGE_TYPES.includes(m.type) ? m.hitFrame + (m.active || 0) : m.hitFrame - 1;
			if (this.frame <= windowEnd && (this.grounded || LUNGE_TYPES.includes(m.type))) {
				this.velocity.x = this.facing * m.lunge;
				if (LUNGE_TYPES.includes(m.type)) {
					this.velocity.y = Math.min(this.velocity.y, 0);
					if (this.elapsed % 2 === 0) this.pushAfterimage();
				}
			} else if (this.grounded) {
				this.velocity.x = 0;
			}
		}
		if (this.phasing) this.invuln = Math.max(this.invuln, 2);

		this.position.x += this.velocity.x + this.knockback;
		this.knockback *= 0.82;
		if (Math.abs(this.knockback) < 0.1) this.knockback = 0;

		this.position.y += this.velocity.y;
		if (this.position.y >= this.groundY) {
			if (!this.wasGrounded && this.velocity.y > 4) FX.dust(this.centerX, FLOOR_Y, 6);
			this.position.y = this.groundY;
			this.velocity.y = 0;
			this.airJumps = this.stats.airJumps;
			this.airDashes = this.stats.airDashes;
			if (m && m.type === 'leap' && !this.leapLanded) {
				this.leapLanded = true;
				this.velocity.x = 0;
				this.frame = m.hitFrame;
				this.elapsed = 0;
			}
		} else {
			this.velocity.y += GRAVITY * this.stats.gravity;
		}
		this.wasGrounded = this.position.y >= this.groundY;
		if (!this.scripted) this.position.x = clamp(this.position.x, 10, W - this.width - 10);

		this.afterimages.forEach((a) => a.life--);
		this.afterimages = this.afterimages.filter((a) => a.life > 0);
		if (this.hitFlash > 0) this.hitFlash--;

		// trailing "damage" bar for the HUD
		this.shownHealth = lerp(this.shownHealth, this.health, 0.25);
		if (this.trailHealth > this.health) this.trailHealth -= 0.4 * (this.maxHealth / 100);
		else this.trailHealth = this.health;
	}

	updateAnim() {
		if (this.ko) {
			this.setAnim('death');
		} else if (this.stun > 0) {
			this.setAnim('takeHit');
		} else if (this.move) {
			if (this.animDone) {
				if (this.moveName === 'heavy') this.heavyCooldown = this.move.cooldown;
				this.move = null;
				this.moveName = null;
			}
		}
		if (!this.ko && this.stun <= 0 && !this.move) {
			if (!this.grounded) this.setAnim(this.velocity.y < 0 ? 'jump' : 'fall');
			else if (this.dashTimer > 0 && this.anims.roll) this.setAnim('roll');
			else if (this.running || this.dashTimer > 0) this.setAnim('run');
			else if ((this.blocking || this.blockStun > 0) && this.anims.defend) this.setAnim('defend');
			else this.setAnim('idle');
		}

		// advance animation frames
		const a = this.anims[this.anim];
		this.elapsed++;
		if (this.elapsed % this.hold === 0) {
			const leapHold = this.move && this.move.type === 'leap' && !this.leapLanded && this.frame >= this.move.hitFrame - 1;
			if (leapHold) {
				// hang in the wind-up pose until the fighter lands
			} else if (this.frame < a.framesMax - 1) this.frame++;
			else if (a.loop) this.frame = 0;
			else this.animDone = true;
		}
	}

	drawSprite(animName, frame, cx, feet, facing, alpha = 1, flash = false) {
		const a = this.anims[animName];
		const img = a.image;
		if (!imageReady(img)) return;
		const fw = img.width / a.framesMax;
		const fh = img.height;
		const flip = facing !== this.naturalFacing;
		c.save();
		c.globalAlpha = alpha;
		c.translate(Math.round(cx), Math.round(feet));
		if (flip) c.scale(-1, 1);
		const filters = [];
		if (this.tint) filters.push(this.tint);
		if (flash) filters.push('brightness(2.4) saturate(0.4)');
		if (filters.length) c.filter = filters.join(' ');
		c.drawImage(img, Math.min(frame, a.framesMax - 1) * fw, 0, fw, fh, -this.anchor[0] * this.scale, -this.anchor[1] * this.scale, fw * this.scale, fh * this.scale);
		c.restore();
	}

	drawShadow() {
		const height = this.groundY - this.position.y;
		const s = clamp(1 - height / 300, 0.35, 1);
		c.save();
		c.globalAlpha = 0.35 * s;
		c.fillStyle = '#000';
		c.beginPath();
		c.ellipse(this.centerX, FLOOR_Y + 2, (this.width * 0.9) * s, 9 * s, 0, 0, Math.PI * 2);
		c.fill();
		c.restore();
	}

	drawAura(tick) {
		if (this.ko) return;
		const rage = this.raging;
		if (this.energy < 100 && !rage) return;
		const aura = rage ? 'rgba(239,68,68,' : this.fx.aura;
		const pulse = (rage ? 0.8 : 0.5) + Math.sin(tick * (rage ? 0.3 : 0.15)) * 0.25;
		const cx = this.centerX;
		const cy = this.feetY - this.height / 2 + 10;
		c.save();
		c.globalCompositeOperation = 'lighter';
		const g = c.createRadialGradient(cx, cy, 10, cx, cy, 130);
		g.addColorStop(0, aura + (0.35 * pulse) + ')');
		g.addColorStop(1, aura + '0)');
		c.fillStyle = g;
		c.beginPath();
		c.ellipse(cx, cy, 85, this.height * 0.85, 0, 0, Math.PI * 2);
		c.fill();
		c.restore();
		if (tick % (rage ? 2 : 3) === 0) {
			FX.particles.push(new Particle({ x: cx + rand(-40, 40), y: this.feetY, vx: 0, vy: rand(-3.5, -1.5), life: 34, size: rand(2, 4), color: rage ? '#fca5a5' : this.fx.spark, type: 'ember', drag: 0.99 }));
		}
	}

	drawShield(tick) {
		if (!this.blocking && this.blockStun <= 0) return;
		const cx = this.centerX + this.facing * (this.width / 2 + 6);
		const cy = this.feetY - this.height / 2 + 10;
		const strong = this.blockStun > 0 ? 1 : 0.6;
		const col = this.stats.noChip ? '253,224,71' : '147,197,253';
		c.save();
		c.globalCompositeOperation = 'lighter';
		c.strokeStyle = `rgba(${col},${0.7 * strong})`;
		c.fillStyle = `rgba(${col},${0.12 * strong})`;
		c.lineWidth = 3;
		const start = this.facing === 1 ? -Math.PI / 2 : Math.PI / 2;
		c.beginPath();
		c.ellipse(cx, cy, 34 + Math.sin(tick * 0.3) * 2, this.height * 0.58, 0, start, start + Math.PI);
		c.fill();
		c.stroke();
		c.restore();
	}

	draw(tick) {
		if (this.silhouette) {
			// boss entrance: a black shape with a glowing rim
			c.save();
			c.filter = 'brightness(0)';
			c.shadowColor = this.fx.glow;
			c.shadowBlur = 18;
			this.drawSprite(this.anim, this.frame, this.centerX, this.feetY, this.facing, 1);
			c.restore();
			return;
		}
		this.afterimages.forEach((a) => this.drawSprite(a.anim, a.frame, a.cx, a.feet, a.facing, (a.life / 14) * 0.35));
		this.drawAura(tick);
		if (this.move && this.move.breaker && this.frame <= this.move.hitFrame) {
			// purple outline so the opponent can see the guard break coming
			c.save();
			c.filter = 'brightness(0) invert(1) sepia(1) hue-rotate(220deg) saturate(6)';
			const o = 3 + Math.sin(tick * 0.6) * 1.5;
			[[-o, 0], [o, 0], [0, -o]].forEach(([dx, dy]) => this.drawSprite(this.anim, this.frame, this.centerX + dx, this.feetY + dy, this.facing, 0.55));
			c.restore();
		}
		this.drawSprite(this.anim, this.frame, this.centerX, this.feetY, this.facing, 1, this.hitFlash > 0);
		this.drawShield(tick);
	}
}
