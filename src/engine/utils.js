// ---------- Small shared helpers ----------

const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 576;

const W = canvas.width;
const H = canvas.height;
const GRAVITY = 0.7;
const FLOOR_Y = H - 96;          // pixel row of the ground
const GROUND_Y = FLOOR_Y - 150;  // fighter.position.y when standing (330, same as the original)
// Bengali letters fall back to the bundled Baloo Da 2 face (index.html, @font-face)
const FONT = '"Press Start 2P", "BB Bangla Canvas", "Courier New", monospace';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const easeOutBack = (t) => {
	const s = 1.70158;
	t -= 1;
	return t * t * ((s + 1) * t + s) + 1;
};

const imageCache = {};
function loadImage(src) {
	if (!imageCache[src]) {
		const img = new Image();
		img.src = encodeURI(src);
		imageCache[src] = img;
	}
	return imageCache[src];
}
const imageReady = (img) => img && img.complete && img.naturalWidth > 0;

function rectsOverlap(a, b) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRect(cx, cy, r, rect) {
	const nx = clamp(cx, rect.x, rect.x + rect.w);
	const ny = clamp(cy, rect.y, rect.y + rect.h);
	return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

// Text with a dark outline, used by the HUD and banners.
function drawText(text, x, y, { size = 16, color = '#fff', align = 'center', stroke = '#000', strokeWidth = 4, alpha = 1, baseline = 'middle' } = {}) {
	text = localDigits(text);
	c.save();
	c.globalAlpha = alpha;
	c.font = `${size}px ${FONT}`;
	c.textAlign = align;
	c.textBaseline = baseline;
	if (stroke) {
		c.lineJoin = 'round';
		c.lineWidth = strokeWidth;
		c.strokeStyle = stroke;
		c.strokeText(text, x, y);
	}
	c.fillStyle = color;
	c.fillText(text, x, y);
	c.restore();
}
