// The map layout: every economy near where people expect it, no two circles overlapping. Chosen over a plain
// geographic Dorling, a size-weighted stretch and a regional schematic in the comparison of 25 Oct 2026
// (docs/MAP-LAYOUT.md). Two steps:
//   1. The stretch (data-independent, once per canvas size): the projected centroids of every economy in meta,
//      each axis stretched by a monotone rank transform (equal room for every economy, blended with the projection),
//      so dense Europe and East Asia get more room and the oceans less, with left/right and up/down order kept.
//   2. The collision (per drawing): from the stretched spots, a Dorling force layout (a pull to the spot, collision
//      at the radius plus a little personal space), then any overlap left is pushed apart.
// Same input, same positions (d3-force's own seeded jiggle); positions move only as much as the sizes change, so
// playing through time does not reshuffle the picture. Pure functions on screen coordinates: NetView and the
// server-rendered first view draw the same layout.
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3';
import type { Box } from './geo';
import type { Meta } from './types';

/** How far each axis is stretched toward equal room per economy (0: the projection, 1: fully equalised). */
export const STRETCH_X = 0.7;
export const STRETCH_Y = 0.6;
/** Margin (px) the stretch keeps from the edge of the drawing box. */
export const STRETCH_MARGIN = 16;
/** The circles' bounding squares may cover at most this share of the map box; beyond it (sizing by number of
 *  partners makes most economies large) every radius shrinks by the same factor (scene.ts buildScene). */
export const MAX_FILL = 0.45;
/** The pull back to the stretched spot in the collision step (d3 forceX/forceY strength). */
export const ANCHOR_STRENGTH = 0.3;
/** Personal space between two circles, as a share of the box width (6.5 px on a 1,080 px map, 3.4 px on a phone). */
export const GAP = 0.009;
/** Ticks of the collision step. */
export const TICKS = 160;
/** The region tint: a disc of radius + HALO px around each member. */
export const HALO = 14;
/** A region's name sits beside its core: its largest member and the members within CORE × the box width of it. */
export const CORE = 0.12;
/** A region's name is left out rather than drawn over a circle or more than this many flow points. */
export const MAX_CIRCLES = 0;
export const MAX_FLOW_POINTS = 8;

/** The eight regions of the region grouping (groups/memberships.json), from the UN subregion in meta. */
export const REGION_KEYS = ['NAM', 'LAC', 'EUR', 'MENA', 'SSA', 'CSA', 'EAS', 'OCE'] as const;
const REGION_OF: Record<string, string> = {
  'Northern America': 'NAM', 'Latin America and the Caribbean': 'LAC',
  'Northern Europe': 'EUR', 'Southern Europe': 'EUR', 'Western Europe': 'EUR', 'Eastern Europe': 'EUR',
  'Western Asia': 'MENA', 'Northern Africa': 'MENA', 'Sub-Saharan Africa': 'SSA',
  'Southern Asia': 'CSA', 'Central Asia': 'CSA', 'Eastern Asia': 'EAS', 'South-eastern Asia': 'EAS',
  'Australia and New Zealand': 'OCE', Melanesia: 'OCE', Micronesia: 'OCE', Polynesia: 'OCE',
};

/** Region colours and names, as in the region grouping. */
export const REGIONS: Record<string, { colour: string; en: string; ko: string }> = {
  NAM: { colour: 'viz-3', en: 'North America', ko: '북미' },
  LAC: { colour: 'viz-6', en: 'Latin America and the Caribbean', ko: '중남미·카리브' },
  EUR: { colour: 'viz-5', en: 'Europe', ko: '유럽' },
  MENA: { colour: 'viz-8', en: 'Middle East and North Africa', ko: '중동·북아프리카' },
  SSA: { colour: 'viz-1', en: 'Sub-Saharan Africa', ko: '사하라 이남 아프리카' },
  CSA: { colour: 'viz-7', en: 'Central and South Asia', ko: '중앙·남아시아' },
  EAS: { colour: 'viz-4', en: 'East and Southeast Asia', ko: '동·동남아시아' },
  OCE: { colour: 'viz-2', en: 'Oceania', ko: '오세아니아' },
};

export function regionOf(meta: Meta, i: number): string {
  return REGION_OF[meta.nodes[i]?.subregion ?? ''] ?? 'other';
}

export interface MapItem extends SimulationNodeDatum {
  i: number;
  r: number;
  x: number;
  y: number;
}

/** Step 1: the stretched spot of every economy (index into meta.nodes → [x, y]), from all projected centroids. */
export function stretchedSpots(anchors: { k: number; x: number; y: number }[], box: Box): Map<number, [number, number]> {
  const ex = stretch(anchors.map((p) => ({ k: p.k, v: p.x })), box.x0 + STRETCH_MARGIN, box.x1 - STRETCH_MARGIN, STRETCH_X);
  const ey = stretch(anchors.map((p) => ({ k: p.k, v: p.y })), box.y0 + STRETCH_MARGIN, box.y1 - STRETCH_MARGIN, STRETCH_Y);
  return new Map(anchors.map((p) => [p.k, [ex.get(p.k)!, ey.get(p.k)!]]));
}

