// The painting itself, on a 2D canvas. Everything is generated once per size and theme: each economy a cluster of
// soft, rotated elliptical dabs in broken colour around its region's hue; each flow a curved trail of dabs that
// tapers at both ends; a cream (or night-water) ground with canvas grain, washes of colour behind the largest
// clusters and streaks of light. While it paints itself in, each frame draws the dabs as far as they have come. Once
// finished, the dabs are baked into a few layer canvases that the compositor shimmers (CSS opacity and transform), so
// a frame only moves a few glints along the strokes, exporter to importer; a hover or idle highlight re-bakes the
// layers while it fades. Browser only.
import type { PaintingData } from './data';
import { hash, rng } from './rng';
import { TUNE } from './tune';

export interface PaintLabel { name: string; trade: string; x: number; y: number; r: number }

/** The canvases, back to front: the ground, one layer per shimmer group, and the live canvas (painting in, glints). */
export interface PaintingCanvases { ground: HTMLCanvasElement; layers: HTMLCanvasElement[]; live: HTMLCanvasElement }

export interface PaintingOptions {
  reduced: boolean;
  /** The hovered economy's label (position in CSS px within the canvas), or null. */
  onLabel: (l: PaintLabel | null) => void;
  /** The idle caption of a notable flow, or null. */
  onCaption: (text: string | null) => void;
}

type HSL = [number, number, number];

/** Sprite size in px: dabs are drawn from these, scaled. */
const SW = 96, SH = 48;
/** Shimmer groups: the finished painting is baked into one layer per group, and the layers shimmer out of phase
 *  (opacity and a sub-pixel drift). The component renders this many layer canvases. */
export const GROUPS = 3;
/** The ground's overhang (px) on each side, so the parallax never shows its edge. */
const OVER = 8;

const ease = (x: number) => 1 - (1 - x) ** 3;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The colour of a sprite key: "<region>|<hue step>|<light step>", "hi|k" (cream highlight), "sh|k" (forest shadow). */
function keyColour(key: string, dark: boolean): HSL {
  const [kind, a, b] = key.split('|');
  const k = Number(a);
  if (kind === 'hi') return dark ? [44, 38, 80 + k * 3] : [44, 48, 90 + k * 2];
  if (kind === 'sh') return dark ? [150, 18, 30 + k * 3] : [150, 24, 26 + k * 4];
  const base = TUNE.regions[kind] ?? TUNE.other;
  const hi = k, li = Number(b);
  const h = base[0] + (hi - 1) * TUNE.jitterHue * 0.7;
  const s = base[1] + (((hi * 3 + li) % 3) - 1) * TUNE.jitterSat * 0.5 + (dark ? TUNE.darkSat : 0);
  const l = base[2] + (li - 1.5) * (TUNE.jitterLight / 1.5) + (dark ? TUNE.darkLift : 0);
  return [h, Math.max(0, s), Math.max(8, Math.min(94, l))];
}

const hsla = ([h, s, l]: HSL, a: number) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;

/** One dab's sprite: a soft ellipse with a slightly irregular edge and a few bristle marks. */
function makeSprite(c: HSL, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const g = cv.getContext('2d')!;
  const R = rng(seed);
  g.save();
  g.translate(SW / 2, SH / 2);
  g.scale(SW / 2 * 0.94, SH / 2 * 0.9);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, hsla(c, 0.95));
  grad.addColorStop(0.55, hsla(c, 0.85));
  grad.addColorStop(0.85, hsla(c, 0.4));
  grad.addColorStop(1, hsla(c, 0));
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 3; k++) {
    g.fillStyle = hsla([c[0], c[1], c[2] + (R() - 0.5) * 8], 0.35);
    g.beginPath();
    g.ellipse((R() - 0.5) * 0.7, (R() - 0.5) * 0.5, 0.35 + R() * 0.25, 0.3 + R() * 0.2, (R() - 0.5) * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // bristle marks, only where there is paint
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 7; k++) {
    const y = SH * (0.22 + R() * 0.56);
    g.strokeStyle = hsla([c[0], c[1], c[2] + (R() < 0.5 ? 9 : -9)], 0.28);
    g.lineWidth = 0.8 + R() * 1.4;
    g.beginPath();
    g.moveTo(SW * (0.06 + R() * 0.2), y);
    g.quadraticCurveTo(SW * 0.5, y + (R() - 0.5) * 6, SW * (0.74 + R() * 0.2), y + (R() - 0.5) * 4);
    g.stroke();
  }
  return cv;
}

