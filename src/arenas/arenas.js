// ---------- Arenas ----------
// Every arena draws its background, animates its own details and adds ambient particles.
// The floor line is the same everywhere (FLOOR_Y), so fighters stand correctly in all of them.

const background = new Sprite({ position: { x: 0, y: 0 }, imageSrc: './src/arenas/forest/background.png' });
const shop = new Sprite({ position: { x: 600, y: 128 }, imageSrc: './src/arenas/forest/shop.png', scale: 2.75, framesMax: 6 });

// Cold Corridors is built from small tiling layers at 2.5× so its floor lands on FLOOR_Y.
const CASTLE = {
	scale: 2.5,
	offsetY: -20, // source row 200 (the floor tiles) lands on FLOOR_Y = 480
	layers: ['back', 'far', 'middle', 'near'].map((n) => loadImage(`./src/arenas/castle/${n}.png`)),
	foreground: loadImage('./src/arenas/castle/foreground.png'),
	tiles: loadImage('./src/arenas/castle/tileset.png'),
	torch: loadImage('./src/arenas/castle/torch.png'),
	plate: null,
	torchSpots: [],
	build() {
		const all = [...this.layers, this.foreground, this.tiles];
		if (!all.every(imageReady)) return false;
		const sw = Math.ceil(W / this.scale) + 2;
		const sh = 240;
		const cv = document.createElement('canvas');
		cv.width = sw;
		cv.height = sh;
		const g = cv.getContext('2d');
		g.imageSmoothingEnabled = false;
		g.fillStyle = '#150d62';
		g.fillRect(0, 0, sw, sh);
		this.layers.forEach((img) => {
			for (let x = 0; x < sw; x += img.width) g.drawImage(img, x, 0);
		});
		// pillars at both edges frame the hall without blocking the fight
		g.drawImage(this.foreground, -106, 0);
		g.drawImage(this.foreground, Math.round(W / this.scale) - 106, 0);
		// floor tiles, then fill below them
		const ty = 224 - this.tiles.height;
		for (let x = 0; x < sw; x += this.tiles.width) g.drawImage(this.tiles, x, ty);
		g.fillStyle = '#0b0718';
		g.fillRect(0, 224, sw, sh - 224);
		this.plate = cv;
		// torches sit in the banners of the near wall (every 224 source pixels)
		this.torchSpots = [];
		for (let x = 143; x < sw; x += 224) this.torchSpots.push(x);
		return true;
	},
	draw(ctx, tick) {
		if (!this.plate && !this.build()) {
			ctx.fillStyle = '#150d62';
			ctx.fillRect(0, 0, W, H);
			return;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.plate, 0, this.offsetY, this.plate.width * this.scale, this.plate.height * this.scale);
		if (imageReady(this.torch)) {
			const f = Math.floor(tick / 6) % 4;
			const s = this.scale;
			this.torchSpots.forEach((sx) => {
				const x = (sx - 16) * s;
				const y = (100 - 0) * s + this.offsetY;
				ctx.drawImage(this.torch, f * 32, 0, 32, 32, x, y, 32 * s, 32 * s);
			});
		}
	},
};

const ARENAS = {
	forest: {
		music: 'forest',
		name: 'Twilight Forest',
		blurb: 'The old shop at the edge of the woods.',
		draw(tick) {
			background.draw();
			shop.draw();
			c.fillStyle = 'rgba(255, 255, 255, 0.12)';
			c.fillRect(0, 0, W, H);
		},
		step(tick) {
			shop.animateFrames();
			if (tick % 7 === 0) {
				FX.particles.push(new Particle({ x: rand(0, W), y: FLOOR_Y + rand(0, 40), vx: rand(-0.3, 0.3), vy: rand(-1.2, -0.5), life: rand(90, 160), size: rand(1.5, 3), color: '#ffb46b', type: 'ember', drag: 1 }));
			}
		},
		thumb(ctx, w, h) {
			ctx.imageSmoothingEnabled = false;
			if (imageReady(background.image)) ctx.drawImage(background.image, 0, 0, w, h);
			if (imageReady(shop.image)) {
				const fw = shop.image.width / 6;
				const s = w / W;
				ctx.drawImage(shop.image, 0, 0, fw, shop.image.height, 600 * s, 128 * s, fw * 2.75 * s, shop.image.height * 2.75 * s);
			}
		},
	},
	castle: {
		music: 'castle',
		name: 'Cold Corridors',
		blurb: 'A frozen castle hall lit by torches.',
		draw(tick) {
			CASTLE.draw(c, tick);
			c.fillStyle = 'rgba(120, 140, 255, 0.06)';
			c.fillRect(0, 0, W, H);
		},
		step(tick) {
			if (tick % 9 === 0) {
				// slow drifting dust in the cold air
				FX.particles.push(new Particle({ x: rand(0, W), y: rand(60, FLOOR_Y), vx: rand(-0.25, 0.25), vy: rand(0.1, 0.4), life: rand(140, 220), size: rand(1.5, 2.5), color: '#a5b4fc', type: 'ember', drag: 1 }));
			}
			if (tick % 5 === 0 && CASTLE.torchSpots.length) {
				const sx = CASTLE.torchSpots[Math.floor(rand(0, CASTLE.torchSpots.length))];
				FX.particles.push(new Particle({ x: sx * CASTLE.scale + rand(-6, 6), y: 100 * CASTLE.scale + CASTLE.offsetY + 20, vx: rand(-0.3, 0.3), vy: rand(-1.4, -0.6), life: rand(25, 45), size: rand(1.5, 2.5), color: '#fdba74', type: 'ember', drag: 1 }));
			}
		},
		thumb(ctx, w, h) {
			const tmp = document.createElement('canvas');
			tmp.width = W;
			tmp.height = H;
			CASTLE.draw(tmp.getContext('2d'), 0);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(tmp, 0, 0, w, h);
		},
	},
};
const ARENA_ORDER = ['forest', 'castle'];

function randomArena() {
	return ARENA_ORDER[Math.floor(Math.random() * ARENA_ORDER.length)];
}
