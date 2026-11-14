// Her drawings: while you're away she draws something on your screen, stroke by stroke, in neon (a
// cat, a heart, a flower, the moon and stars, a little house, herself…), signs it, and keeps it: the
// picture goes to her workshop (~/Capri/desenhos) and she shows it to you when you're back.
// Drawn over everything on her own see-through window; nothing of yours is touched.

import { pick, rand } from './util.js';

const COLORS = ['#ff2a3d', '#00f0ff', '#b026ff', '#ffe14d', '#5bff9b', '#ff7ad9'];
const TAU = Math.PI * 2;

// each drawing: polylines in a 0..1 box (a few points each; the hand adds the wobble)
const curve = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const circle = (cx, cy, r, from = 0, to = 1, n = 40) => curve(n, (k) => [cx + r * Math.cos(TAU * (from + (to - from) * k)), cy + r * Math.sin(TAU * (from + (to - from) * k))]);
const star = (cx, cy, r, inner = 0.45) => curve(10, (k) => {
  const a = -Math.PI / 2 + TAU * k;
  const rr = Math.round(k * 10) % 2 ? r * inner : r;
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
});

const DRAWINGS = {
  heart: () => [curve(60, (k) => {
    const t = TAU * k;
    return [0.5 + 0.026 * 16 * Math.sin(t) ** 3, 0.47 - 0.026 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  })],
  cat: () => [
    circle(0.5, 0.55, 0.3),
    [[0.27, 0.38], [0.25, 0.12], [0.42, 0.27]], [[0.58, 0.27], [0.75, 0.12], [0.73, 0.38]],
    circle(0.4, 0.5, 0.03), circle(0.6, 0.5, 0.03),
    [[0.47, 0.6], [0.5, 0.63], [0.53, 0.6]], [[0.5, 0.63], [0.5, 0.67]], [[0.44, 0.7], [0.5, 0.67], [0.56, 0.7]],
    [[0.18, 0.58], [0.38, 0.62]], [[0.18, 0.66], [0.38, 0.65]], [[0.62, 0.62], [0.82, 0.58]], [[0.62, 0.65], [0.82, 0.66]],
  ],
  flower: () => [
    curve(120, (k) => { const t = TAU * k; const r = 0.26 * Math.abs(Math.cos(2.5 * t)) + 0.05; return [0.5 + r * Math.cos(t), 0.38 + r * Math.sin(t)]; }),
    circle(0.5, 0.38, 0.05),
    curve(20, (k) => [0.5 + 0.03 * Math.sin(k * 3), 0.64 + 0.32 * k]),
    [[0.5, 0.82], [0.36, 0.72], [0.5, 0.78]], [[0.51, 0.76], [0.65, 0.68], [0.52, 0.72]],
  ],
  night: () => [
    circle(0.38, 0.45, 0.24, 0.15, 0.85), circle(0.47, 0.42, 0.2, 0.2, 0.8),
    star(0.75, 0.25, 0.07), star(0.82, 0.6, 0.05), star(0.62, 0.8, 0.04), star(0.2, 0.15, 0.04),
  ],
  house: () => [
    [[0.22, 0.48], [0.22, 0.85], [0.78, 0.85], [0.78, 0.48]], [[0.15, 0.5], [0.5, 0.18], [0.85, 0.5]],
    [[0.44, 0.85], [0.44, 0.65], [0.56, 0.65], [0.56, 0.85]], [[0.28, 0.56], [0.38, 0.56], [0.38, 0.66], [0.28, 0.66], [0.28, 0.56]],
    [[0.66, 0.34], [0.66, 0.22], [0.72, 0.22], [0.72, 0.4]], curve(12, (k) => [0.69 + 0.05 * Math.sin(k * 9), 0.18 - 0.12 * k]),
  ],
  // her: the mask, the slanted eyes, the mane
  herself: () => [
    circle(0.5, 0.5, 0.27),
    [[0.36, 0.46], [0.46, 0.5]], [[0.64, 0.46], [0.54, 0.5]],
    [[0.44, 0.66], [0.5, 0.69], [0.56, 0.66]],
    [[0.25, 0.4], [0.12, 0.22], [0.32, 0.3]], [[0.4, 0.25], [0.38, 0.06], [0.5, 0.23]], [[0.6, 0.25], [0.66, 0.07], [0.68, 0.3]], [[0.75, 0.4], [0.9, 0.24], [0.78, 0.5]],
  ],
  sun: () => [circle(0.5, 0.5, 0.17), ...Array.from({ length: 10 }, (_, i) => {
    const a = (TAU * i) / 10;
    return [[0.5 + 0.24 * Math.cos(a), 0.5 + 0.24 * Math.sin(a)], [0.5 + 0.36 * Math.cos(a), 0.5 + 0.36 * Math.sin(a)]];
  }), circle(0.44, 0.47, 0.015), circle(0.56, 0.47, 0.015), circle(0.5, 0.52, 0.07, 0.1, 0.4)],
  spiral: () => [curve(160, (k) => [0.5 + 0.38 * k * Math.cos(TAU * 4 * k), 0.5 + 0.38 * k * Math.sin(TAU * 4 * k)])],
  wave: () => [0, 1, 2].map((j) => curve(50, (k) => [0.1 + 0.8 * k, 0.35 + j * 0.16 + 0.06 * Math.sin(TAU * 2 * k + j)])),
};

export const ART_NAMES = Object.keys(DRAWINGS);

export class Art {
  constructor({ host }) {
    this.host = host;
    this.last = null; // { name, url, file }: her latest drawing, to show you
    this.drawing = false;
  }

  // Draws one at (x, y) (its top left), size px: resolves with { name, url, file } once done and saved.
  async draw({ x, y, size = 240, name = pick(ART_NAMES), strokes: given = null, hold = 14000, reduced = false } = {}) {
    if (this.drawing) return null;
    this.drawing = true;
    const pad = 16;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round((size + pad * 2) * dpr);
    canvas.height = Math.round((size + pad * 2 + 30) * dpr);
    Object.assign(canvas.style, {
      position: 'fixed', left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: `${size + pad * 2}px`, height: `${size + pad * 2 + 30}px`,
      pointerEvents: 'none', zIndex: 9997, opacity: '1', transition: 'opacity .8s',
    });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const color = pick(COLORS);
    const second = pick(COLORS.filter((c) => c !== color));
    const strokes = given || DRAWINGS[name]?.() || DRAWINGS.heart();
    const at = ([u, v]) => [pad + u * size + rand(-1.4, 1.4), pad + v * size + rand(-1.4, 1.4)];
    const line = (pts, upto, c) => {
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      pts.slice(0, upto).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.stroke();
    };
    try {
      for (const [i, s] of strokes.entries()) {
        const pts = s.map(at);
        const c = i % 3 === 2 ? second : color;
        if (reduced) { line(pts, pts.length, c); continue; }
        // her pen going along the stroke
        for (let k = 2; k <= pts.length; k += Math.max(1, Math.round(pts.length / 18))) {
          line(pts, k, c);
          await new Promise((r) => setTimeout(r, 28));
        }
        line(pts, pts.length, c);
        await new Promise((r) => setTimeout(r, rand(120, 260)));
      }
      // her signature
      ctx.shadowBlur = 6;
      ctx.fillStyle = second;
      ctx.shadowColor = second;
      ctx.font = 'italic 700 18px "Chakra Petch", sans-serif';
      ctx.fillText('capri ♥', pad + size - 80, pad + size + 22);
      const url = canvas.toDataURL('image/png');
      const file = await this.host.saveArt?.(url).catch(() => null);
      this.last = { name, url, file, at: Date.now() };
      setTimeout(() => { canvas.style.opacity = '0'; }, hold);
      setTimeout(() => canvas.remove(), hold + 900);
      return this.last;
    } catch {
      canvas.remove();
      return null;
    } finally {
      this.drawing = false;
    }
  }

  // shows her latest drawing again for a while, next to her (when you're back)
  show(x, y, ms = 9000) {
    if (!this.last?.url) return;
    const img = document.createElement('img');
    img.src = this.last.url;
    img.alt = '';
    Object.assign(img.style, {
      position: 'fixed', left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, width: '200px', pointerEvents: 'none', zIndex: 9997,
      opacity: '0', transition: 'opacity .5s', background: 'rgba(20,16,28,.55)', borderRadius: '12px', border: '1px solid rgba(255,255,255,.15)',
    });
    document.body.appendChild(img);
    requestAnimationFrame(() => { img.style.opacity = '1'; });
    setTimeout(() => { img.style.opacity = '0'; }, ms);
    setTimeout(() => img.remove(), ms + 600);
  }
}

// Your portrait, from the face the camera sees (MediaPipe's landmarks and its lists of which points
// join up: the face's outline, eyes, brows, lips, irises), mirrored like a mirror, in a 0..1 box.
export function portraitStrokes(points, Vision) {
  const F = Vision?.FaceLandmarker;
  if (!points?.length || !F) return null;
  const sets = ['FACE_LANDMARKS_FACE_OVAL', 'FACE_LANDMARKS_LEFT_EYE', 'FACE_LANDMARKS_RIGHT_EYE', 'FACE_LANDMARKS_LEFT_EYEBROW',
    'FACE_LANDMARKS_RIGHT_EYEBROW', 'FACE_LANDMARKS_LIPS', 'FACE_LANDMARKS_LEFT_IRIS', 'FACE_LANDMARKS_RIGHT_IRIS'].map((k) => F[k]).filter(Boolean);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const at = (i) => [0.1 + 0.8 * (1 - (points[i].x - x0) / span - (span - (x1 - x0)) / span / 2), 0.1 + 0.8 * ((points[i].y - y0) / span + (span - (y1 - y0)) / span / 2)];
  const strokes = [];
  for (const edges of sets) {
    // the edges chained into lines
    const left = edges.map((e) => [e.start, e.end]);
    while (left.length) {
      const line = left.shift();
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const [a, b] = left[i];
          if (a === line.at(-1)) { line.push(b); left.splice(i, 1); grew = true; break; }
          if (b === line[0]) { line.unshift(a); left.splice(i, 1); grew = true; break; }
        }
      }
      strokes.push(line.map(at));
    }
  }
  // her touch: a nose, and blush
  if (points[1] && points[2]) strokes.push([at(168), at(1), at(2)]);
  return strokes;
}
