// What a network view draws for one snapshot and one set of controls, without a DOM: the economies (radius, fill,
// rings), the backbone flows (width, stroke), the label candidates and the greedy declutter. NetView animates it;
// the server renders the first view from it (staticScene), so both draw the same picture.
import type { SimulationNodeDatum } from 'd3';
import type { Lang } from '@larch/ui/format';
import type { BaseCompare } from './decode';
import { anchorOf, fitProjection, type Box, type World } from './geo';
import { flowPoints, layoutMap, MAX_FILL, placeRegionNames, regionOf, regionTints, REGIONS, stretchedSpots, type RegionName } from './maplayout';
import type { GroupColouring } from './groups';
import {
  assignSlots, baseSize, bigRadius, curve, edgeDrawn, edgeStroke, isValueMeasure, nodeFill, rHalf, rNode, sizeValue, wEdge,
  type ColorBy, type ColourContext, type Layout, type Scale, type SizeBy,
} from './scales';
import type { Meta, NetEdge, NetNode, Snap } from './types';
import { nodeIndex } from './util';

/** The controls of a network view, as NetView and the React wrappers take them. Economies by ISO3. */
export interface ViewConfig {
  layout: Layout;
  sizeBy: SizeBy;
  scale: Scale;
  /** Fixed scale: the largest world trade of the series (USD), so sizes compare across periods. */
  ref: number | null;
  colorBy: ColorBy;
  /** Flows per economy (1–10) and the share floor (fraction of world trade). */
  k: number;
  min: number;
  /** Labels: the N largest economies (0, 10, 25, 50, or a large number for all). */
  labels: number;
  focus: string | null;
  /** "CHN>USA" */
  flow: string | null;
  /** Grouping colours (region, bloc, club, custom), resolved for the period: groups.ts resolveColouring. */
  groups: GroupColouring | null;
  /** Economies drawn with a dashed outline (an event's economies). */
  outline: string[];
  /** Change colouring: the base snapshot compared against. */
  base: BaseCompare | null;
  /** Stage colouring: ISO3 → the rung of the chain's ladder the economy leads (chains.ts stageLeaders). */
  stageOf: Record<string, number> | null;
  /** Stage colouring: the ladder's length (chain.levels.length), so the ramp spreads over the whole chain. */
  stageCount: number | null;
}

export const DEFAULT_CONFIG: ViewConfig = {
  layout: 'map', sizeBy: 'total', scale: 'fixed', ref: null, colorBy: 'region', k: 2, min: 0.0002, labels: 25,
  focus: null, flow: null, groups: null, outline: [], base: null, stageOf: null, stageCount: null,
};

export interface SceneNode {
  i: number;
  id: string;
  n: NetNode;
  /** Radius: of the circle, or of the larger half of a split node (placement, flow ends, hit area). */
  r: number;
  /** Split nodes: the radius of the exports half (right) and of the imports half (left); null otherwise. */
  rx: number | null;
  rm: number | null;
  /** Fill token, or null for a hollow node (did not report, in reporting colouring). A split node is filled with
   *  the export and import colours and draws this token as its ring. */
  fill: string | null;
  /** Radius of the base-period size (change colouring), or null. */
  baseR: number | null;
  choke: boolean;
  outline: boolean;
  selected: boolean;
}

export interface SceneEdge {
  e: NetEdge;
  key: string;
  width: number;
  stroke: string;
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  /** Flows of the base backbone that the current snapshot no longer holds (change colouring). */
  ghosts: { key: string; s: number; t: number; width: number }[];
  /** Label candidates in priority order (focus first, then by size). */
  labelled: number[];
  /** Node indices of the economies that take Tab focus: the 25 largest, in rank order. */
  tabbable: number[];
  colour: ColourContext;
  edgeRef: number;
  focusIndex: number | null;
}

const NODE_MIN_SPLIT = 1.5;

/** The value a node of radius `big` stands for: with the fixed scale, a quarter of the series' largest world
 *  trade for total trade and split nodes (an economy's two sides together), 15% for exports or imports alone;
 *  else the largest value of the period. */
