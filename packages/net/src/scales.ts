// The encodings of the Network maps section (design book 02): node radius (area ∝ value), flow width, the curve
// that bends to the right of travel, the change and concentration bins, and the colour of a node or flow in each
// colour mode. Colours are token names ("viz-1"); views write them as var(--token).
import type { BaseCompare, Growth } from './decode';
import { growth } from './decode';
import type { NetEdge, NetNode, Snap } from './types';

/** split: each economy as two half-discs on one scale, imports on the left and exports on the right. */
export type SizeBy = 'split' | 'total' | 'exports' | 'imports' | 'pagerank' | 'betweenness' | 'degree';
/** region, bloc, club, custom: predefined groupings (groups.ts); community: Louvain communities (the explorer's
 *  advanced option). */
export type ColorBy = 'region' | 'bloc' | 'club' | 'custom' | 'community' | 'change' | 'concentration' | 'reporting' | 'stage';

/** Whether a colour mode colours by a grouping (GroupColouring). */
export function isGrouping(c: ColorBy): c is 'region' | 'bloc' | 'club' | 'custom' {
  return c === 'region' || c === 'bloc' || c === 'club' || c === 'custom';
}
export type Layout = 'map' | 'force';
export type Scale = 'fixed' | 'period';

export const NODE_MIN = 2;
export const NODE_MAX = 34;
export const EDGE_MIN = 0.5;
export const EDGE_MAX = 14;

/** The largest radius for this width: clamp(W / 40, 16, 34). */
export function bigRadius(W: number): number {
  return Math.max(16, Math.min(NODE_MAX, W / 40));
}

/** Radius from a value and its reference: area ∝ value, floor 2px, ceiling 34px. */
export function rNode(v: number, ref: number, big: number): number {
  if (!(ref > 0) || !(v > 0)) return NODE_MIN;
  return Math.max(NODE_MIN, Math.min(NODE_MAX, big * Math.sqrt(v / ref)));
}

/** Radius of one half-disc of a split node: a half-disc of radius big·√(2v / ref) has the area a full circle of
 *  value v has under rNode, so the two halves together have the area of the economy's total trade. 0 for no value,
 *  else at least 1.5px; ceiling 34px × √2. */
export function rHalf(v: number, ref: number, big: number): number {
  if (!(ref > 0) || !(v > 0)) return 0;
  return Math.max(1.5, Math.min(NODE_MAX * Math.SQRT2, big * Math.sqrt((2 * v) / ref)));
}

/** The SVG path of a half-disc centred on 0,0: the left half (imports) or the right half (exports). */
export function halfDisc(r: number, side: 'left' | 'right'): string {
  const q = Math.round(r * 10) / 10;
  if (!(q > 0)) return 'M0,0';
  return side === 'left' ? `M0,${-q}A${q},${q} 0 0 0 0,${q}Z` : `M0,${-q}A${q},${q} 0 0 1 0,${q}Z`;
}

/** Flow width: clamp(9 × √(w / (0.03 × ref)), 0.5, 14), w and ref in USD. */
export function wEdge(value: number, ref: number): number {
  if (!(ref > 0)) return EDGE_MIN;
  return Math.max(EDGE_MIN, Math.min(EDGE_MAX, 9 * Math.sqrt(Math.max(0, value) / (0.03 * ref))));
}

export interface Pt { x: number; y: number; r?: number }

/** Exporter → importer as a quadratic curve bending to its right (control point 18% of the chord off the middle),
 *  trimmed to the two circles so the arrowhead meets the importer's edge. */
export function curve(a: Pt, b: Pt): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const ra = a.r ?? 0, rb = (b.r ?? 0) + 1.5;
  const x1 = a.x + ux * ra, y1 = a.y + uy * ra;
  const x2 = b.x - ux * rb, y2 = b.y - uy * rb;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const ddx = x2 - x1, ddy = y2 - y1;
  // to the right of travel in screen coordinates (y down): rotate the chord by +90°
  const cx = mx - 0.18 * ddy, cy = my + 0.18 * ddx;
  return `M${r1(x1)},${r1(y1)}Q${r1(cx)},${r1(cy)} ${r1(x2)},${r1(y2)}`;
}
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The size measure of a node. */
export function sizeValue(n: NetNode, by: SizeBy): number {
  switch (by) {
    case 'exports': return n.exports;
    case 'imports': return n.imports;
    case 'pagerank': return n.pv ?? 0;
    case 'betweenness': return n.bt ?? 0;
    case 'degree': return n.outDeg + n.inDeg;
    default: return n.total;   // total, split
  }
}

/** Whether a size measure is a value in USD (fixed scale applies to these only). */
export function isValueMeasure(by: SizeBy): boolean {
  return by === 'total' || by === 'split' || by === 'exports' || by === 'imports';
}

/** The seven change steps (% change, t vs base): fell by half or more … doubled or more; ±10% is the midpoint. */
export const CHANGE_CUTS = [-0.5, -0.25, -0.1, 0.1, 1 / 3, 1];
export const CHANGE_TOKENS = ['div-neg-3', 'div-neg-2', 'div-neg-1', 'div-mid', 'div-pos-1', 'div-pos-2', 'div-pos-3'];

export function changeToken(gr: Growth): string | null {
  if (gr.kind === 'new') return 'div-pos-3';
  if (gr.g == null) return null;
  const i = CHANGE_CUTS.findIndex((c) => gr.g! < c);
  return CHANGE_TOKENS[i < 0 ? 6 : i];
}

/** Supplier HHI bins (cut-offs 0.10, 0.18, 0.25, 0.50) on seq-300 … seq-700. */
export const HHI_CUTS = [0.1, 0.18, 0.25, 0.5];
export const HHI_TOKENS = ['seq-300', 'seq-400', 'seq-500', 'seq-600', 'seq-700'];

