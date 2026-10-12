// ---------- Visual effects: particles, floating text, projectiles, screen shake ----------

class Particle {
	constructor({ x, y, vx = 0, vy = 0, life = 30, size = 3, color = '#fff', type = 'spark', gravity = 0, drag = 0.92, grow = 0 }) {
		Object.assign(this, { x, y, vx, vy, life, maxLife: life, size, color, type, gravity, drag, grow });
	}
	update() {
		this.x += this.vx;
		this.y += this.vy;
		this.vx *= this.drag;
		this.vy = this.vy * this.drag + this.gravity;
		this.size += this.grow;
		this.life--;
	}
	draw() {
		const t = this.life / this.maxLife;
		c.save();
		switch (this.type) {
			case 'spark': {
				c.globalCompositeOperation = 'lighter';
				c.globalAlpha = t;
				c.strokeStyle = this.color;
				c.lineWidth = this.size;
				c.lineCap = 'round';
				c.beginPath();
				c.moveTo(this.x, this.y);
				c.lineTo(this.x - this.vx * 2.5, this.y - this.vy * 2.5);
				c.stroke();
				break;
			}
			case 'glow': {
				c.globalCompositeOperation = 'lighter';
				c.globalAlpha = t * 0.8;
				const g = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
				g.addColorStop(0, this.color);
				g.addColorStop(1, 'rgba(0,0,0,0)');
				c.fillStyle = g;
				c.beginPath();
				c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
				c.fill();
				break;
			}
			case 'ring': {
				c.globalCompositeOperation = 'lighter';
				c.globalAlpha = t;
				c.strokeStyle = this.color;
				c.lineWidth = 4 * t + 1;
				c.beginPath();
				c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
				c.stroke();
				break;
			}
			case 'dust': {
				c.globalAlpha = t * 0.5;
				c.fillStyle = this.color;
				c.beginPath();
				c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
				c.fill();
				break;
			}
			case 'ember': {
				c.globalCompositeOperation = 'lighter';
				c.globalAlpha = Math.min(1, t * 2) * 0.8;
				c.fillStyle = this.color;
				c.fillRect(this.x, this.y, this.size, this.size);
				break;
			}
		}
		c.restore();
	}
}

class FloatText {
	constructor({ text, x, y, color = '#fff', size = 16, life = 50, vy = -1.2 }) {
		Object.assign(this, { text, x, y, color, size, life, maxLife: life, vy });
	}
	update() {
		this.y += this.vy;
		this.vy *= 0.95;
		this.life--;
	}
	draw() {
		const t = this.life / this.maxLife;
		const pop = this.maxLife - this.life < 6 ? 1 + (6 - (this.maxLife - this.life)) * 0.08 : 1;
		drawText(this.text, this.x, this.y, { size: Math.round(this.size * pop), color: this.color, alpha: Math.min(1, t * 2), strokeWidth: 5 });
	}
}

// Projectile kinds. `power` decides clashes: the higher one survives, equal ones cancel.
const PROJECTILE_KINDS = {
	orb: { w: 34, h: 34, speed: 11, life: 160, power: 1, stun: 26, push: 8 },
	blast: { w: 70, h: 70, speed: 9, life: 200, power: 3, stun: 48, push: 16, lift: -9, big: true },
	crescent: { w: 30, h: 80, speed: 13, life: 120, power: 1, stun: 24, push: 7 },
	homing: { w: 34, h: 34, speed: 7.5, life: 200, power: 1, stun: 26, push: 7 },
	lance: { w: 110, h: 18, speed: 15, life: 100, power: 2, stun: 28, push: 9 },
	spear: { w: 100, h: 16, speed: 15, life: 100, power: 1, stun: 26, push: 8 },
	knife: { w: 26, h: 10, speed: 15, life: 90, power: 1, stun: 14, push: 3 },
	wave: { w: 46, h: 50, speed: 8.5, life: 150, power: 1, stun: 32, push: 9, lift: -8 },
	rain: { w: 34, h: 34, speed: 0, life: 200, power: 0, stun: 20, push: 4 },
	sprite: { w: 52, h: 28, speed: 11, life: 140, power: 1, stun: 26, push: 8 },
	spell: { w: 64, h: 160, speed: 0, life: 64, power: 0, stun: 34, push: 3, lift: -10 },
};