export function sizeRef(sizeBy: SizeBy, scale: Scale, seriesMax: number | null, periodMax: number): number {
  const fixed = isValueMeasure(sizeBy) && scale === 'fixed' && seriesMax ? seriesMax * (sizeBy === 'total' || sizeBy === 'split' ? 0.25 : 0.15) : null;
  return fixed ?? (periodMax || 1);
}

/** Builds the scene. `W` is the drawing width (it sets the largest radius); `slots` persists community colours.
 *  `fitArea` (the map layout's box, px²): when the circles would crowd it (maplayout.ts MAX_FILL), every radius
 *  shrinks by the same factor, so the map can place them without overlaps. */
export function buildScene(meta: Meta, snap: Snap, cfg: ViewConfig, W: number, slots: Map<number, number>, fitArea?: number): Scene {
  const focusIndex = nodeIndex(meta, cfg.focus);
  const toSet = (ids: string[]) => new Set(ids.map((x) => nodeIndex(meta, x)).filter((x): x is number => x != null));
  const groupOf = new Map<number, string>();
  for (const [iso, k] of Object.entries(cfg.groups?.groupOf ?? {})) {
    const i = nodeIndex(meta, iso);
    if (i != null) groupOf.set(i, k);
  }
  const stageOf = cfg.stageOf
    ? new Map(Object.entries(cfg.stageOf).map(([iso, st]) => [nodeIndex(meta, iso), st] as const).filter((x): x is [number, number] => x[0] != null))
    : null;
  if (cfg.colorBy === 'community') assignSlots(slots, snap);
  const colour: ColourContext = {
    colorBy: cfg.colorBy, sizeBy: cfg.sizeBy, slots, groupOf, groupColour: cfg.groups?.colours ?? {},
    base: cfg.colorBy === 'change' ? cfg.base : null, stageOf, stageCount: cfg.stageCount ?? 5,
  };

  const shown = snap.edges.filter((e) => edgeDrawn(e, cfg.k, cfg.min, focusIndex));
  const linked = new Set<number>();
  for (const e of shown) { linked.add(e.s); linked.add(e.t); }
  const live = snap.nodes.filter((n) => n.total > 0 && (cfg.layout === 'map' || linked.has(n.i) || n.i === focusIndex));
  const maxSize = Math.max(0, ...live.map((n) => sizeValue(n, cfg.sizeBy))) || 1;
  const big = bigRadius(W);
  const ref = sizeRef(cfg.sizeBy, cfg.scale, cfg.ref, maxSize);
  const outline = toSet(cfg.outline);
  const split = cfg.sizeBy === 'split';

  const nodes: SceneNode[] = live.map((n) => {
    const rx = split ? rHalf(n.exports, ref, big) : null;
    const rm = split ? rHalf(n.imports, ref, big) : null;
    const r = split ? Math.max(rx!, rm!, NODE_MIN_SPLIT) : rNode(sizeValue(n, cfg.sizeBy), ref, big);
    const baseR = colour.base ? (() => { const b = baseSize(n, colour.base!, cfg.sizeBy); return b > 0 ? rNode(b, ref, big) : null; })() : null;
    return {
      i: n.i, id: n.id, n, r, rx, rm, fill: nodeFill(n, snap, colour), baseR,
      choke: n.x > 0.5, outline: outline.has(n.i), selected: n.i === focusIndex,
    };
  });
  // larger circles first, so small ones stay visible on top of them; this is also the Tab order
  if (fitArea) {
    const need = nodes.reduce((sum, d) => sum + (2 * d.r) ** 2, 0);
    const f = need > MAX_FILL * fitArea ? Math.sqrt((MAX_FILL * fitArea) / need) : 1;
    if (f < 1) {
      for (const d of nodes) {
        d.r *= f;
        if (d.rx != null) d.rx *= f;
        if (d.rm != null) d.rm *= f;
        if (d.baseR != null) d.baseR *= f;
      }
    }
  }
  nodes.sort((a, b) => b.r - a.r || b.n.total - a.n.total);
  const placed = new Set(nodes.map((d) => d.i));

  const edgeRef = cfg.scale === 'fixed' && cfg.ref ? cfg.ref : snap.world;
  const edges: SceneEdge[] = shown
    .filter((e) => placed.has(e.s) && placed.has(e.t))
    .sort((a, b) => a.w - b.w)
    .map((e) => ({ e, key: e.key, width: wEdge(e.value, edgeRef), stroke: edgeStroke(e, snap, colour) }));

  const ghosts: Scene['ghosts'] = [];
  if (colour.base) {
    const now = new Set(snap.edges.map((e) => `${e.s}>${e.t}`));
    for (const e of colour.base.snap.edges) {
      if (!edgeDrawn(e, cfg.k, cfg.min, null) || now.has(`${e.s}>${e.t}`)) continue;
      if (!placed.has(e.s) || !placed.has(e.t)) continue;
      ghosts.push({ key: `${e.s}>${e.t}`, s: e.s, t: e.t, width: wEdge(e.value, edgeRef) });
    }
  }

  // labels: the N largest by the size measure, plus the focus and its drawn partners
  const bySize = [...nodes].sort((a, b) => sizeValue(b.n, cfg.sizeBy) - sizeValue(a.n, cfg.sizeBy));
  const want = new Set(bySize.slice(0, Math.max(0, cfg.labels)).map((d) => d.i));
  if (focusIndex != null && placed.has(focusIndex)) {
    want.add(focusIndex);
    for (const se of edges) if (se.e.s === focusIndex || se.e.t === focusIndex) { want.add(se.e.s); want.add(se.e.t); }
  }
  const rOf = new Map(nodes.map((d) => [d.i, d.r]));
  const labelled = [...want].sort((a, b) => (b === focusIndex ? 1 : 0) - (a === focusIndex ? 1 : 0)
    || (rOf.get(b) ?? 0) - (rOf.get(a) ?? 0));
  const tabbable = bySize.slice(0, 25).map((d) => d.i);
  return { nodes, edges, ghosts, labelled, tabbable, colour, edgeRef, focusIndex };
}

