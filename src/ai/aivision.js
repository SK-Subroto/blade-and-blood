// ---------- AI Vision: shows what each learning AI sees, guesses and learns ----------
// Every learner has its own colour: red for the CPU's AI, blue for your AI.

const VISION = {
	green: '#4ade80',
	miss: '#ff5d6c',
	amber: '#fbbf24',
	panel: 'rgba(8,10,20,0.8)',
	dim: '#9fb3c8',
};

function visionText(text, x, y, color, size = 8, align = 'left', alpha = 1) {
	drawText(text, x, y, { size, color, align, alpha, strokeWidth: 3, stroke: 'rgba(0,0,0,0.85)' });
}
const rgba = (L, a) => `rgba(${L.rgb},${a})`;
const ranked = (L, n) => LEARN_ACTIONS.slice().sort((a, b) => L.pred.probs[b] - L.pred.probs[a]).slice(0, n);

// --- world-space pieces (drawn with the arena, inside screen shake) ---
function drawVisionWorld(L, tick, lane = 0) {
	const tg = L.target;
	const me = L.watcher;
	if (tg.ko) return;

	// movement trail
	L.trail.forEach((p, i) => {
		const t = (i + 1) / L.trail.length;
		c.fillStyle = rgba(L, t * 0.55);
		c.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
	});

	// floor heatmap of where the target likes to stand (one lane per AI)
	const max = Math.max(...L.heat, 1);
	const bw = W / L.heat.length;
	L.heat.forEach((v, i) => {
		const t = v / max;
		if (t < 0.05) return;
		c.fillStyle = rgba(L, 0.12 + t * 0.6);
		c.fillRect(i * bw + 1, FLOOR_Y + 2 + lane * 6, bw - 2, 4);
	});

	// ghost of the predicted move
	const pr = L.pred;
	if (L.samples >= 4 && pr.p > 0.3 && tg.canAct()) {
		const toMe = sign(me.centerX - tg.centerX) || tg.facing;
		const off = { approach: [70 * toMe, 0], dash: [140 * toMe, 0], retreat: [-70 * toMe, 0], jump: [0, -110] }[pr.top];
		if (off) {
			c.save();
			c.filter = L.ghostFilter;
			tg.drawSprite(pr.top === 'jump' ? 'jump' : 'run', 0, tg.centerX + off[0], tg.feetY + off[1], tg.facing, 0.18 + Math.sin(tick * 0.2) * 0.06);
			c.restore();
			c.save();
			c.strokeStyle = rgba(L, 0.5);
			c.setLineDash([4, 4]);
			c.beginPath();
			c.moveTo(tg.centerX, tg.feetY - tg.height / 2);
			c.lineTo(tg.centerX + off[0], tg.feetY - tg.height / 2 + off[1]);
			c.stroke();
			c.restore();
		}
	}

	// tracking box with corner brackets and a scan line
	const target = { x: tg.position.x - 14, y: tg.position.y - 10, w: tg.width + 28, h: tg.height + 18 };
	if (!L.box) L.box = { ...target };
	for (const k in target) L.box[k] = lerp(L.box[k], target[k], 0.35);
	const b = L.box;
	const locked = !!(me.move && !me.move.special && me.frame <= me.move.hitFrame);
	c.save();
	c.strokeStyle = locked ? '#ffffff' : L.color;
	c.lineWidth = locked ? 3 : 2;
	const k = 12;
	[[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach(([x, y, dx, dy]) => {
		c.beginPath();
		c.moveTo(x, y + dy * k);
		c.lineTo(x, y);
		c.lineTo(x + dx * k, y);
		c.stroke();
	});
	c.globalAlpha = 0.35;
	c.fillStyle = L.color;
	c.fillRect(b.x + 2, b.y + ((tick * 3) % b.h), b.w - 4, 2);
	c.restore();
	visionText(tx('vis.tracking', { ai: L.name, t: tg.short }), b.x, b.y - 8, L.color);

	// lock-on crosshair while this AI winds up an attack
	if (locked) {
		const cx = tg.centerX;
		const cy = tg.feetY - tg.height * 0.55;
		const r = 26 + Math.sin(tick * 0.5) * 3;
		c.save();
		c.strokeStyle = L.color;
		c.lineWidth = 3;
		c.beginPath();
		c.arc(cx, cy, r, 0, Math.PI * 2);
		c.stroke();
		c.translate(cx, cy);
		c.rotate(tick * 0.08);
		c.strokeStyle = '#ffffff';
		c.lineWidth = 2;
		for (let i = 0; i < 4; i++) {
			c.rotate(Math.PI / 2);
			c.beginPath();
			c.moveTo(r - 8, 0);
			c.lineTo(r + 8, 0);
			c.stroke();
		}
		c.restore();
		visionText(tx('vis.lock'), cx, cy + r + 12, L.color, 8, 'center');
	}

	// next-move guess, above the tracking box
	if (L.samples >= 2) {
		const px = clamp(b.x + b.w / 2 - 70, 8, W - 148);
		let py = b.y - 62;
		if (py < 135) py = b.y + b.h + 14; // keep clear of the HUD
		c.fillStyle = VISION.panel;
		c.fillRect(px - 4, py - 6, 148, 46);
		visionText(tx('vis.next'), px, py, L.color);
		ranked(L, 3).forEach((a, i) => {
			const y = py + 12 + i * 11;
			const pct = pr.probs[a];
			visionText(LEARN_LABEL[a], px, y, i === 0 ? '#ffffff' : VISION.dim);
			c.fillStyle = 'rgba(255,255,255,0.12)';
			c.fillRect(px + 70, y - 3, 50, 6);
			c.fillStyle = rgba(L, i === 0 ? 1 : 0.55);
			c.fillRect(px + 70, y - 3, 50 * pct, 6);
			visionText(`${Math.round(pct * 100)}%`, px + 140, y, '#cbd5e1', 8, 'right');
		});
	}

	// was the guess right?
	if (L.flash) {
		const f = L.flash;
		visionText(tx(f.ok ? 'vis.predicted' : 'vis.missed'), tg.centerX, tg.feetY + 16 - (45 - f.t) * 0.6, f.ok ? VISION.green : VISION.miss, 10, 'center', Math.min(1, f.t / 15));
	}

	// counter label above the AI that is countering
	if (L.counter) {
		visionText(tx('vis.counter', { c: L.counter.text }), me.centerX, me.position.y - 26, L.color, 9, 'center', Math.min(1, L.counter.t / 12));
	}
}

// --- screen-space panels ---
function drawMeter(L, x, y) {
	const acc = L.accuracy;
	c.fillStyle = VISION.panel;
	c.fillRect(x - 6, y - 8, 226, 40);
	visionText(tx('vis.reads', { ai: L.name, t: L.target.short }), x, y, L.color);
	visionText(acc === null ? '--' : `${Math.round(acc * 100)}%`, x + 214, y, '#ffffff', 8, 'right');
	c.fillStyle = 'rgba(255,255,255,0.12)';
	c.fillRect(x, y + 6, 214, 5);
	c.fillStyle = L.color;
	c.fillRect(x, y + 6, 214 * (acc || 0), 5);
	const mem = L.memSamples ? tx('vis.remembered', { n: L.memSamples }) : '';
	visionText(tx('vis.learning', { p: Math.round(L.confidence * 100), n: L.samples, mem }), x, y + 22, VISION.dim);
}

function logColor(L, kind) {
	return { hit: VISION.green, miss: VISION.miss, pattern: VISION.amber, counter: L.color, info: VISION.dim }[kind];
}
function logMark(kind) {
	return kind === 'hit' ? tx('vis.hit') : kind === 'miss' ? tx('vis.miss') : '';
}

function drawLog(L, x, y, w, lines) {
	c.fillStyle = VISION.panel;
	c.fillRect(x - 6, y - 8, w, 18 + lines * 12);
	visionText(tx('vis.log', { ai: L.name }), x, y, L.color);
	L.log.slice(-lines).forEach((e, i) => {
		visionText(`> ${e.text}${logMark(e.kind)}`, x, y + 14 + i * 12, logColor(L, e.kind), 8, 'left', e.age < 6 ? 0.4 + e.age / 10 : 1);
	});
}

function drawBrain(L, tick, bx, by) {
	const bw = 324;
	const bh = 84;
	c.fillStyle = VISION.panel;
	c.fillRect(bx, by, bw, bh);
	visionText(tx('vis.brain', { ai: L.name }), bx + 8, by + 10, L.color);
	const inputs = [
		[tx('vis.dist'), tx(`dist.${L.distBucket()}`)],
		[tx('vis.foe'), tx(`state.${L.cpuState()}`)],
		[tx('vis.last'), LEARN_LABEL[L.prev]],
		[tx('vis.before'), LEARN_LABEL[L.prev2]],
	];
	const outs = ranked(L, 4);
	const inPos = inputs.map((_, i) => [bx + 112, by + 22 + i * 17]);
	const hidPos = [0, 1, 2].map((i) => [bx + 160, by + 28 + i * 22]);
	const outPos = outs.map((_, i) => [bx + 208, by + 22 + i * 17]);
	c.save();
	c.lineWidth = 1;
	inPos.forEach((a, i) => hidPos.forEach((h, j) => {
		c.strokeStyle = rgba(L, 0.08 + 0.35 * L.pulse * (((i + j + tick / 20) | 0) % 2));
		c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(h[0], h[1]); c.stroke();
	}));
	hidPos.forEach((h) => outPos.forEach((o, j) => {
		c.strokeStyle = rgba(L, 0.08 + L.pred.probs[outs[j]] * 0.8);
		c.beginPath(); c.moveTo(h[0], h[1]); c.lineTo(o[0], o[1]); c.stroke();
	}));
	c.restore();
	const node = (p, glow, color) => {
		c.beginPath();
		c.arc(p[0], p[1], 4, 0, Math.PI * 2);
		c.fillStyle = color;
		c.globalAlpha = 0.35 + 0.65 * clamp(glow, 0, 1);
		c.fill();
		c.globalAlpha = 1;
	};
	inputs.forEach(([k, v], i) => {
		visionText(`${k} ${v}`, bx + 104, inPos[i][1], '#cbd5e1', 8, 'right');
		node(inPos[i], 0.5 + L.pulse * 0.5, L.color);
	});
	hidPos.forEach((h, i) => node(h, 0.4 + 0.6 * Math.abs(Math.sin(tick * 0.05 + i)), '#a78bfa'));
	outs.forEach((a, i) => {
		node(outPos[i], L.pred.probs[a] * 2, i === 0 ? '#ffffff' : L.color);
		visionText(`${LEARN_LABEL[a]} ${Math.round(L.pred.probs[a] * 100)}%`, outPos[i][0] + 10, outPos[i][1], i === 0 ? '#ffffff' : VISION.dim, 8);
	});
}

function drawStamp(L, y) {
	const s = L.stamp;
	if (!s || Game.state !== 'fight') return;
	const age = 110 - s.t;
	const pop = age < 8 ? 1.6 - age * 0.075 : 1;
	const a = Math.min(1, s.t / 20);
	c.save();
	c.translate(W / 2, y);
	c.rotate(-0.06);
	c.scale(pop, pop);
	c.globalAlpha = a;
	c.strokeStyle = L.color;
	c.lineWidth = 3;
	c.strokeRect(-190, -28, 380, 56);
	c.restore();
	c.save();
	c.translate(W / 2, y);
	c.rotate(-0.06);
	c.scale(pop, pop);
	drawText(tx('vis.locked', { ai: L.name }), 0, -8, { size: 14, color: L.color, strokeWidth: 5, alpha: a });
	drawText(s.text, 0, 14, { size: 10, color: '#ffffff', strokeWidth: 4, alpha: a });
	c.restore();
}

// learners: [{ L, side }] where side 0 = left fighter's AI, 1 = right fighter's AI
function drawVisionPanels(list, tick) {
	const bySide = [null, null];
	list.forEach((e) => (bySide[e.side] = e.L));
	bySide.forEach((L, side) => L && drawMeter(L, side === 0 ? 26 : W - 240, 122));

	const full = list.filter((e) => e.full);
	const fullSide = [null, null];
	full.forEach((e) => (fullSide[e.side] = e.L));
	if (full.length === 1) {
		// one AI on show: full log on the left, brain on the right
		const L = full[0].L;
		drawLog(L, 14, FLOOR_Y + 14, 320, 5);
		drawBrain(L, tick, W - 336, FLOOR_Y + 6);
	} else {
		// two AIs: each gets a log under its own fighter's side, plus the learning race
		drawLog(fullSide[0], 14, FLOOR_Y + 14, 330, 5);
		drawLog(fullSide[1], W - 338, FLOOR_Y + 14, 330, 5);
		drawRace(fullSide[0], fullSide[1]);
	}
	full.forEach((e, i) => drawStamp(e.L, 200 + i * 66));
}

// which AI has figured out the other one better?
function drawRace(A, B) {
	const a = A.accuracy || 0;
	const b = B.accuracy || 0;
	const x = W / 2 - 150;
	const y = 104;
	const w = 300;
	c.fillStyle = VISION.panel;
	c.fillRect(x - 6, y - 8, w + 12, 34);
	visionText(tx('vis.race'), W / 2, y, '#ffffff', 8, 'center');
	const share = a + b > 0 ? a / (a + b) : 0.5;
	c.fillStyle = A.color;
	c.fillRect(x, y + 8, w * share, 8);
	c.fillStyle = B.color;
	c.fillRect(x + w * share, y + 8, w * (1 - share), 8);
	c.fillStyle = '#ffffff';
	c.fillRect(x + w / 2 - 1, y + 6, 2, 12);
}
