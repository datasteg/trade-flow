// Decoding the compact snapshot rows (DATA.md, "Derived records"): values are share × world; a flow's two
// reports come from the mirror ratio mr and src; change against a base snapshot, with an upper bound for flows the
// base did not keep.
import { gapFromRatio, grubelLloyd, reportsDisagree } from './twoway';
import type {
  Community, EstCode, Freq, Lens, Meta, NetEdge, NetNode, RawCommunity, RawSeries, RawSnapCore, Rule, SeriesRow, Snap,
  WindowLen,
} from './types';

/** The column positions of `cols`, by name (−1 when absent). */
function columns(cols: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  cols.forEach((c, i) => { out[c] = i; });
  return out;
}

/** The CIF/FOB factor (IMF DOTS) on an exporter's report standing in for the importer's: meta.windows.cif_fob. */
export const CIF_FOB = 1.06;

const num = (v: number | null | undefined): number => (v == null || !Number.isFinite(v) ? 0 : v);

/** Ranks of `values` (1 = largest), ties broken by order. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const r = new Array<number>(values.length);
  order.forEach(([, i], k) => { r[i] = k + 1; });
  return r;
}

export interface DecodeContext {
  meta: Meta;
  product: string;
  freq: Freq;
  lens: Lens | null;
  rule: Rule;
  ncols: string[];
  ecols: string[];
  /** Monthly explorer: the window length (snap/W files). */
  wlen?: WindowLen | null;
}

/** One stored period → the decoded snapshot. */
export function decodeSnap(raw: RawSnapCore, ctx: DecodeContext): Snap {
  const nc = columns(ctx.ncols);
  const ec = columns(ctx.ecols);
  const world = raw.world || 0;
  const has = (k: string) => nc[k] !== undefined;
  const full = has('pv') && has('c');
  const opt = (r: (number | null)[], k: string): number | null => (has(k) ? ((r[nc[k]] as number | null) ?? null) : null);
  const nodes: NetNode[] = raw.nodes.map((r) => {
    const i = r[nc.i] as number;
    const x = num(r[nc.x]);
    const m = num(r[nc.m]);
    return {
      i,
      id: ctx.meta.nodes[i]?.id ?? String(i),
      x, m,
      exports: x * world,
      imports: m * world,
      total: (x + m) * world,
      share: (x + m) / 2,
      outDeg: num(r[nc.od]),
      inDeg: num(r[nc.id]),
      hhiSup: (r[nc.hs] as number | null) ?? null,
      hhiMkt: (r[nc.hm] as number | null) ?? null,
      topSup: (r[nc.ts] as number | null) ?? -1,
      topSupShare: (r[nc.tss] as number | null) ?? null,
      reported: r[nc.r] === 1,
      d10: num(r[nc.d10]),
      s10: num(r[nc.s10]),
      pv: full ? ((r[nc.pv] as number | null) ?? null) : null,
      pb: full ? ((r[nc.pb] as number | null) ?? null) : null,
      bt: full ? ((r[nc.bt] as number | null) ?? null) : null,
      c: full ? ((r[nc.c] as number | null) ?? -1) : -1,
      // exports as partners record them (CIF), imports as the economy records them: the label says so (strings.net)
      net: (x - m) * world,
      gl: grubelLloyd(x, m),
      ux: opt(r, 'ux'),
      um: opt(r, 'um'),
      est: has('est') ? ((r[nc.est] as EstCode | null) ?? 0) : null,
      ky: opt(r, 'ky'),
      nes: !!ctx.meta.nodes[i]?.nes,
      rankTotal: 0, rankExports: 0, rankImports: 0,
    };
  });
  // Asia, n.e.s. (nes) ranks as any partner does: it is a node of the network, not an economy page
  const rt = ranks(nodes.map((n) => n.total));
  const rx = ranks(nodes.map((n) => n.exports));
  const rm = ranks(nodes.map((n) => n.imports));
  nodes.forEach((n, k) => { n.rankTotal = rt[k]; n.rankExports = rx[k]; n.rankImports = rm[k]; });

  // the factor on an exporter's report that stands in for the importer's: annual mirror rule
  // and the monthly windows' partner-only flows; 1 for the annual importer and exporter views
  const cif = ctx.freq === 'M' || ctx.rule === 'mirror' ? (ctx.meta.windows?.cif_fob ?? CIF_FOB) : 1;
  const edges: NetEdge[] = raw.edges.map((r) => {
    const s = r[ec.s] as number;
    const t = r[ec.t] as number;
    const w = num(r[ec.w]);
    const mr = (r[ec.mr] as number | null) ?? null;
    const src = (r[ec.src] === 1 ? 1 : 0) as 0 | 1;
    const value = w * world;
    const est = ec.est !== undefined ? ((r[ec.est] as EstCode | null) ?? 0) : null;
    // src 1: drawn = importer's report, vx = vm / mr; src 0: drawn = exporter's report times the CIF/FOB factor
    // (annual mirror rule), vm = vx × mr. An estimate (monthly explorer) is neither side's report; partner-only is the
    // exporter's report times the same factor.
    const vm = est ? null : src === 1 ? value : mr != null ? (value / cif) * mr : null;
    const vx = est ? (est === 3 && src === 0 ? value / cif : null) : src === 0 ? value / cif : mr != null && mr > 0 ? value / mr : null;
    const si = ctx.meta.nodes[s]?.id ?? String(s);
    const ti = ctx.meta.nodes[t]?.id ?? String(t);
    const asym = gapFromRatio(mr);
    const uv = ec.uv !== undefined ? ((r[ec.uv] as number | null) ?? null) : null;
    const dv = (ec.dv !== undefined ? (r[ec.dv] as number | null) ?? 0 : 0) as 0 | 1 | 2;
    const ky = ec.ky !== undefined ? ((r[ec.ky] as number | null) ?? null) : null;
    return { s, t, key: `${si}>${ti}`, w, value, ro: num(r[ec.ro]), ri: num(r[ec.ri]), mr, src, vm, vx, asym, disagree: reportsDisagree(asym, w), uv, est, ky, dv };
  });

  const comm: Community[] = (raw.comm ?? []).map((c: RawCommunity) => ({ anchor: c[0], size: c[1], share: c[2] }));
  return {
    product: ctx.product, freq: ctx.freq, lens: ctx.lens, rule: ctx.rule,
    t: raw.t, win: raw.win ?? null, world, tot: raw.tot, comm, nodes, edges,
    byIndex: new Map(nodes.map((n) => [n.i, n])),
    full,
    wlen: ctx.wlen ?? null,
  };
}