/** An economy as NetView places it: its anchor (projected centroid) and its position. */
export interface Placed extends SimulationNodeDatum { i: number; r: number; ax: number; ay: number; x: number; y: number }

/** Approximate width of a map label in px (Fira Sans Condensed / Pretendard). */
export function labelWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[ㄱ-힣]/.test(ch) ? 0.92 : /[A-Z]/.test(ch) ? 0.56 : 0.47;
  return w * size + 2;
}

export interface LabelBox { i: number; x: number; y: number; anchor: 'start' | 'end' | 'middle'; text: string; strong: boolean }

/** Greedy declutter from the focus and the largest node down: a label that would overlap a placed label or a larger
 *  circle is dropped, never nudged away from its node. Placed right of the node at r + 4, left near the right edge;
 *  with `around` (the map), it may also go left of, above or below the node, the first of those that is free. */
export function declutter(
  order: number[], at: Map<number, { x: number; y: number; r: number }>, text: (i: number) => string,
  W: number, focus: number | null, strongSet: Set<number>, around = false,
): LabelBox[] {
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const circles = [...at.entries()].map(([i, p]) => ({ i, ...p }));
  const out: LabelBox[] = [];
  for (const i of order) {
    const p = at.get(i);
    if (!p) continue;
    const strong = strongSet.has(i);
    const size = strong ? 13 : 12;
    const t = text(i);
    const w = labelWidth(t, size), h = size + 2;
    const right = p.x + p.r + 4 + w <= W - 4;
    const side = (r: boolean): LabelBox => {
      const x0 = r ? p.x + p.r + 4 : p.x - p.r - 4 - w;
      return { i, x: r ? x0 : x0 + w, y: p.y, anchor: r ? 'start' : 'end', text: t, strong };
    };
    const tries: LabelBox[] = [side(right)];
    if (around) {
      if (right && p.x - p.r - 4 - w >= 4) tries.push(side(false));
      tries.push({ i, x: p.x, y: p.y - p.r - 3 - h / 2, anchor: 'middle', text: t, strong });
      tries.push({ i, x: p.x, y: p.y + p.r + 3 + h / 2, anchor: 'middle', text: t, strong });
    }
    const boxOf = (l: LabelBox) => {
      const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
      return { x0, y0: l.y - h / 2, x1: x0 + w, y1: l.y + h / 2 };
    };
    const free = (b: { x0: number; y0: number; x1: number; y1: number }) =>
      !boxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)
      && !circles.some((c) => c.i !== i && c.r > p.r && rectCircle(b, c.x, c.y, c.r));
    const pick = tries.find((l) => free(boxOf(l))) ?? (i === focus ? tries[0] : null);
    if (!pick) continue;
    boxes.push(boxOf(pick));
    out.push(pick);
  }
  return out;
}

