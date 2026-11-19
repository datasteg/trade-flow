// The scenario engine, deliberately simple: first-round arithmetic on trade shares, not a forecast.
//   exposure of importer i = Σ over shocked suppliers s of (i's import share from s) × cut
//   the gap is filled first by the suppliers i already buys from, in proportion to their shares
//   the shortfall passes one stage down: exporter j of the next stage loses (j's share of that stage's world
//   exports) × (j's exposure upstream) × (the use share, when the stage feeds several chains; a stage that feeds only
//   this chain has none, and the whole shortfall passes: an upper bound)
//   a closed bloc (a supplier of several economies): its own members are left out as importers, as suppliers that
//   could fill the gap and as exporters one stage down, since their trade with one another is inside the closure
// No stocks, no new suppliers, no prices. Tables come from scenario_data (build_stories.py Measure.scenario): each
// large importer's suppliers (the twelve largest, at least 0.5% each) and the 25 largest exporters.
import type { ScenarioTable } from './types';

/** The suppliers outside an importer's twelve largest, taken together (node index −1). */
export const SMALLER = -1;

export interface Fill {
  i: number;
  /** Its share of the importer's imports now. */
  share: number;
  /** The part of the gap it would take, in proportion (share of the importer's imports). */
  take: number;
}

export interface ImporterResult {
  i: number;
  /** Share of world imports of the product. */
  world: number;
  /** Share of its imports from the shocked suppliers. */
  fromShocked: number;
  /** Share of its imports at risk: fromShocked × cut. */
  risk: number;
  /** The same gap as a share of world imports of the product. */
  worldGap: number;
  /** Combined share of the suppliers it already buys from that are not shocked (with the smaller ones). */
  others: number;
  /** How much more those suppliers would have to ship to close the gap (risk / others), or null when none. */
  need: number | null;
  fill: Fill[];
  filed: boolean;
}

export interface RunOptions {
  /** Only these importers (EU members for Russian pipeline gas; the tariff's importer). */
  only?: number[] | null;
  /** Importers left out (the economies on a closed route). */
  exclude?: number[] | null;
}

export function runCut(table: ScenarioTable, shocked: number[], cut: number, o: RunOptions = {}): ImporterResult[] {
  const S = new Set(shocked);
  const only = o.only ? new Set(o.only) : null;
  const ex = new Set(o.exclude ?? []);
  return table.importers
    .filter((imp) => (!only || only.has(imp.i)) && !ex.has(imp.i))
    .map((imp) => {
      const listed = imp.suppliers.reduce((a, [, s]) => a + s, 0);
      const fromShocked = imp.suppliers.filter(([k]) => S.has(k)).reduce((a, [, s]) => a + s, 0);
      const risk = fromShocked * cut;
      const rest: [number, number][] = imp.suppliers.filter(([k]) => !S.has(k));
      const smaller = Math.max(0, 1 - listed);
      if (smaller > 0.0005) rest.push([SMALLER, smaller]);
      const others = rest.reduce((a, [, s]) => a + s, 0);
      return {
        i: imp.i, world: imp.share, fromShocked, risk, worldGap: risk * imp.share, others,
        need: others > 0 ? risk / others : null,
        fill: rest.map(([k, s]) => ({ i: k, share: s, take: others > 0 ? (risk * s) / others : 0 })),
        filed: imp.filed,
      };
    });
}

/** The importers ranked by the share of their imports at risk, the first `n`, with the focus economy (node index,
 *  −1 for none) always among them. */
export function ranked(rows: ImporterResult[], n: number, focus: number): ImporterResult[] {
  const sorted = [...rows].sort((a, b) => b.risk - a.risk || b.world - a.world);
  const top = sorted.slice(0, n);
  const k = focus >= 0 ? sorted.find((r) => r.i === focus) : undefined;
  if (k && !top.includes(k)) top.push(k);
  return top;
}

/** The shocked suppliers' share of world exports, cut: the share of world trade in the product removed. */
export function worldCut(table: ScenarioTable, shocked: number[], cut: number): number {
  const S = new Set(shocked);
  return table.exporters.filter(([k]) => S.has(k)).reduce((a, [, s]) => a + s, 0) * cut;
}

/** The largest exporters outside the shocked set, by share of world exports. */
export function otherExporters(table: ScenarioTable, shocked: number[], n = 5): [number, number][] {
  const S = new Set(shocked);
  return table.exporters.filter(([k]) => !S.has(k)).slice(0, n);
}

export interface DownRow {
  j: number;
  /** A member of the closed bloc: left out of the total. */
  inside?: boolean;
  /** Share of the next stage's world exports. */
  x: number;
  /** Its exposure upstream (share of its imports of the cut product at risk), or null when it is not in the table. */
  e: number | null;
  /** On the closed route itself: its own exports of the next stage are cut directly. */
  onRoute: boolean;
  /** The next stage's world exports at risk through it. */
  passed: number | null;
}

/** One stage down: each large exporter of the next stage loses its share of world exports × its exposure × the use
 *  share. Exporters on a closed route lose their own exports × cut. */
export function passDown(down: ScenarioTable, exposure: Map<number, number>, use: number, route?: { members: number[]; cut: number } | null,
  bloc?: number[] | null): { rows: DownRow[]; total: number } {
  const R = new Set(route?.members ?? []);
  const B = new Set(bloc ?? []);
  const rows: DownRow[] = down.exporters.map(([j, x]) => {
    if (route && R.has(j)) return { j, x, e: route.cut, onRoute: true, passed: x * route.cut };
    if (B.has(j)) return { j, x, e: null, onRoute: false, inside: true, passed: null };
    const e = exposure.has(j) ? (exposure.get(j) as number) : null;
    return { j, x, e, onRoute: false, passed: e == null ? null : x * e * use };
  });
  rows.sort((a, b) => (b.passed ?? -1) - (a.passed ?? -1));
  return { rows, total: rows.reduce((a, r) => a + (r.passed ?? 0), 0) };
}

/** The rows the one-stage-down table lists: the first `n` with something at risk (or not a large importer), the
 *  focus economy (node index, −1 none) added below when it is further down; and the totals the sentence above the
 *  table states, so the text and the table are summed from the same rows. */
export function downListed(rows: DownRow[], n: number, focus: number): { listed: DownRow[]; listedTotal: number; total: number; count: number } {
  const listed = rows.filter((r) => !r.inside && (r.passed == null || r.passed > 0 || r.j === focus)).slice(0, n);
  const f = rows.find((r) => r.j === focus);
  if (f && !listed.includes(f)) listed.push(f);
  const sum = (xs: DownRow[]) => xs.reduce((a, r) => a + (r.passed ?? 0), 0);
  return { listed, listedTotal: sum(listed), total: sum(rows), count: rows.filter((r) => (r.passed ?? 0) > 0).length };
}

/** A tariff on one partner, entered as the share of its flow it removes: the importer's suppliers before and after,
 *  supply kept whole by the others in proportion. */
export function tariffShift(r: ImporterResult, table: ScenarioTable, shocked: number[], cut: number): { i: number; now: number; after: number }[] {
  const imp = table.importers.find((x) => x.i === r.i);
  if (!imp) return [];
  const S = new Set(shocked);
  const out = imp.suppliers.filter(([k]) => S.has(k)).map(([k, s]) => ({ i: k, now: s, after: s * (1 - cut) }));
  for (const f of r.fill) out.push({ i: f.i, now: f.share, after: f.share + f.take });
  return out.sort((a, b) => b.now - a.now);
}
