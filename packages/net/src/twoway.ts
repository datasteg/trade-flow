// Two-way trade and the two reports of a flow. An economy both imports and exports a
// stage for ordinary reasons (one code holding different goods, processing and hub trade, firms buying and selling
// for their own reasons, the mirror rule taking one side from each report); these measures state the facts, never
// the cause. The thresholds are the builder's (scripts/build_snapshots.py, TWO_WAY), which flags the two-way traders
// in the chain files; the "reports disagree" marker is computed here from the stored mirror ratio.

/** Two-way trader: Grubel–Lloyd index at least `gl`, and exports and imports each at least `share` of world trade. */
export const TWO_WAY = { gl: 0.3, share: 0.02 } as const;
/** "Reports disagree": the two reports of a flow differ by more than `asym` (of the larger), on a flow of at least
 *  `share` of the product's world trade. Shown in tables and tooltips only, never on the map. */
export const DISAGREE = { asym: 0.5, share: 0.01 } as const;

/** Grubel–Lloyd index 1 − |X − M| / (X + M): 1 when exports equal imports, 0 when one side is zero; null without
 *  trade. */
export function grubelLloyd(x: number, m: number): number | null {
  if (!(x + m > 0)) return null;
  return 1 - Math.abs(x - m) / (x + m);
}

/** Whether an economy is a two-way trader, from its exports and imports as shares of world trade. */
export function isTwoWay(xShare: number, mShare: number): boolean {
  const gl = grubelLloyd(xShare, mShare);
  return gl != null && gl >= TWO_WAY.gl && xShare >= TWO_WAY.share && mShare >= TWO_WAY.share;
}

/** How far a flow's two reports disagree: |importer's − exporter's| / the larger (0 equal, → 1 one far larger); null
 *  unless both sides reported. */
export function reportGap(vx: number | null | undefined, vm: number | null | undefined): number | null {
  if (vx == null || vm == null || !(vx > 0 && vm > 0)) return null;
  return Math.abs(vm - vx) / Math.max(vm, vx);
}

/** The gap from the mirror ratio mr = importer's report ÷ exporter's: |mr − 1| / max(mr, 1). */
export function gapFromRatio(mr: number | null | undefined): number | null {
  if (mr == null || !(mr > 0)) return null;
  return Math.abs(mr - 1) / Math.max(mr, 1);
}

/** Whether a flow gets the "reports disagree" marker: gap above DISAGREE.asym and at least DISAGREE.share of world
 *  trade (`w`, the flow's share). */
export function reportsDisagree(asym: number | null, w: number): boolean {
  return asym != null && asym > DISAGREE.asym && w >= DISAGREE.share;
}