function rectCircle(b: { x0: number; y0: number; x1: number; y1: number }, cx: number, cy: number, r: number): boolean {
  const nx = Math.max(b.x0, Math.min(cx, b.x1)), ny = Math.max(b.y0, Math.min(cy, b.y1));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r * 0.81;
}

/** The first view, rendered on the server: the same scene on a fixed canvas, as plain shapes. */
export interface StaticMap {
  width: number;
  height: number;
  /** The ground: a tint per region (discs [x, y, r] in the region's colour token) and the regions' names. */
  regions: { g: string; colour: string; discs: [number, number, number][] }[];
  names: RegionName[];
  nodes: { id: string; x: number; y: number; r: number; rx: number | null; rm: number | null; fill: string | null; choke: boolean }[];
  edges: { key: string; d: string; width: number; stroke: string }[];
  labels: LabelBox[];
}

export function staticScene(meta: Meta, snap: Snap, cfg: ViewConfig, world: World, box: Box & { width: number; height: number },
  lang: Lang, maxEdges = 200): StaticMap {
  const proj = fitProjection(world, box);
  const scene = buildScene(meta, snap, cfg, box.width, new Map(), (box.x1 - box.x0) * (box.y1 - box.y0));
  const spots = stretchedSpots(meta.nodes.map((_, k) => { const [x, y] = anchorOf(meta, k, proj, box); return { k, x, y }; }), box);
  const items = scene.nodes.map((d) => ({ i: d.i, r: d.r, x: 0, y: 0 }));
  layoutMap(items, (i) => spots.get(i) ?? [box.x0 + 30, box.y1 - 30], box);
  const at = new Map(items.map((p) => [p.i, { x: p.x, y: p.y, r: p.r }]));
  const strong = new Set(scene.nodes.slice(0, 5).map((d) => d.i));
  const labels = declutter(scene.labelled, at, (i) => meta.nodes[i]?.[lang] || meta.nodes[i]?.id || '', box.width, scene.focusIndex, strong, true);
  const regional = items.map((p) => ({ x: p.x, y: p.y, r: p.r, g: regionOf(meta, p.i) }));
  const taken = labels.map((b) => {
    const size = b.strong ? 13 : 12, w = labelWidth(b.text, size);
    const x0 = b.anchor === 'start' ? b.x : b.anchor === 'end' ? b.x - w : b.x - w / 2;
    return { x0, y0: b.y - size / 2 - 1, x1: x0 + w, y1: b.y + size / 2 + 1 };
  });
  const q = (v: number) => Math.round(v * 10) / 10;
  return {
    width: box.width, height: box.height,
    regions: regionTints(regional).map((t) => ({ g: t.g, colour: REGIONS[t.g].colour, discs: t.discs.map((d) => [q(d.x), q(d.y), q(d.r)] as [number, number, number]) })),
    names: placeRegionNames(regional, taken, box, (g) => REGIONS[g]?.[lang] ?? g,
      flowPoints(scene.edges.slice(-maxEdges).map((se) => ({ a: at.get(se.e.s)!, b: at.get(se.e.t)! })))),
    nodes: scene.nodes.map((d) => {
      const p = at.get(d.i)!;
      const q = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
      return { id: d.id, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(p.r * 10) / 10, rx: q(d.rx), rm: q(d.rm), fill: d.fill, choke: d.choke };
    }),
    // the largest flows only (the first view is a placeholder for the live one); thin under thick
    edges: scene.edges.slice(-maxEdges).map((se) => ({
      key: se.key, width: Math.round(se.width * 10) / 10, stroke: se.stroke,
      d: curve(at.get(se.e.s)!, at.get(se.e.t)!).replace(/\.\d/g, ''),
    })),
    labels,
  };
}