/** One axis: each value's rank position (equal room per economy) blended with the value itself, both spread over
 *  lo–hi. Monotone, so the order along the axis is kept. */
function stretch(vals: { k: number; v: number }[], lo: number, hi: number, alpha: number): Map<number, number> {
  const sorted = [...vals].sort((a, b) => a.v - b.v || a.k - b.k);
  const n = sorted.length;
  const vmin = sorted[0]?.v ?? 0, vmax = sorted[n - 1]?.v ?? 0;
  const out = new Map<number, number>();
  sorted.forEach((x, rank) => {
    const eq = lo + ((rank + 0.5) / n) * (hi - lo);
    const geo = vmax > vmin ? lo + ((x.v - vmin) / (vmax - vmin)) * (hi - lo) : (lo + hi) / 2;
    out.set(x.k, (1 - alpha) * geo + alpha * eq);
  });
  return out;
}

/** Step 2: places `items` (x, y) from their spots without overlaps. Positions are written to the items. */
export function layoutMap(items: MapItem[], spot: (i: number) => [number, number], box: Box): void {
  if (!items.length) return;
  const gap = GAP * (box.x1 - box.x0);
  const tx = (d: MapItem) => spot(d.i)[0], ty = (d: MapItem) => spot(d.i)[1];
  for (const d of items) { d.x = tx(d); d.y = ty(d); d.vx = 0; d.vy = 0; }
  const sim = forceSimulation<MapItem>(items)
    .force('x', forceX<MapItem>(tx).strength(ANCHOR_STRENGTH))
    .force('y', forceY<MapItem>(ty).strength(ANCHOR_STRENGTH))
    .force('collide', forceCollide<MapItem>((d) => d.r + gap / 2).strength(0.9).iterations(2))
    .alpha(1).alphaDecay(1 - Math.pow(0.001, 1 / TICKS))
    .stop();
  for (let k = 0; k < TICKS; k++) sim.tick();
  for (const d of items) clamp(d, box);
  resolve(items, box, gap);
}

/** Removes every overlap that is left: pairs pushed apart (the smaller circle moves more), kept inside the box. */
export function resolve(items: MapItem[], box: Box, gap: number, passes = 2000): void {
  const n = items.length;
  if (!n) return;
  const cell = 2 * Math.max(...items.map((d) => d.r)) + gap;
  for (let pass = 0; pass < passes; pass++) {
    const grid = new Map<string, number[]>();
    items.forEach((d, k) => {
      const key = `${Math.floor(d.x / cell)},${Math.floor(d.y / cell)}`;
      const list = grid.get(key);
      if (list) list.push(k); else grid.set(key, [k]);
    });
    let moved = 0;
    for (let k = 0; k < n; k++) {
      const a = items[k];
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const m of grid.get(`${gx},${gy}`) ?? []) {
            if (m <= k) continue;
            const b = items[m];
            let dx = b.x - a.x, dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            const want = a.r + b.r + gap;
            if (d >= want - 1e-6) continue;
            if (d < 1e-6) { dx = (a.i < b.i ? 1 : -1) * 0.01; dy = 0.007; d = Math.hypot(dx, dy); }
            const over = want - d;
            const wa = (b.r * b.r) / (a.r * a.r + b.r * b.r || 1), wb = 1 - wa;
            a.x -= (dx / d) * over * wa; a.y -= (dy / d) * over * wa;
            b.x += (dx / d) * over * wb; b.y += (dy / d) * over * wb;
            clamp(a, box); clamp(b, box);
            moved++;
          }
        }
      }
    }
    if (!moved) return;
  }
}

function clamp(d: MapItem, box: Box): void {
  d.x = Math.max(box.x0 + d.r, Math.min(box.x1 - d.r, d.x));
  d.y = Math.max(box.y0 + d.r, Math.min(box.y1 - d.r, d.y));
}

export interface RegionTint {
  g: string;
  /** Discs around the members; their union, drawn at low opacity, is the region's tint. */
  discs: { x: number; y: number; r: number }[];
}

/** The ground of the map: one tint per region (a disc of radius + HALO around every member). */
export function regionTints(items: { x: number; y: number; r: number; g: string }[]): RegionTint[] {
  return REGION_KEYS.map((g) => ({
    g, discs: items.filter((d) => d.g === g).map((d) => ({ x: d.x, y: d.y, r: d.r + HALO })),
  })).filter((t) => t.discs.length);
}

export interface RegionName { g: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; text: string }

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Where the regions' names go, in screen coordinates: beside each region's core (above, below, right, left or a
 *  corner), the spot that crosses the fewest circles and flows (`busy`: points sampled along the drawn flows),
 *  preferring the region's outer side (flows run between regions, so the outside is quiet), never over an
 *  economy's label (`taken`) or a name placed before it (largest region first). A region with no free spot inside
 *  the box goes unnamed. */