class Projectile {
	constructor({ owner, kind, x, y, dir, damage, target = null, delay = 0, vy = 0, speedMult = 1 }) {
		const k = PROJECTILE_KINDS[kind];
		this.owner = owner;
		this.moveId = owner.moveId; // which attack fired it, for accuracy stats
		this.kind = kind;
		this.k = k;
		this.x = x;
		this.y = y;
		this.dir = dir;
		this.vx = dir * k.speed * speedMult;
		this.vy = vy;
		this.w = k.w;
		this.h = k.h;
		this.power = k.power;
		this.big = !!k.big;
		this.damage = damage;
		this.target = target;
		this.delay = delay;
		this.colors = owner.fx;
		this.life = k.life;
		this.trail = [];
		this.dead = false;
		this.t = 0;
		if (kind === 'spear') this.image = loadImage(owner.cfg.folder + 'Spear move.png');
		if (kind === 'sprite') {
			this.sheet = owner.cfg.projectile;
			this.image = loadImage(owner.cfg.folder + this.sheet.fly.file);
		}
		if (kind === 'spell') {
			this.sheet = owner.cfg.spell;
			this.image = loadImage(owner.cfg.folder + this.sheet.file);
		}
	}
	get active() {
		if (this.kind === 'spell') {
			// the hand only hurts while it is down (frames 6-10 of the summon)
			const f = Math.floor(this.t / 4);
			return this.delay <= 0 && !this.dead && f >= 6 && f <= 10 && !this.spent;
		}
		return this.delay <= 0 && !this.dead;
	}
	// called once when the projectile is removed
	cleanup() {
		if (this.kind === 'sprite' && this.sheet.boom) {
			FX.sprites.push(new SpriteFX({ image: loadImage(this.owner.cfg.folder + this.sheet.boom.file), frames: this.sheet.boom.frames, scale: this.sheet.boom.scale, x: this.x, y: this.y, flip: this.dir < 0 }));
		}
	}
	box() {
		if (this.kind === 'spell') return { x: this.x - this.w / 2, y: FLOOR_Y - this.h, w: this.w, h: this.h };
		return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
	}
	hitProps() {
		const k = this.k;
		return { damage: this.damage, stun: k.stun, push: k.push, lift: k.lift, big: this.big, energy: this.big ? 0 : 6, projectile: true, moveId: this.moveId };
	}
	update() {
		if (this.delay > 0) {
			this.delay--;
			if (this.delay === 0 && this.kind === 'knife') Sound.swing(false);
			return;
		}
		this.t++;
		this.trail.push({ x: this.x, y: this.y });
		if (this.trail.length > (this.big ? 14 : 9)) this.trail.shift();
		if (this.kind === 'homing' && this.target && !this.target.ko) {
			// drift toward the target's chest
			const ty = this.target.feetY - this.target.height * 0.55;
			this.vy = clamp(this.vy + sign(ty - this.y) * 0.3, -3.6, 3.6);
		}
		if (this.kind === 'orb' || this.kind === 'blast') this.y += Math.sin(this.t * 0.3) * (this.big ? 0.6 : 0.3);
		this.x += this.vx;
		this.y += this.vy;
		if (this.kind === 'rain') {
			this.vy += 0.35;
			if (this.y >= FLOOR_Y - 10) {
				this.dead = true;
				FX.burst(this.x, FLOOR_Y - 10, this.colors.glow, 14, 7);
				FX.dust(this.x, FLOOR_Y, 4);
				Sound.explode();
			}
		}
		this.life--;
		if (this.life <= 0 || this.x < -120 || this.x > W + 120) this.dead = true;
		if (this.kind === 'spell' && this.t === 24) {
			FX.shake(5, 10);
			FX.dust(this.x, FLOOR_Y, 8);
			Sound.explode();
		}
		this.emit();
	}
	emit() {
		const spark = (opts) => FX.particles.push(new Particle(Object.assign({ x: this.x, y: this.y, life: 18, size: 2.5, color: this.colors.spark, type: 'spark', drag: 0.9 }, opts)));
		switch (this.kind) {
			case 'wave':
				if (this.t % 2 === 0) {
					FX.particles.push(new Particle({ x: this.x + rand(-14, 14), y: FLOOR_Y - 4, vx: -this.vx * 0.1 + rand(-1.5, 1.5), vy: rand(-7, -3), life: 26, size: rand(3, 6), color: '#8b6b4a', type: 'ember', gravity: 0.45, drag: 0.98 }));
					FX.dust(this.x, FLOOR_Y, 1, this.dir);
				}
				break;
			case 'spear':
			case 'knife':
			case 'lance':
				if (this.t % 3 === 0) spark({ x: this.x - this.dir * this.w * 0.4, vx: -this.vx * 0.1, vy: rand(-0.6, 0.6), life: 12, size: 2 });
				break;
			default:
				if (this.t % 2 === 0) spark({ x: this.x + rand(-6, 6), y: this.y + rand(-this.h / 4, this.h / 4), vx: -this.vx * 0.15 + rand(-1, 1), vy: rand(-1.5, 1.5), size: this.big ? 4 : 2.5 });
		}
	}
	draw() {
		if (this.delay > 0) return;
		c.save();
		switch (this.kind) {
			case 'spear': this.drawSpear(); break;
			case 'knife': this.drawKnife(); break;
			case 'lance': this.drawLance(); break;
			case 'crescent': this.drawCrescent(); break;
			case 'wave': this.drawWave(); break;
			case 'sprite': this.drawSpriteProjectile(); break;
			case 'spell': this.drawSpell(); break;
			default: this.drawOrb();
		}
		c.restore();
	}
	drawOrb() {
		c.globalCompositeOperation = 'lighter';
		const radius = this.w / 2;
		this.trail.forEach((p, i) => {
			const t = (i + 1) / this.trail.length;
			c.globalAlpha = t * 0.35;
			c.fillStyle = this.colors.glow;
			c.beginPath();
			c.arc(p.x, p.y, radius * t, 0, Math.PI * 2);
			c.fill();
		});
		c.globalAlpha = 1;
		const r = radius * (1 + Math.sin(this.t * 0.6) * 0.1);
		const g = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2);
		g.addColorStop(0, '#ffffff');
		g.addColorStop(0.25, this.colors.core);
		g.addColorStop(0.55, this.colors.glow);
		g.addColorStop(1, 'rgba(0,0,0,0)');
		c.fillStyle = g;
		c.beginPath();
		c.arc(this.x, this.y, r * 2, 0, Math.PI * 2);
		c.fill();
		if (this.kind === 'homing') {
			// a dark core with two eyes, like the wizard's shadow spirits
			c.globalCompositeOperation = 'source-over';
			c.fillStyle = 'rgba(30,6,40,0.85)';
			c.beginPath();
			c.arc(this.x, this.y, r * 0.75, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = '#ff3b6b';
			c.fillRect(this.x - 6, this.y - 3, 4, 3);
			c.fillRect(this.x + 2, this.y - 3, 4, 3);
		}
		if (this.big) {
			c.strokeStyle = this.colors.spark;
			c.lineWidth = 2;
			for (let i = 0; i < 3; i++) {
				const a = rand(0, Math.PI * 2);
				c.beginPath();
				c.moveTo(this.x + Math.cos(a) * r * 0.6, this.y + Math.sin(a) * r * 0.6);
				c.lineTo(this.x + Math.cos(a + 0.3) * r * 1.3, this.y + Math.sin(a + 0.3) * r * 1.3);
				c.lineTo(this.x + Math.cos(a - 0.1) * r * 1.7, this.y + Math.sin(a - 0.1) * r * 1.7);
				c.stroke();
			}
		}
	}
	drawCrescent() {
		c.globalCompositeOperation = 'lighter';
		c.translate(this.x, this.y);
		c.scale(this.dir, 1);
		for (let i = 0; i < 3; i++) {
			c.globalAlpha = 0.9 - i * 0.28;
			c.fillStyle = i === 0 ? '#ffffff' : i === 1 ? this.colors.core : this.colors.glow;
			c.beginPath();
			c.arc(-i * 9, 0, this.h / 2, -Math.PI / 2, Math.PI / 2);
			c.arc(-i * 9 - 14, 0, this.h / 2 - 4, Math.PI / 2, -Math.PI / 2, true);
			c.fill();
		}
	}
	drawLance() {
		c.globalCompositeOperation = 'lighter';
		c.translate(this.x, this.y);
		c.scale(this.dir, 1);
		const L = this.w;
		const g = c.createLinearGradient(-L / 2 - 40, 0, L / 2, 0);
		g.addColorStop(0, 'rgba(0,0,0,0)');
		g.addColorStop(0.5, this.colors.glow);
		g.addColorStop(1, this.colors.core);
		c.fillStyle = g;
		c.fillRect(-L / 2 - 40, -9, L + 40, 18);
		c.fillStyle = '#ffffff';
		c.beginPath();
		c.moveTo(L / 2 + 14, 0);
		c.lineTo(L / 2 - 16, -10);
		c.lineTo(-L / 2, -3);
		c.lineTo(-L / 2, 3);
		c.lineTo(L / 2 - 16, 10);
		c.closePath();
		c.fill();
	}
	drawSpear() {
		const img = this.image;
		if (!imageReady(img)) return this.drawKnife();
		const frames = 4;
		const fw = img.width / frames;
		const f = Math.floor(this.t / 3) % frames;
		const s = 2.6;
		c.translate(this.x, this.y);
		c.scale(this.dir, 1);
		c.drawImage(img, f * fw, 0, fw, img.height, (-fw * s) / 2, (-img.height * s) / 2, fw * s, img.height * s);
	}
	drawSpriteProjectile() {
		const img = this.image;
		if (!imageReady(img)) return this.drawOrb();
		const fly = this.sheet.fly;
		const fw = img.width / fly.frames;
		const f = Math.floor(this.t / 3) % fly.frames;
		const s = fly.scale;
		c.save();
		c.globalCompositeOperation = 'lighter';
		c.globalAlpha = 0.45;
		const g = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, 46);
		g.addColorStop(0, this.colors.glow);
		g.addColorStop(1, 'rgba(0,0,0,0)');
		c.fillStyle = g;
		c.beginPath();
		c.arc(this.x, this.y, 46, 0, Math.PI * 2);
		c.fill();
		c.restore();
		c.translate(this.x, this.y);
		if (this.vy) c.rotate(Math.atan2(this.vy, Math.abs(this.vx)) * this.dir);
		c.scale(this.dir < 0 ? -1 : 1, 1);
		c.imageSmoothingEnabled = false;
		c.drawImage(img, f * fw, 0, fw, img.height, (-fw * s) / 2, (-img.height * s) / 2, fw * s, img.height * s);
	}
	drawSpell() {
		const img = this.image;
		if (!imageReady(img)) return;
		const sp = this.sheet;
		const fw = img.width / sp.frames;
		const f = Math.min(sp.frames - 1, Math.floor(this.t / 4));
		c.imageSmoothingEnabled = false;
		// warning circle on the floor while the hand is coming
		if (f < 6) {
			c.save();
			c.globalAlpha = 0.35 + 0.3 * Math.sin(this.t * 0.6);
			c.strokeStyle = this.colors.glow;
			c.lineWidth = 3;
			c.beginPath();
			c.ellipse(this.x, FLOOR_Y + 2, 38, 8, 0, 0, Math.PI * 2);
			c.stroke();
			c.restore();
		}
		c.drawImage(img, f * fw, 0, fw, img.height, this.x - sp.anchor[0] * sp.scale, FLOOR_Y - sp.anchor[1] * sp.scale, fw * sp.scale, img.height * sp.scale);
	}
	drawKnife() {
		c.translate(this.x, this.y);
		c.scale(this.dir, 1);
		c.rotate(0);
		c.fillStyle = '#e5e7eb';
		c.beginPath();
		c.moveTo(14, 0);
		c.lineTo(-2, -4);
		c.lineTo(-2, 4);
		c.closePath();
		c.fill();
		c.fillStyle = '#7c4a2a';
		c.fillRect(-12, -2, 10, 4);
		c.globalCompositeOperation = 'lighter';
		c.globalAlpha = 0.5;
		c.fillStyle = this.colors.spark;
		c.fillRect(-34, -1, 22, 2);
	}
	drawWave() {
		c.globalCompositeOperation = 'lighter';
		const g = c.createRadialGradient(this.x, FLOOR_Y, 0, this.x, FLOOR_Y, 60);
		g.addColorStop(0, this.colors.core);
		g.addColorStop(0.4, this.colors.glow);
		g.addColorStop(1, 'rgba(0,0,0,0)');
		c.fillStyle = g;
		c.beginPath();
		c.ellipse(this.x, FLOOR_Y, 46, 44 + Math.sin(this.t * 0.8) * 6, 0, Math.PI, 0);
		c.fill();
		c.globalCompositeOperation = 'source-over';
		c.fillStyle = '#5b4632';
		for (let i = 0; i < 4; i++) {
			const ox = ((i * 23 + this.t * 3) % 60) - 30;
			const h = 10 + ((i * 7) % 12);
			c.fillRect(this.x + ox * -this.dir, FLOOR_Y - h, 9, h);
		}
	}
}