export function hhiToken(h: number | null): string | null {
  if (h == null) return null;
  const i = HHI_CUTS.findIndex((c) => h < c);
  return HHI_TOKENS[i < 0 ? 4 : i];
}

export const GROUP_TOKENS = ['viz-1', 'viz-2', 'viz-3'];

/** The colour token of rung `k` of a chain's ladder of `n` rungs (chains.yaml `levels`). Ladders of five rungs or
 *  fewer take the five hand-tuned stage tokens, spread over the ramp (a four-rung ladder: stage-1, 2, 4, 5); longer
 *  ladders take the steps design/larch.css derives from stage-1 and stage-5 (`stage-3-of-8`). Always drawn with the
 *  S-number beside it, as the design book asks. */
export function stageToken(k: number, n: number): string {
  if (n <= 5) return `stage-${n <= 1 ? 1 : 1 + Math.round(((k - 1) * 4) / (n - 1))}`;
  return `stage-${k}-of-${n}`;
}

/** var(--token) of a rung's colour, for inline styles. */
export function stageVar(k: number, n: number): string {
  return `var(--${stageToken(k, n)})`;
}

/** What decides a node's and a flow's colour, besides the snapshot. */
export interface ColourContext {
  colorBy: ColorBy;
  sizeBy: SizeBy;
  /** Community anchor (node index) → colour slot 0–2. */
  slots: Map<number, number>;
  /** Grouping colours: node index → group key, and group key → colour token. */
  groupOf: Map<number, string>;
  groupColour: Record<string, string>;
  base: BaseCompare | null;
  /** Node index → the rung of the chain's ladder the economy leads (stage colouring). */
  stageOf: Map<number, number> | null;
  /** The ladder's length (the number of rungs of the chain); the ramp spreads over it. */
  stageCount: number;
}

/** The base value of a node's size measure. */
export function baseSize(n: NetNode, base: BaseCompare, by: SizeBy): number {
  const b = base.node(n.i);
  return b ? sizeValue(b, by) : 0;
}

export function nodeGrowth(n: NetNode, cx: ColourContext): Growth | null {
  if (!cx.base) return null;
  return growth(sizeValue(n, cx.sizeBy), baseSize(n, cx.base, cx.sizeBy));
}

export function edgeGrowth(e: NetEdge, cx: ColourContext): Growth | null {
  if (!cx.base) return null;
  return growth(e.value, cx.base.edge(e));
}

/** Fill token of a node (null: hollow, drawn with a node-coloured ring only). */
export function nodeFill(n: NetNode, snap: Snap, cx: ColourContext): string | null {
  switch (cx.colorBy) {
    case 'community': {
      const c = snap.comm[n.c];
      const slot = c ? cx.slots.get(c.anchor) : undefined;
      return slot != null ? GROUP_TOKENS[slot] : 'viz-context';
    }
    case 'region': case 'bloc': case 'club': case 'custom': {
      const k = cx.groupOf.get(n.i);
      return (k && cx.groupColour[k]) || 'viz-context';
    }
    case 'change': {
      const g = nodeGrowth(n, cx);
      return (g && changeToken(g)) ?? 'div-mid';
    }
    case 'concentration':
      return hhiToken(n.hhiSup) ?? 'viz-context';
    case 'reporting':
      return n.reported ? 'node' : null;
    case 'stage': {
      const st = cx.stageOf?.get(n.i);
      return st ? stageToken(st, cx.stageCount) : 'viz-context';
    }
    default:
      return 'node';
  }
}

/** Stroke token of a flow (before focus and selection). */
export function edgeStroke(e: NetEdge, snap: Snap, cx: ColourContext): string {
  switch (cx.colorBy) {
    case 'community': {
      const a = snap.byIndex.get(e.s), b = snap.byIndex.get(e.t);
      if (!a || !b || a.c < 0 || a.c !== b.c) return 'edge';
      const c = snap.comm[a.c];
      const slot = c ? cx.slots.get(c.anchor) : undefined;
      return slot != null ? GROUP_TOKENS[slot] : 'edge';
    }
    case 'region': case 'bloc': case 'club': case 'custom': {
      // inside one group: the group's colour; between groups or outside them: grey
      const a = cx.groupOf.get(e.s), b = cx.groupOf.get(e.t);
      return (a && a === b && cx.groupColour[a]) || 'edge';
    }
    case 'change': {
      const g = edgeGrowth(e, cx);
      return (g && changeToken(g)) ?? 'edge';
    }
    default:
      return 'edge';
  }
}

/** Community anchors → colour slots 0–2, kept while the product stays the same, so a community keeps its
 *  colour as the years play (the largest three communities of each period take the free slots). */
export function assignSlots(slots: Map<number, number>, snap: Snap): void {
  const present = new Set(snap.comm.slice(0, 3).map((c) => c.anchor));
  // a slot whose community is no longer among the three largest is freed
  for (const [a] of slots) if (!present.has(a)) slots.delete(a);
  for (const c of snap.comm.slice(0, 3)) {
    if (slots.has(c.anchor)) continue;
    const used = new Set(slots.values());
    const free = [0, 1, 2].find((x) => !used.has(x));
    if (free != null) slots.set(c.anchor, free);
  }
}

/** The backbone rule: among the exporter's top k destinations or the importer's top k suppliers, and at least
 *  `min` of world trade. With a focus economy, also its top 10 destinations and top 10 suppliers. */
export function edgeDrawn(e: NetEdge, k: number, min: number, focus: number | null): boolean {
  if (focus != null && ((e.s === focus && e.ro <= 10) || (e.t === focus && e.ri <= 10))) return true;
  return (e.ro <= k || e.ri <= k) && e.w >= min;
}