function makeGlint(dark: boolean): HTMLCanvasElement {
  const n = 32, cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,252,240,1)');
  grad.addColorStop(0.25, dark ? 'rgba(255,230,165,0.85)' : 'rgba(255,236,190,0.9)');
  grad.addColorStop(0.6, dark ? 'rgba(232,176,74,0.28)' : 'rgba(226,167,58,0.3)');
  grad.addColorStop(1, 'rgba(232,176,74,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  return cv;
}

interface Stroke { f: number; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; v: number; dur: number }
interface Glint { s: number; age: number; dur: number }
interface Cluster { x: number; y: number; r: number }

export class Painting {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private narrow = false;
  private dark = false;
  private canvas: HTMLCanvasElement;
  private groundEl: HTMLCanvasElement;
  private layers: HTMLCanvasElement[];
  private glintSprite: HTMLCanvasElement | null = null;
  private sprites: HTMLCanvasElement[] = [];
  private keys: string[] = [];
  private keyIndex = new Map<string, number>();

  // the dabs, as parallel arrays
  private n = 0;
  private dx = new Float32Array(0);
  private dy = new Float32Array(0);
  private rx = new Float32Array(0);
  private ry = new Float32Array(0);
  private cos = new Float32Array(0);
  private sin = new Float32Array(0);
  private alpha = new Float32Array(0);
  private start = new Float32Array(0);
  /** The dab's shimmer group (the finished painting is baked into one layer per group). */
  private group = new Uint8Array(0);
  private baked = '';
  private layersOn = false;
  private owner = new Uint16Array(0);
  private sprite = new Uint16Array(0);

  private clusters: Cluster[] = [];
  private strokes: Stroke[] = [];
  private emph = new Float32Array(0);
  private end = 3;

  private elapsed = 0;
  private clock = 0;
  private last: number | null = null;
  private raf = 0;
  private visible = true;
  private pageVisible = true;

  private hover: number | null = null;
  private focus: number | null = null;
  private focusAmt = 0;
  private idleFlow: number | null = null;
  private idleAmt = 0;
  private idleUntil = 0;
  private idleNext = 0;
  private lastInput = 0;
  private glints: Glint[] = [];
  private px = 0;
  private py = 0;
  private tx = 0;
  private ty = 0;
  private finePointer = false;

  constructor(cv: PaintingCanvases, private data: PaintingData, private opts: PaintingOptions) {
    this.canvas = cv.live;
    this.groundEl = cv.ground;
    this.layers = cv.layers;
    this.ctx = cv.live.getContext('2d')!;
    this.finePointer = window.matchMedia('(pointer: fine)').matches;
  }

  /** Lays the painting out for a canvas of w × h CSS px. */
  resize(w: number, h: number): void {
    if (w < 2 || h < 2 || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const cv of [this.canvas, ...this.layers]) {
      cv.width = Math.round(w * this.dpr);
      cv.height = Math.round(h * this.dpr);
    }
    this.narrow = w < TUNE.narrowBelow;
    this.build();
    this.theme();
  }

  /** Reads the theme from the canvas's ground colour (--hp-canvas) and repaints the sprites and the ground. */
  theme(): void {
    if (!this.w) return;
    const ground = getComputedStyle(this.canvas).getPropertyValue('--hp-canvas').trim() || '#F3EDDF';
    this.dark = luminance(ground) < 0.3;
    this.sprites = this.keys.map((k) => makeSprite(keyColour(k, this.dark), hash(k)));
    this.glintSprite = makeGlint(this.dark);
    this.ground(ground);
    this.baked = '';
    this.kick();
  }