export function placeRegionNames(
  items: { x: number; y: number; r: number; g: string }[], taken: Rect[], box: Box, text: (g: string) => string,
  busy: [number, number][] = [],
): RegionName[] {
  const out: RegionName[] = [];
  const placed: Rect[] = [...taken];
  const core = CORE * (box.x1 - box.x0);
  const regions = REGION_KEYS.map((g) => ({ g, mem: items.filter((d) => d.g === g) })).filter((r) => r.mem.length)
    .sort((a, b) => Math.max(...b.mem.map((d) => d.r)) - Math.max(...a.mem.map((d) => d.r)));
  for (const { g, mem } of regions) {
    const top = mem.reduce((a, b) => (b.r > a.r ? b : a));
    const near = mem.filter((d) => Math.hypot(d.x - top.x, d.y - top.y) <= core + d.r);
    const x0 = Math.min(...near.map((d) => d.x - d.r)), x1 = Math.max(...near.map((d) => d.x + d.r));
    const y0 = Math.min(...near.map((d) => d.y - d.r)), y1 = Math.max(...near.map((d) => d.y + d.r));
    const t = text(g);
    // 11px type with wide letter-spacing: about 8px a Latin character, 12px a Hangul syllable
    const w = [...t].reduce((s, ch) => s + (/[ㄱ-힣]/.test(ch) ? 12 : 8), 0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const spots: Omit<RegionName, 'g' | 'text'>[] = [
      { x: cx, y: y0 - 10, anchor: 'middle' }, { x: cx, y: y1 + 10, anchor: 'middle' },
      { x: x1 + 8, y: cy, anchor: 'start' }, { x: x0 - 8, y: cy, anchor: 'end' },
      { x: x0, y: y0 - 10, anchor: 'end' }, { x: x1, y: y0 - 10, anchor: 'start' },
      { x: x0, y: y1 + 10, anchor: 'end' }, { x: x1, y: y1 + 10, anchor: 'start' },
    ];
    // the region's outward direction, from the middle of the box
    const ox = cx - (box.x0 + box.x1) / 2, oy = cy - (box.y0 + box.y1) / 2, ol = Math.hypot(ox, oy) || 1;
    const rect = (p: typeof spots[number]): Rect => {
      const left = p.anchor === 'start' ? p.x : p.anchor === 'end' ? p.x - w : p.x - w / 2;
      return { x0: left, y0: p.y - 7, x1: left + w, y1: p.y + 7 };
    };
    const cost = (p: typeof spots[number]) => {
      const b = rect(p);
      if (b.x0 < box.x0 || b.x1 > box.x1 || b.y0 < box.y0 || b.y1 > box.y1) return Infinity;
      if (placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) return Infinity;
      const circles = items.filter((d) => d.x + d.r > b.x0 && d.x - d.r < b.x1 && d.y + d.r > b.y0 && d.y - d.r < b.y1).length;
      const flows = busy.filter(([x, y]) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1).length;
      if (circles > MAX_CIRCLES || flows > MAX_FLOW_POINTS) return Infinity;
      // the economy nearest the name must be the region's own, or the name reads as another region's
      const mx0 = (b.x0 + b.x1) / 2, my0 = (b.y0 + b.y1) / 2;
      const nearest = items.reduce((best, d) => {
        const dist = Math.hypot(Math.max(b.x0 - d.x, 0, d.x - b.x1), Math.max(b.y0 - d.y, 0, d.y - b.y1)) - d.r;
        return dist < best.dist ? { d, dist } : best;
      }, { d: items[0], dist: Infinity });
      if (nearest.d && nearest.d.g !== g && Math.hypot(nearest.d.x - mx0, nearest.d.y - my0) < 4 * w) return Infinity;
      const mx = (b.x0 + b.x1) / 2 - cx, my = (b.y0 + b.y1) / 2 - cy;
      const inward = (mx * ox + my * oy) / (ol * (Math.hypot(mx, my) || 1)) < -0.2 ? 4 : 0;
      return 3 * circles + flows + inward;
    };
    const best = spots.map((p) => ({ p, c: cost(p) })).sort((a, b) => a.c - b.c)[0];
    if (!best || best.c === Infinity) continue;
    placed.push(rect(best.p));
    out.push({ g, text: t, ...best.p });
  }
  return out;
}

/** Points along flows drawn as curve() draws them (bowed 18% of the chord to the right of travel), for
 *  placeRegionNames' `busy`. */
export function flowPoints(flows: { a: { x: number; y: number }; b: { x: number; y: number } }[], per = 9): [number, number][] {
  const out: [number, number][] = [];
  for (const { a, b } of flows) {
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.18, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18;
    for (let k = 1; k <= per; k++) {
      const t = k / (per + 1), u = 1 - t;
      out.push([u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y]);
    }
  }
  return out;
}