// a one-shot sprite animation (impacts, explosions)
class SpriteFX {
	constructor({ image, frames, scale = 2, x, y, flip = false, hold = 3 }) {
		Object.assign(this, { image, frames, scale, x, y, flip, hold, t: 0 });
	}
	get done() {
		return this.t >= this.frames * this.hold;
	}
	update() {
		this.t++;
	}
	draw() {
		const img = this.image;
		if (!imageReady(img)) return;
		const fw = img.width / this.frames;
		const f = Math.min(this.frames - 1, Math.floor(this.t / this.hold));
		c.save();
		c.imageSmoothingEnabled = false;
		c.translate(this.x, this.y);
		if (this.flip) c.scale(-1, 1);
		c.drawImage(img, f * fw, 0, fw, img.height, (-fw * this.scale) / 2, (-img.height * this.scale) / 2, fw * this.scale, img.height * this.scale);
		c.restore();
	}
}

const FX = {
	sprites: [],
	particles: [],
	texts: [],
	shakeTime: 0,
	shakePower: 0,
	flashAlpha: 0,
	flashColor: '#fff',

	reset() {
		this.sprites = [];
		this.particles = [];
		this.texts = [];
		this.shakeTime = 0;
		this.flashAlpha = 0;
	},
	shake(power, frames) {
		if (power >= this.shakePower || this.shakeTime <= 0) this.shakePower = power;
		this.shakeTime = Math.max(this.shakeTime, frames);
	},
	flash(color, alpha) {
		this.flashColor = color;
		this.flashAlpha = Math.max(this.flashAlpha, alpha);
	},
	sparks(x, y, dir, color, count = 14, speed = 9) {
		for (let i = 0; i < count; i++) {
			const a = rand(-0.9, 0.9) + (dir < 0 ? Math.PI : 0);
			const s = rand(speed * 0.4, speed);
			this.particles.push(new Particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(14, 26), size: rand(2, 4), color, type: 'spark', gravity: 0.25, drag: 0.9 }));
		}
		this.particles.push(new Particle({ x, y, life: 14, size: 50, color, type: 'glow' }));
		this.particles.push(new Particle({ x, y, life: 16, size: 8, color, type: 'ring', grow: 4, drag: 1 }));
	},
	burst(x, y, color, count = 30, speed = 12) {
		for (let i = 0; i < count; i++) {
			const a = rand(0, Math.PI * 2);
			const s = rand(speed * 0.3, speed);
			this.particles.push(new Particle({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(18, 34), size: rand(2, 5), color, type: 'spark', gravity: 0.15, drag: 0.92 }));
		}
		this.particles.push(new Particle({ x, y, life: 24, size: 120, color, type: 'glow' }));
		this.particles.push(new Particle({ x, y, life: 22, size: 10, color, type: 'ring', grow: 7, drag: 1 }));
	},
	smoke(x, y) {
		for (let i = 0; i < 22; i++) {
			const a = rand(0, Math.PI * 2);
			const sp = rand(1, 4);
			this.particles.push(new Particle({ x: x + rand(-20, 20), y: y + rand(-40, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5, life: rand(26, 44), size: rand(10, 22), grow: 0.5, color: '#9ca3af', type: 'dust', drag: 0.92 }));
		}
	},
	dust(x, y, count = 6, dir = 0) {
		for (let i = 0; i < count; i++) {
			this.particles.push(new Particle({
				x: x + rand(-20, 20), y: y - rand(0, 6),
				vx: dir ? -dir * rand(1, 3) : rand(-2, 2), vy: rand(-1.4, -0.2),
				life: rand(20, 34), size: rand(4, 9), grow: 0.25, color: '#d8cdb8', type: 'dust', drag: 0.94,
			}));
		}
	},
	text(text, x, y, color, size = 16, life = 50) {
		this.texts.push(new FloatText({ text, x, y, color, size, life }));
	},
	update() {
		this.sprites.forEach((s) => s.update());
		this.sprites = this.sprites.filter((s) => !s.done);
		this.particles.forEach((p) => p.update());
		this.particles = this.particles.filter((p) => p.life > 0);
		this.texts.forEach((t) => t.update());
		this.texts = this.texts.filter((t) => t.life > 0);
		if (this.shakeTime > 0) this.shakeTime--;
		this.flashAlpha *= 0.86;
		if (this.flashAlpha < 0.01) this.flashAlpha = 0;
	},
	shakeOffset() {
		if (this.shakeTime <= 0) return { x: 0, y: 0 };
		const p = this.shakePower * Math.min(1, this.shakeTime / 10);
		return { x: rand(-p, p), y: rand(-p, p) };
	},
};
