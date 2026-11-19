// What the home page's network painting draws, built on the server at build time from the same all-goods snapshot
// of the last complete year that the explorer opens on: the largest economies (sized by exports plus imports,
// coloured by region), the largest flows, and a layout from trade ties alone. No geography: positions come from a
// force layout (partners pull together, a region holds loosely together, everything repels) run with a fixed seed,
// so the picture is the same on every build and every visit. Server only.
import {
  decodeSnap, periodEnd, resolveColouring, type GroupsFile, type Meta, type RawAnnualSnap,
} from '@larch/net/core';
import { readData } from '@/lib/data';
import { formatUSD, t, type Lang } from '@/lib/i18n';
import { rng } from './rng';
import { TUNE } from './tune';

export interface PaintNode {
  id: string;
  name: string;
  /** Region key (groups/memberships.json, scheme region), or 'other'. */
  region: string;
  total: number;
  /** "$6.2tn of trade", in the page language. */
  trade: string;
  /** Centre in the layout box (x in 0..aspect, y in 0..1) and the cluster's radius in the same units. */
  x: number;
  y: number;
  r: number;
}

export interface PaintFlow {
  /** Indices into nodes: exporter and importer. */
  s: number;
  t: number;
  value: number;
  /** "China → United States · $xxx bn", in the page language. */
  caption: string;
}

export interface PaintingData {
  /** Width over height of the layout box. */
  aspect: number;
  nodes: PaintNode[];
  /** The largest flows, largest first. */
  flows: PaintFlow[];
}

/** The layout box's aspect: the hero's drawing area (home.css). */
const ASPECT = 1232 / 600;

interface Body { x: number; y: number; vx: number; vy: number; r: number; g: string }

/** The force layout: springs along the flows (stronger for larger flows), a loose pull to each region's centre,
 *  repulsion between all clusters, a wider-than-tall pull to the middle of the box, then collisions resolved and the
 *  whole fitted into the box with a margin. Mutates `bodies`. */
function layout(bodies: Body[], links: { a: number; b: number; w: number }[], seed: number): void {
  const R = rng(seed);
  const n = bodies.length;
  const cx = ASPECT / 2, cy = 0.5;
  for (const b of bodies) {
    const ang = R() * Math.PI * 2, rad = 0.15 + R() * 0.35;
    b.x = cx + Math.cos(ang) * rad * ASPECT * 0.5;
    b.y = cy + Math.sin(ang) * rad * 0.5;
  }
  const wMax = Math.max(...links.map((l) => l.w), 1e-9);
  const ITER = 520;
  for (let k = 0; k < ITER; k++) {
    const alpha = 1 - k / ITER;
    const fx = new Float64Array(n), fy = new Float64Array(n);
    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
        const d2 = Math.max(dx * dx + dy * dy, 1e-4);
        const f = (0.0028 * (1 + (bodies[i].r + bodies[j].r) * 6)) / d2;
        const d = Math.sqrt(d2);
        fx[i] -= (dx / d) * f; fy[i] -= (dy / d) * f;
        fx[j] += (dx / d) * f; fy[j] += (dy / d) * f;
      }
    }
    // springs along the flows
    for (const l of links) {
      const a = bodies[l.a], b = bodies[l.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const rest = (a.r + b.r) * 1.5 + 0.07;
      const f = 0.06 * Math.sqrt(l.w / wMax) * (d - rest);
      fx[l.a] += (dx / d) * f; fy[l.a] += (dy / d) * f;
      fx[l.b] -= (dx / d) * f; fy[l.b] -= (dy / d) * f;
    }
    // each region holds loosely together
    const cen = new Map<string, { x: number; y: number; n: number }>();
    for (const b of bodies) {
      const c = cen.get(b.g) ?? { x: 0, y: 0, n: 0 };
      c.x += b.x; c.y += b.y; c.n++;
      cen.set(b.g, c);
    }
    bodies.forEach((b, i) => {
      const c = cen.get(b.g)!;
      if (c.n > 1) { fx[i] += (c.x / c.n - b.x) * 0.012; fy[i] += (c.y / c.n - b.y) * 0.012; }
      // to the middle, gentler across than down, so the picture spreads over the wide box
      fx[i] += (cx - b.x) * 0.004;
      fy[i] += (cy - b.y) * 0.022;
    });
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.vx = (b.vx + fx[i]) * 0.6;
      b.vy = (b.vy + fy[i]) * 0.6;
      const v = Math.hypot(b.vx, b.vy), cap = 0.04 * alpha + 0.002;
      if (v > cap) { b.vx *= cap / v; b.vy *= cap / v; }
      b.x += b.vx; b.y += b.vy;
    }
  }
  fit(bodies);
}