  setVisible(v: boolean): void { this.visible = v; this.kick(); }
  setPageVisible(v: boolean): void { this.pageVisible = v; this.last = null; this.kick(); }

  /** The economy under (x, y) in CSS px, or null. */
  hit(x: number, y: number): number | null {
    let best: number | null = null, bd = Infinity;
    this.clusters.forEach((c, i) => {
      const d = Math.hypot(x - this.px - c.x, y - this.py - c.y);
      const reach = c.r * 0.95 + 6;
      if (d < reach && d / reach < bd) { bd = d / reach; best = i; }
    });
    return best;
  }

  get focused(): number | null { return this.hover; }

  pointer(x: number, y: number): number | null {
    this.lastInput = this.clock;
    if (this.finePointer && !this.opts.reduced) {
      this.tx = clamp01(x / this.w) * 2 - 1;
      this.ty = clamp01(y / this.h) * 2 - 1;
    }
    const h = this.hit(x, y);
    if (h !== this.hover) {
      this.hover = h;
      if (h != null) {
        this.focus = h;
        this.endIdle();
      }
      this.label();
    }
    this.kick();
    return h;
  }

  leave(): void {
    this.lastInput = this.clock;
    this.tx = 0; this.ty = 0;
    if (this.hover != null) { this.hover = null; this.label(); }
    this.kick();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private label(): void {
    const i = this.hover;
    if (i == null) { this.opts.onLabel(null); return; }
    const c = this.clusters[i], nd = this.data.nodes[i];
    this.opts.onLabel({ name: nd.name, trade: nd.trade, x: c.x + this.px, y: c.y + this.py, r: c.r });
  }

  private keyOf(key: string): number {
    let k = this.keyIndex.get(key);
    if (k == null) { k = this.keys.length; this.keys.push(key); this.keyIndex.set(key, k); }
    return k;
  }

  /** A broken-colour sprite key near a region's hue; `shadows` false for strokes, which read as stripes with them. */
  private paint(region: string, R: () => number, lightBias = 0, shadows = true): number {
    const u = R();
    if (u < TUNE.highlights) return this.keyOf(`hi|${Math.floor(R() * 3)}`);
    if (shadows && u < TUNE.highlights + TUNE.shadows) return this.keyOf(`sh|${Math.floor(R() * 3)}`);
    const li = Math.max(0, Math.min(3, Math.floor(R() * 4 + lightBias)));
    return this.keyOf(`${TUNE.regions[region] ? region : 'other'}|${Math.floor(R() * 3)}|${li}`);
  }

  /** Generates every dab for the current size: clusters (largest first), then the strokes into what is left of the cap. */
  private build(): void {
    const { nodes, flows: all, aspect } = this.data;
    const S = Math.min(this.w / aspect, this.h);
    const X0 = (this.w - aspect * S) / 2, Y0 = (this.h - S) / 2;
    const size = TUNE.dabSize * (this.narrow ? TUNE.narrowSize : 1) * Math.max(0.6, Math.min(1.3, S / 440));
    const density = this.narrow ? TUNE.narrowDabs : 1;
    this.clusters = nodes.map((nd) => ({ x: X0 + nd.x * S, y: Y0 + nd.y * S, r: nd.r * S }));
    const rMax = Math.max(...this.clusters.map((c) => c.r), 1);
    const flows = all.slice(0, this.narrow ? TUNE.flowsNarrow : TUNE.flows);
    const N = nodes.length, F = flows.length;

    interface Dab { x: number; y: number; rx: number; ry: number; a: number; al: number; st: number; o: number; sp: number }
    const strokeDabs: Dab[][] = [];
    const clusterDabs: Dab[][] = [];

    // clusters: pads first (larger, flatter, darker), blooms on top
    const order = nodes.map((_, i) => i).sort((a, b) => nodes[b].total - nodes[a].total);
    order.forEach((i, rank) => {
      const c = this.clusters[i], R = rng(hash(nodes[i].id));
      const k = Math.sqrt(c.r / rMax);
      const count = Math.round((TUNE.dabsMin + (TUNE.dabsMax - TUNE.dabsMin) * k * k) * density);
      const t0 = TUNE.inClusters * (rank / N) ** 0.8;
      const out: Dab[] = [];
      for (let d = 0; d < count; d++) {
        const pad = d < count * 0.3;
        const rr = c.r * Math.pow(R(), 0.75) * (pad ? 0.7 : 0.9), th = R() * Math.PI * 2;
        const base = Math.max(3.2 * size, Math.min(26 * size, c.r * (0.24 + R() * 0.2))) * (pad ? 1.15 : 1);
        const flat = pad ? 0.38 + R() * 0.16 : 0.48 + R() * 0.22;
        const ang = R() < 0.72 ? (R() - 0.5) * 0.6 : (R() - 0.5) * Math.PI;
        out.push({
          x: c.x + Math.cos(th) * rr, y: c.y + Math.sin(th) * rr * 0.85, rx: base, ry: base * flat, a: ang,
          al: pad ? 0.3 + R() * 0.16 : 0.42 + R() * 0.3, st: t0 + R() * TUNE.inClusterSpread, o: i,
          sp: this.paint(nodes[i].region, R, pad ? -0.8 : 0.3),
        });
      }
      clusterDabs[i] = out;
    });

    // strokes: a curved path from inside the exporter's cluster to inside the importer's, bowed to its right
    const vMax = flows[0]?.value || 1;
    this.strokes = flows.map((f, j) => {
      const a = this.clusters[f.s], b = this.clusters[f.t];
      const ddx = b.x - a.x, ddy = b.y - a.y, len = Math.hypot(ddx, ddy) || 1;
      const ux = ddx / len, uy = ddy / len;
      const x0 = a.x + ux * a.r * 0.55, y0 = a.y + uy * a.r * 0.55, x1 = b.x - ux * b.r * 0.55, y1 = b.y - uy * b.r * 0.55;
      const l2 = Math.hypot(x1 - x0, y1 - y0);
      const k = Math.sqrt(f.value / vMax);
      return {
        f: j, x0, y0, x1, y1, v: f.value,
        cx: (x0 + x1) / 2 - uy * TUNE.bow * l2, cy: (y0 + y1) / 2 + ux * TUNE.bow * l2,
        dur: lerp(TUNE.glintSlow, TUNE.glintFast, k),
      };
    });
    const nClusterDabs = clusterDabs.reduce((s, d) => s + d.length, 0);
    const want = this.strokes.map((s) => {
      const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 1.1;
      const w = Math.max(TUNE.strokeMin, TUNE.strokeMax * (s.v / vMax) ** 0.6) * size;
      return Math.max(8, Math.min(46, Math.round(l / Math.max(5, w * 0.8))));
    });
    const budget = Math.max(0, TUNE.maxDabs - nClusterDabs);
    const scale = Math.min(1, budget / Math.max(1, want.reduce((s, x) => s + x, 0)));
    this.strokes.forEach((s, j) => {
      const f = flows[j], R = rng(hash(`${nodes[f.s].id}>${nodes[f.t].id}`));
      const w = Math.max(TUNE.strokeMin, TUNE.strokeMax * (s.v / vMax) ** 0.6) * size;
      const n = Math.max(6, Math.round(want[j] * scale));
      const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      const t0 = lerp(TUNE.inStrokesFrom, TUNE.inStrokesTo, F > 1 ? j / (F - 1) : 0);
      const k = Math.sqrt(s.v / vMax);
      const out: Dab[] = [];
      for (let d = 0; d < n; d++) {
        const t = clamp01(d / (n - 1) + (R() - 0.5) * 0.6 / n);
        const u = 1 - t;
        const x = u * u * s.x0 + 2 * u * t * s.cx + t * t * s.x1, y = u * u * s.y0 + 2 * u * t * s.cy + t * t * s.y1;
        const tx = 2 * u * (s.cx - s.x0) + 2 * t * (s.x1 - s.cx), ty = 2 * u * (s.cy - s.y0) + 2 * t * (s.y1 - s.cy);
        const tl = Math.hypot(tx, ty) || 1;
        const taper = Math.sin(Math.PI * t) ** 0.6;
        const off = (R() - 0.5) * w * 0.5;
        // the exporter's colour, turning to the importer's over the middle of the stroke
        const region = R() < clamp01((t - 0.3) / 0.4) ? nodes[f.t].region : nodes[f.s].region;
        out.push({
          x: x - (ty / tl) * off, y: y + (tx / tl) * off,
          rx: Math.max(3 * size, Math.min(l / n * 1.9, w * 1.8) + 2), ry: Math.max(0.9, w * 0.6 * (0.3 + 0.7 * taper)),
          a: Math.atan2(ty, tx) + (R() - 0.5) * 0.25,
          al: (0.3 + 0.45 * k) * (0.2 + 0.8 * taper ** 0.8), st: t0 + t * TUNE.inStrokeDraw + R() * 0.06, o: N + j,
          sp: this.paint(region, R, 0.4, false),
        });
      }
      strokeDabs[j] = out;
    });

    // draw order: strokes (small under large), then clusters (large under small)
    const list: Dab[] = [];
    for (let j = F - 1; j >= 0; j--) list.push(...strokeDabs[j]);
    for (const i of order) list.push(...clusterDabs[i]);
    const n = (this.n = list.length);
    this.dx = new Float32Array(n); this.dy = new Float32Array(n);
    this.rx = new Float32Array(n); this.ry = new Float32Array(n);
    this.cos = new Float32Array(n); this.sin = new Float32Array(n);
    this.alpha = new Float32Array(n); this.start = new Float32Array(n);
    this.group = new Uint8Array(n);
    const G = rng(n);
    this.owner = new Uint16Array(n); this.sprite = new Uint16Array(n);
    let end = 0;
    list.forEach((d, i) => {
      this.dx[i] = d.x; this.dy[i] = d.y; this.rx[i] = d.rx; this.ry[i] = d.ry;
      this.cos[i] = Math.cos(d.a); this.sin[i] = Math.sin(d.a);
      this.alpha[i] = d.al; this.start[i] = d.st; this.group[i] = Math.floor(G() * GROUPS);
      this.owner[i] = d.o; this.sprite[i] = d.sp;
      end = Math.max(end, d.st + TUNE.inDab);
    });
    this.end = end;
    this.emph = new Float32Array(N + F).fill(1);
    this.glints = [];
    this.idleFlow = null;
    this.idleAmt = 0;
    if (this.hover != null) this.label();
  }

  /** The ground: canvas colour, grain, washes of colour behind the largest clusters, streaks of light on water. */
  private ground(colour: string): void {
    const d = this.dpr, W = this.w + OVER * 2, H = this.h + OVER * 2;
    const cv = this.groundEl;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    const g = cv.getContext('2d')!;
    g.scale(d, d);
    g.fillStyle = colour;
    g.fillRect(0, 0, W, H);
    const R = rng(7);
    // atmosphere: a few broad, faint washes of water colour across the ground
    for (let k = 0; k < 7; k++) {
      const x = R() * W, y = R() * H, rad = H * (0.35 + R() * 0.5);
      const c: HSL = this.dark ? [165 + R() * 40, 30, 22] : [120 + R() * 80, 24, 82];
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, hsla(c, this.dark ? 0.25 : 0.14));
      grad.addColorStop(1, hsla(c, 0));
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // light on water: long, flat, soft streaks
    for (let k = 0; k < 14; k++) {
      const x = R() * W, y = R() * H, rw = 50 + R() * 150, rh = 5 + R() * 10;
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const c = this.dark ? (R() < 0.5 ? 'hsla(160,30%,55%,' : 'hsla(200,30%,60%,') : (R() < 0.6 ? 'hsla(48,60%,98%,' : 'hsla(170,24%,78%,');
      const a = this.dark ? 0.05 : 0.22;
      grad.addColorStop(0, `${c}${a})`);
      grad.addColorStop(1, `${c}0)`);
      g.save(); g.translate(x, y); g.scale(rw, rh); g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // washes (and, at night, a glow) behind the clusters
    const order = this.clusters.map((_, i) => i).sort((a, b) => this.clusters[b].r - this.clusters[a].r);
    order.forEach((i, rank) => {
      const c = this.clusters[i], region = this.data.nodes[i].region;
      const base = keyColour(`${TUNE.regions[region] ? region : 'other'}|1|2`, this.dark);
      const big = rank < 10;
      const rad = c.r * (big ? 2.5 : 1.6);
      const a = this.dark ? (big ? 0.2 : 0.12) : (big ? 0.13 : 0.06);
      const grad = g.createRadialGradient(c.x + OVER, c.y + OVER, 0, c.x + OVER, c.y + OVER, rad);
      grad.addColorStop(0, hsla(base, a));
      grad.addColorStop(1, hsla(base, 0));
      g.fillStyle = grad;
      g.fillRect(c.x + OVER - rad, c.y + OVER - rad, rad * 2, rad * 2);
    });
    // grain: a tile of speckles and a faint weave, at device pixels
    g.setTransform(1, 0, 0, 1, 0, 0);
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tg = tile.getContext('2d')!;
    const ink = this.dark ? '220,235,225' : '90,70,40';
    for (let k = 0; k < 1400; k++) {
      tg.fillStyle = `rgba(${ink},${(R() * (this.dark ? 0.05 : 0.07)).toFixed(3)})`;
      tg.fillRect(Math.floor(R() * 128), Math.floor(R() * 128), 1, 1);
    }
    tg.fillStyle = `rgba(${ink},${this.dark ? 0.018 : 0.025})`;
    for (let k = 0; k < 128; k += 3) { tg.fillRect(0, k, 128, 1); tg.fillRect(k, 0, 1, 128); }
    g.fillStyle = g.createPattern(tile, 'repeat')!;
    g.fillRect(0, 0, cv.width, cv.height);
  }

  private endIdle(): void {
    if (this.idleFlow != null) this.opts.onCaption(null);
    this.idleUntil = 0;
  }

  /** Schedules a frame when one is due. */
  private kick(): void {
    if (this.raf || !this.w || !this.visible || !this.pageVisible) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (ms: number): void => {
    this.raf = 0;
    const now = ms / 1000;
    const dt = this.last == null ? 1 / 60 : Math.min(0.05, Math.max(0, now - this.last));
    this.last = now;
    this.clock += dt;
    const reduced = this.opts.reduced;
    this.elapsed = reduced ? this.end : this.elapsed + dt;
    const done = this.elapsed >= this.end;

    // hover emphasis
    const fStep = dt / TUNE.focusFade;
    const prevFocus = this.focusAmt;
    this.focusAmt = this.hover != null ? Math.min(1, this.focusAmt + fStep) : Math.max(0, this.focusAmt - fStep);
    if (this.focusAmt === 0 && this.hover == null) this.focus = null;

    // idle: one notable flow lit, with its caption
    const F = this.strokes.length;
    const prevIdle = this.idleAmt;
    if (!reduced && done && F) {
      if (this.idleFlow == null && this.hover == null && this.clock - this.lastInput >= TUNE.idleEvery && this.clock >= this.idleNext) {
        this.idleFlow = this.idleRank++ % Math.min(TUNE.idleFlows, F);
        this.idleUntil = this.clock + TUNE.idleHold;
        this.opts.onCaption(this.data.flows[this.idleFlow].caption);
        this.glints.push({ s: this.idleFlow, age: 0, dur: this.strokes[this.idleFlow].dur });
      }
      if (this.idleFlow != null && this.clock >= this.idleUntil) {
        if (this.idleUntil) this.opts.onCaption(null);
        this.idleUntil = 0;
        this.idleAmt = Math.max(0, this.idleAmt - dt / 0.8);
        if (this.idleAmt === 0) { this.idleFlow = null; this.idleNext = this.clock + TUNE.idleEvery; this.lastInput = this.clock; }
      } else if (this.idleFlow != null) {
        this.idleAmt = Math.min(1, this.idleAmt + dt / 0.8);
      }
    }

    this.emphasis();

    // parallax
    if (this.finePointer && !reduced) {
      this.px += (this.tx * TUNE.parallax - this.px) * Math.min(1, dt * 3);
      this.py += (this.ty * TUNE.parallax * 0.7 - this.py) * Math.min(1, dt * 3);
    }

    // glints
    if (!reduced && done && F) {
      const max = this.narrow ? TUNE.glintsNarrow : TUNE.glints;
      for (const gl of this.glints) gl.age += dt;
      this.glints = this.glints.filter((gl) => gl.age < gl.dur);
      if (this.glints.length < max && Math.random() < dt * 1.4) {
        // a flow chosen in proportion to its value
        const tot = this.strokes.reduce((s, x) => s + x.v, 0);
        let pick = Math.random() * tot, s = 0;
        while (s < F - 1 && pick > this.strokes[s].v) { pick -= this.strokes[s].v; s++; }
        this.glints.push({ s, age: 0, dur: this.strokes[s].dur * (0.9 + Math.random() * 0.2) });
      }
    }

    this.draw(reduced);
    if (this.hover != null && prevFocus !== this.focusAmt) this.label();

    const moving = !reduced || this.focusAmt !== prevFocus || this.idleAmt !== prevIdle || (this.hover != null && this.focusAmt < 1);
    if (moving) this.kick();
  };

  private idleRank = 0;

  /** Per cluster and per stroke: how strongly it shows this frame (hover and idle). */
  private emphasis(): void {
    const N = this.clusters.length, flows = this.data.flows;
    const e = this.emph;
    const fa = ease(this.focusAmt), ia = ease(this.idleAmt) * (1 - fa);
    const fi = this.focus, ii = this.idleFlow;
    const linked = new Set<number>();
    if (fi != null) {
      for (let j = 0; j < this.strokes.length; j++) {
        if (flows[j].s === fi || flows[j].t === fi) { linked.add(flows[j].s); linked.add(flows[j].t); }
      }
    }
    for (let i = 0; i < N; i++) {
      let v = 1;
      if (fi != null) v = i === fi ? 1 : linked.has(i) ? lerp(1, 0.72, fa) : lerp(1, TUNE.dimTo, fa);
      if (ii != null && i !== flows[ii].s && i !== flows[ii].t) v *= lerp(1, 0.72, ia);
      e[i] = v;
    }
    for (let j = 0; j < this.strokes.length; j++) {
      let v = 1;
      if (fi != null) v = flows[j].s === fi || flows[j].t === fi ? 1 + 0.4 * fa : lerp(1, TUNE.dimTo, fa);
      if (ii != null) v *= j === ii ? 1 + 0.6 * ia : lerp(1, 0.55, ia);
      e[N + j] = v;
    }
  }

  /** Shimmer of each dab group this frame: opacity factor and drift (px). */
  private shimmer(reduced: boolean): { a: number[]; x: number[]; y: number[] } {
    const a: number[] = [], x: number[] = [], y: number[] = [], c = this.clock;
    for (let k = 0; k < GROUPS; k++) {
      const fq = (0.21 + 0.13 * k) * Math.PI * 2, ph = k * 2.1;
      a.push(reduced ? 1 : 1 - TUNE.shimmerAlpha * (0.5 + 0.5 * Math.sin(fq * c + ph)));
      x.push(reduced ? 0 : TUNE.shimmerDrift * Math.sin(fq * 0.7 * c + ph * 1.3));
      y.push(reduced ? 0 : TUNE.shimmerDrift * 0.6 * Math.cos(fq * 0.6 * c + ph));
    }
    return { a, x, y };
  }

  /** Draws the dabs painted by time `t` (of one group, or all) onto `g`, with per-group shimmer `sh` (or none) and
   *  the offset (ox, oy) in CSS px. */
  private dabs(g: CanvasRenderingContext2D, only: number | null, t: number, ox: number, oy: number, sh: ReturnType<Painting['shimmer']> | null): void {
    const d = this.dpr, inDab = TUNE.inDab;
    for (let i = 0; i < this.n; i++) {
      const st = this.start[i];
      if (t < st) continue;
      const gr = this.group[i];
      if (only != null && gr !== only) continue;
      const k = t - st >= inDab ? 1 : ease((t - st) / inDab);
      let a = this.alpha[i] * k * this.emph[this.owner[i]];
      if (sh) a *= sh.a[gr];
      if (a < 0.004) continue;
      const s = 0.7 + 0.3 * k;
      const x = this.dx[i] + ox + (sh ? sh.x[gr] : 0), y = this.dy[i] + oy + (sh ? sh.y[gr] : 0);
      const co = this.cos[i] * s * d, si = this.sin[i] * s * d;
      g.globalAlpha = a > 1 ? 1 : a;
      g.setTransform(co, si, -si, co, x * d, y * d);
      const rx = this.rx[i], ry = this.ry[i];
      g.drawImage(this.sprites[this.sprite[i]], -rx, -ry, rx * 2, ry * 2);
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Bakes the finished dabs into one layer per shimmer group, with this frame's emphasis. */
  private bake(): void {
    const W = this.canvas.width, H = this.canvas.height;
    for (let k = 0; k < GROUPS; k++) {
      const cv = this.layers[k];
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const g = cv.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      this.dabs(g, k, Infinity, 0, 0, null);
    }
  }

  private draw(reduced: boolean): void {
    const g = this.ctx, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const ox = this.px, oy = this.py;
    this.groundEl.style.transform = `translate3d(${(-ox * 0.7).toFixed(2)}px,${(-oy * 0.7).toFixed(2)}px,0)`;
    const sh = this.shimmer(reduced);
    const painting = this.elapsed < this.end;
    if (painting) {
      // painting in: every dab, as far as it has come
      this.dabs(g, null, this.elapsed, ox, oy, sh);
    } else {
      // finished: the baked layers (re-baked when the emphasis changes), each shimmering as one
      const sig = `${this.sprites.length}|${this.w}|${this.h}|${this.focus}|${this.focusAmt.toFixed(3)}|${this.idleFlow}|${this.idleAmt.toFixed(3)}`;
      if (sig !== this.baked) { this.bake(); this.baked = sig; }
      this.layers.forEach((cv, k) => {
        cv.style.opacity = sh.a[k].toFixed(3);
        cv.style.transform = `translate3d(${(ox + sh.x[k]).toFixed(2)}px,${(oy + sh.y[k]).toFixed(2)}px,0)`;
      });
    }
    if (this.layersOn === painting) {
      this.layersOn = !painting;
      for (const cv of this.layers) cv.style.visibility = painting ? 'hidden' : 'visible';
    }
    // glints: a bright point and a short fading tail, exporter to importer
    if (this.glints.length && this.glintSprite) {
      g.globalCompositeOperation = this.dark ? 'lighter' : 'source-over';
      const N = this.clusters.length;
      for (const gl of this.glints) {
        const s = this.strokes[gl.s];
        if (!s) continue;
        const u0 = gl.age / gl.dur;
        const env = Math.sin(Math.PI * clamp01(u0)) ** 0.5 * Math.min(1, this.emph[N + gl.s]);
        const big = 3 + 4 * Math.sqrt(s.v / this.strokes[0].v);
        for (let k = 5; k >= 0; k--) {
          const u = u0 - k * 0.018;
          if (u < 0 || u > 1) continue;
          const v = 1 - u;
          const x = v * v * s.x0 + 2 * v * u * s.cx + u * u * s.x1 + ox, y = v * v * s.y0 + 2 * v * u * s.cy + u * u * s.y1 + oy;
          const r = big * (1 - k * 0.13) * (k ? 0.8 : 1.6);
          g.globalAlpha = env * (k ? 0.35 * (1 - k / 6) : 0.95);
          g.setTransform(d, 0, 0, d, x * d, y * d);
          g.drawImage(this.glintSprite, -r, -r, r * 2, r * 2);
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** Relative luminance of a CSS colour (#rgb, #rrggbb or rgb()), 0–1. */
function luminance(css: string): number {
  let r = 0, g = 0, b = 0;
  const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = css.match(/(\d+(?:\.\d+)?)/g);
    if (m && m.length >= 3) [r, g, b] = m.slice(0, 3).map(Number);
  }
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