/** Upper bound of a flow absent from a snapshot, as a share of world: min(d10[s], s10[t], 0.0005). A flow the
 *  snapshot did not keep ranked below 10th on both sides and was under 0.05% of world trade. 0 when either end
 *  is missing (the flow did not exist) or had fewer than ten partners (all its flows were kept). */
export function absentBound(snap: Snap, s: number, t: number): number {
  const a = snap.byIndex.get(s);
  const b = snap.byIndex.get(t);
  if (!a || !b) return 0;
  // The monthly explorer leaves out a flow with a month at zero in the window, whatever its size: no bound.
  if (snap.wlen != null) return Number.POSITIVE_INFINITY;
  const bound = Math.min(a.d10, b.s10, 0.0005);
  // Monthly files keep only the largest 1,500 / 600 / 300 flows: a backbone candidate cut by that cap was at most
  // the smallest flow kept.
  if (snap.freq === 'M' && CAPS.has(snap.edges.length)) return Math.max(bound, snap.edges[snap.edges.length - 1]?.w ?? 0);
  return bound;
}
const CAPS = new Set([300, 600, 1500]);

/** A flow's value in the base period: exact when the base kept it, else an upper bound (USD). */
export interface BaseValue {
  value: number;
  exact: boolean;
}

/** Change against a base snapshot. */
export interface BaseCompare {
  snap: Snap;
  t: number;
  /** The flow's base value (USD), exact or an upper bound. */
  edge(e: { s: number; t: number }): BaseValue;
  /** The base snapshot's node, or null when the economy did not trade the product then. */
  node(i: number): NetNode | null;
}

export function compareBase(base: Snap): BaseCompare {
  const byKey = new Map<string, NetEdge>();
  for (const e of base.edges) byKey.set(`${e.s}>${e.t}`, e);
  return {
    snap: base,
    t: base.t,
    edge: (e) => {
      const b = byKey.get(`${e.s}>${e.t}`);
      if (b) return { value: b.value, exact: true };
      return { value: absentBound(base, e.s, e.t) * base.world, exact: false };
    },
    node: (i) => base.byIndex.get(i) ?? null,
  };
}

/** Growth now against a base value. `kind` "new" when the base was zero; "atLeast" when the base is only an
 *  upper bound and the growth a lower bound above +10%; "unknown" when the bound says nothing. */
export interface Growth {
  kind: 'value' | 'new' | 'atLeast' | 'unknown';
  g: number | null;
}

export function growth(now: number, base: BaseValue | number): Growth {
  const b = typeof base === 'number' ? { value: base, exact: true } : base;
  if (b.value <= 0) return now > 0 ? { kind: 'new', g: null } : { kind: 'unknown', g: null };
  const g = now / b.value - 1;
  if (b.exact) return { kind: 'value', g };
  return g > 0.1 ? { kind: 'atLeast', g } : { kind: 'unknown', g: null };
}

/** Series rows by name, for one rule (annual), lens (monthly) or window length (monthly explorer, "3" "6" "12"). */
export function decodeSeries(raw: RawSeries, key: Rule | Lens | string): SeriesRow[] {
  const c = columns(raw.cols);
  const rows = raw.rows[key] ?? [];
  return rows.map((r) => ({
    t: r[c.t] as number,
    world: num(r[c.world]),
    edges: num(r[c.edges]),
    nodes: num(r[c.nodes]),
    reporters: num(r[c.reporters]),
    imp_rep: (r[c.imp_rep] as number | null) ?? null,
    hhi: (r[c.hhi] as number | null) ?? null,
    top1: (r[c.top1] as number | null) ?? null,
    top1_id: (r[c.top1_id] as number | null) ?? null,
    top5: (r[c.top5] as number | null) ?? null,
    hhi_sup: (r[c.hhi_sup] as number | null) ?? null,
    exporters: num(r[c.exporters]),
    est: c.est !== undefined ? ((r[c.est] as number | null) ?? null) : undefined,
    dv: c.dv !== undefined ? ((r[c.dv] as number | null) ?? null) : undefined,
    cmp: c.cmp !== undefined ? ((r[c.cmp] as number | null) ?? null) : undefined,
  }));
}

/** Momentum (lens M): world[t] / world[t − 12] − 1, null where the earlier month is missing. */
export function momentum(rows: SeriesRow[]): (number | null)[] {
  const by = new Map(rows.map((r) => [r.t, r.world]));
  return rows.map((r) => {
    const y = Math.floor(r.t / 100) - 1;
    const prev = by.get(y * 100 + (r.t % 100));
    return prev ? r.world / prev - 1 : null;
  });
}