/** Scales and centres the layout into the box (margin 4% of the height), across up to twice as much as down so the
 *  picture fills the wide box, then pushes overlapping clusters apart and back inside, a few rounds. */
function fit(bodies: Body[]): void {
  const M = 0.04;
  for (let round = 0; round < 6; round++) {
    const x0 = Math.min(...bodies.map((b) => b.x - b.r)), x1 = Math.max(...bodies.map((b) => b.x + b.r));
    const y0 = Math.min(...bodies.map((b) => b.y - b.r)), y1 = Math.max(...bodies.map((b) => b.y + b.r));
    const sy = (1 - 2 * M) / (y1 - y0), sx = Math.min((ASPECT - 2 * M) / (x1 - x0), sy * 2);
    const ox = (ASPECT - (x1 - x0) * sx) / 2, oy = (1 - (y1 - y0) * sy) / 2;
    // positions scale, radii keep their size (they are trade, not layout)
    for (const b of bodies) {
      b.x = ox + (b.x - b.r - x0) * sx + b.r;
      b.y = oy + (b.y - b.r - y0) * sy + b.r;
    }
    for (let k = 0; k < 40; k++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const want = (a.r + b.r) * 0.92;
          if (d < want) {
            const p = (want - d) / 2;
            a.x -= (dx / d) * p; a.y -= (dy / d) * p;
            b.x += (dx / d) * p; b.y += (dy / d) * p;
          }
        }
      }
      for (const b of bodies) {
        b.x = Math.min(ASPECT - M - b.r * 0.6, Math.max(M + b.r * 0.6, b.x));
        b.y = Math.min(1 - M - b.r * 0.6, Math.max(M + b.r * 0.6, b.y));
      }
    }
  }
}

/** The painting's data for the last complete year, or null when a file it needs is not built. */
export async function paintingData(meta: Meta, lang: Lang): Promise<PaintingData | null> {
  try {
    const year = meta.complete.A;
    const raw = await readData<RawAnnualSnap>(`snap/A/TOTAL/${year}.json`);
    const snap = decodeSnap(raw, { meta, product: 'TOTAL', freq: 'A', lens: null, rule: 'mirror', ncols: raw.ncols, ecols: raw.ecols });
    const groups = await readData<GroupsFile>('groups/memberships.json');
    const region = resolveColouring(groups, 'region', { date: periodEnd(year, 'A') }).groupOf;

    const top = [...snap.nodes].filter((n) => n.total > 0).sort((a, b) => b.total - a.total).slice(0, TUNE.nodes);
    const at = new Map(top.map((n, k) => [n.i, k]));
    const name = (i: number) => meta.nodes[i]?.[lang] || meta.nodes[i]?.id || '';
    const tMax = top[0]?.total || 1;
    const bodies: Body[] = top.map((n) => ({
      x: 0, y: 0, vx: 0, vy: 0, r: TUNE.clusterR * Math.sqrt(n.total / tMax), g: region[n.id] ?? 'other',
    }));

    const among = snap.edges.filter((e) => at.has(e.s) && at.has(e.t)).sort((a, b) => b.value - a.value);
    // the layout's ties: both directions of a pair as one
    const pair = new Map<string, { a: number; b: number; w: number }>();
    for (const e of among.slice(0, TUNE.layoutFlows)) {
      const a = at.get(e.s)!, b = at.get(e.t)!;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      const p = pair.get(k) ?? { a, b, w: 0 };
      p.w += e.value;
      pair.set(k, p);
    }
    layout(bodies, [...pair.values()], 20241024);

    const round = (v: number) => Math.round(v * 10000) / 10000;
    return {
      aspect: ASPECT,
      nodes: top.map((n, k) => ({
        id: n.id, name: name(n.i), region: bodies[k].g, total: n.total,
        trade: t(lang, 'home.hero.trade', { v: formatUSD(n.total, lang) }),
        x: round(bodies[k].x), y: round(bodies[k].y), r: round(bodies[k].r),
      })),
      flows: among.slice(0, Math.max(TUNE.flows, TUNE.flowsNarrow)).map((e) => ({
        s: at.get(e.s)!, t: at.get(e.t)!, value: e.value,
        caption: t(lang, 'home.hero.flow', { a: name(e.s), b: name(e.t), v: formatUSD(e.value, lang) }),
      })),
    };
  } catch {
    return null;
  }
}
