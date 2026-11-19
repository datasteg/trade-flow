// The network views: one economy's partners and products (the explorers' CountryCard, ?focus=ISO3), one pair's flows
// (the flow card, ?flow=A-B), and one product's world picture (the explorer's overview). Shares, ranks, mirror ratios
// and HHI only (core.ts): the cards draw USD bars, the views give the shares behind them.
import {
  addMonths, gapFromRatio, reportsDisagree, MIN_COMPLETE,
  type FlowsBlock, type Meta, type MetaProduct, type NetEdge, type NetNode, type RawAnnualSnap, type RawFlowsFile,
  type RawNodesFile, type Snap,
} from '@larch/net/core';
import { decodeDataFile, readData, readDataFile } from '@/lib/data';
import {
  badParam, cached, change, econIndex, econRef, enName, envelope, getMeta, monthWords, pageOf, parsePeriod, pct, pctText,
  periodBlock, periodKey, periodWords, productName, productOf, ratio, readOnce, SvcFail, snapAt, sourcesFor, windowMonths,
  ym, type Envelope, type Lang, type Sel,
} from './core';

export const PARTNERS_DEFAULT = 10;
export const PARTNERS_MAX = 25;
const PRODUCTS_TOP = 10;
const CHAPTERS_TOP = 10;
/** The flow card's monthly strip opens on ten years. */
const SERIES_YEARS = 10;

type Direction = 'exports' | 'imports';

export function directionOf(v: string | null): Direction {
  if (v == null || v === 'exports') return 'exports';
  if (v === 'imports') return 'imports';
  throw badParam(`direction must be exports or imports; got "${v}".`);
}

const ESTIMATE = ['reported', 'benchmarked', 'spliced', 'partner-only'];
/** "Korea's", "United States’". */
const poss = (name: string) => (/s$/.test(name) ? `${name}’` : `${name}’s`);

function sourcesOf(meta: Meta, s: Sel) {
  return sourcesFor(meta, s.freq, s.freq === 'M' ? windowMonths(s.t) : null);
}

async function snapOrFail(meta: Meta, p: MetaProduct, s: Sel): Promise<Snap> {
  const snap = await snapAt(meta, p, s);
  if (!snap) throw new Error(`no snapshot ${p.slug} ${periodKey(s)}`);
  return snap;
}

/** How a flow is drawn: the side whose report it is, or the estimate (monthly explorer). */
function drawn(e: NetEdge): { reported_by: 'importer' | 'exporter' | 'estimate'; estimate: string | null } {
  if (e.est) return { reported_by: 'estimate', estimate: ESTIMATE[e.est] ?? String(e.est) };
  return { reported_by: e.src === 1 ? 'importer' : 'exporter', estimate: null };
}
const divergence = (e: NetEdge) => (e.dv === 1 ? 'below the pair’s band' : e.dv === 2 ? 'above the pair’s band' : null);

/** An economy's completeness in a period (the share of its usual trade the period holds), from nodes/<A|W>/<slug>.json,
 *  for the 100 largest economies of the product; null when it is not among them. */
async function completeness(p: MetaProduct, s: Sel, i: number): Promise<number | null> {
  const f = await readData<RawNodesFile>(`nodes/${s.freq === 'M' ? 'W' : 'A'}/${p.slug}.json`).catch(() => null);
  const b = f ? (f[s.freq === 'M' ? '12' : 'A'] as RawNodesFile['A']) : undefined;
  if (!b?.c) return null;
  const k = b.ids.indexOf(i), j = b.t.indexOf(s.t);
  return k >= 0 && j >= 0 ? (b.c[k]?.[j] ?? null) : null;
}

/* products.json: each economy's exports and imports by HS chapter over 12-month windows (DATA.md, the export
 * surface). The file is 17 MB of JSON, about 100 MB parsed, which would take most of the server's 256 MB: each
 * economy asked for is cut out of the decoded text and parsed alone, and only that part is kept. */

type ChapterCell = (number | null)[]; // [x, m, x_est_share, x_est_code, m_est_share, m_est_code] in USD and shares
interface EconChapters { ends: number[]; by: Record<string, Record<string, ChapterCell>> | null }

const chaptersCache = cached<string, EconChapters>(24);

function econChapters(iso: string): Promise<EconChapters> {
  return chaptersCache(iso, async () => {
    const f = await readDataFile('products.json');
    if (!f) return { ends: [], by: null };
    const text = (await decodeDataFile(f)).toString('utf8');
    const em = /"ends":\[([0-9,]*)\]/.exec(text);
    const ends = em ? em[1].split(',').filter(Boolean).map(Number) : [];
    const e0 = text.indexOf('"econ":{');
    const stop = text.indexOf('"check":{', e0);
    const k = e0 < 0 ? -1 : text.indexOf(`"${iso}":{`, e0);
    if (k < 0 || (stop > 0 && k > stop)) return { ends, by: null };
    const open = k + iso.length + 3;
    let depth = 0, end = -1;
    for (let j = open; j < text.length; j++) {
      const c = text.charCodeAt(j);
      if (c === 123) depth++;
      else if (c === 125 && --depth === 0) { end = j; break; }
    }
    return { ends, by: end > 0 ? (JSON.parse(text.slice(open, end + 1)) as EconChapters['by']) : null };
  });
}

interface ProductRow { rank: number; id: string; hs: string; name: string; share_of_economy_pct: number | null; change_on_year_pct: number | null; estimated: string | null }

/** An economy's largest HS chapters on one side over the 12-month window ending in `end`, as shares of its all-goods
 *  window (`total`, USD, from the all-goods snapshot) and changes on the window a year earlier (as global-network's
 *  country sheet: no change below $0.1bn a year earlier; marked estimated when estimates hold ≥ 10% of the value). */
async function topChapters(meta: Meta, iso: string, end: number, dir: Direction, total: number, lang: Lang): Promise<ProductRow[] | null> {
  const ec = await econChapters(iso);
  if (!ec.by || !ec.ends.includes(end) || !(total > 0)) return null;
  const prev = String(addMonths(end, -12));
  const col = dir === 'exports' ? 0 : 1;
  const rows = Object.entries(ec.by).flatMap(([ch, byT]) => {
    const v = byT[String(end)];
    const val = v?.[col] ?? 0;
    if (!v || !(val > 0)) return [];
    const was = byT[prev]?.[col] ?? null;
    const estShare = v[col === 0 ? 2 : 4] ?? 0, estCode = v[col === 0 ? 3 : 5] ?? 0;
    const prod = meta.products.find((x) => x.id === `HS:${ch}`);
    return [{
      ch, val,
      row: {
        rank: 0, id: `HS:${ch}`, hs: ch, name: prod ? productName(prod, lang) : `HS ${ch}`,
        share_of_economy_pct: pct(val / total),
        change_on_year_pct: was != null && was >= 1e8 ? change(val / was - 1) : null,
        estimated: estShare >= 0.1 ? (ESTIMATE[estCode] ?? 'estimated') : null,
      },
    }];
  });
  rows.sort((a, b) => b.val - a.val);
  return rows.slice(0, PRODUCTS_TOP).map((r, k) => ({ ...r.row, rank: k + 1 }));
}

/* An economy ------------------------------------------------------------------------------------------------------------ */

export interface EconomyArgs { iso3: string; period: string | null; product: string | null; direction: string | null; limit: number; lang: Lang }

function sideBlock(meta: Meta, snap: Snap, n: NetNode, lang: Lang) {
  const exporters = snap.nodes.filter((x) => x.x > 0).length;
  const importers = snap.nodes.filter((x) => x.m > 0).length;
  return {
    exports: { share_of_world_pct: pct(n.x), rank: n.x > 0 ? n.rankExports : null, of: exporters, destinations: n.outDeg, market_hhi: ratio(n.hhiMkt) },
    imports: {
      share_of_world_pct: pct(n.m), rank: n.m > 0 ? n.rankImports : null, of: importers, suppliers: n.inDeg, supplier_hhi: ratio(n.hhiSup),
      top_supplier: n.topSup >= 0 ? { ...econRef(meta, n.topSup, lang), share_of_imports_pct: pct(n.topSupShare) } : null,
    },
  };
}

/** The page an economy view mirrors: the monthly explorer for a window, the explorer for a year. */
function economyPage(lang: Lang, iso: string, p: MetaProduct, s: Sel, dflt: Sel) {
  const q = new URLSearchParams({ focus: iso });
  if (p.id !== 'TOTAL') q.set('p', p.id);
  const hash = periodKey(s) !== periodKey(dflt) || s.freq !== dflt.freq ? `#t=${s.t}` : '';
  return pageOf(lang, `/${s.freq === 'M' ? 'explore-monthly' : 'explore'}?${q.toString().replace(/%3A/g, ':')}${hash}`);
}

export async function economyView(a: EconomyArgs): Promise<Envelope> {
  const meta = await getMeta();
  const i = econIndex(meta, a.iso3);
  const iso = meta.nodes[i].id;
  const p = productOf(meta, a.product);
  const s = parsePeriod(meta, p, a.period);
  const dir = directionOf(a.direction);
  const snap = await snapOrFail(meta, p, s);
  const n = snap.byIndex.get(i) ?? null;
  const { sources, notes } = sourcesOf(meta, s);
  const nm = enName(meta, i);
  const pname = p.en;
  const page = economyPage(a.lang, iso, p, s, parsePeriod(meta, p, null));
  const base = {
    economy: econRef(meta, i, a.lang),
    product: { id: p.id, name: productName(p, a.lang), kind: p.kind },
    period: s.freq === 'M' ? { freq: 'M', window_months: 12, from: ym(windowMonths(s.t)[0]), to: ym(s.t) } : { freq: 'A', year: s.t },
    direction: dir,
  };
  if (s.freq === 'A' && s.t > meta.complete.A) notes.push(`${s.t} is partial: fewer than the ten largest traders had filed (the last complete year is ${meta.complete.A}).`);
  if (!n || (n.x <= 0 && n.m <= 0)) {
    return envelope(meta, 'economy', {
      period: periodBlock(meta, s), page, sources, notes,
      summary: `${nm} has no ${pname.toLowerCase()} trade in the trade-flow network for ${periodWords(s)} (UN Comtrade).`,
      data: { ...base, traded: false, partners: [], products: null },
    });
  }
  const c = await completeness(p, s, i);
  if (c != null && c < MIN_COMPLETE) notes.push(`${poss(nm)} records for this period hold ${pctText(c)} of its usual trade (under 90%): partners have not all filed, so its shares are low.`);
  const side = sideBlock(meta, snap, n, a.lang);
  const own = dir === 'exports' ? n.x : n.m;
  const edges = snap.edges.filter((e) => (dir === 'exports' ? e.s === i : e.t === i)).sort((x, y) => y.w - x.w).slice(0, a.limit);
  const partners = edges.map((e) => {
    const j = dir === 'exports' ? e.t : e.s;
    return {
      rank: dir === 'exports' ? e.ro : e.ri,
      ...econRef(meta, j, a.lang),
      share_of_economy_pct: pct(own > 0 ? e.w / own : null),
      share_of_world_pct: pct(e.w),
      economy_rank_at_partner: dir === 'exports' ? e.ri : e.ro,
      mirror_ratio: ratio(e.mr),
      ...drawn(e),
      divergence: divergence(e),
    };
  });
  // HS chapters (all goods only): the 12-month window in view, or the window ending in December for a year
  let products: ProductRow[] | null = null;
  let chaptersAt: number | null = null;
  if (p.id === 'TOTAL') {
    chaptersAt = s.freq === 'M' ? s.t : s.t * 100 + 12;
    const tot = s.freq === 'M' ? snap : await snapAt(meta, p, { freq: 'M', t: chaptersAt }).catch(() => null);
    const tn = tot?.byIndex.get(i);
    products = tn ? await topChapters(meta, iso, chaptersAt, dir, dir === 'exports' ? tn.exports : tn.imports, a.lang) : null;
    if (products && s.freq === 'A') notes.push(`HS chapters come from the 12-month window ending in December ${s.t} (the monthly windows), not the annual mirror-rule snapshot.`);
    if (!products) notes.push(`No HS-chapter split for ${nm} in this period: products.json holds the 100 largest economies over 12-month windows from ${monthWords(202208)} on.`);
  }
  notes.push(dir === 'exports'
    ? 'Partners are the destinations the snapshot keeps: every flow ranked in the top ten on either side or above 0.05% of world trade. rank is the partner’s rank among the economy’s destinations; economy_rank_at_partner is the economy’s rank among the partner’s suppliers.'
    : 'Partners are the suppliers the snapshot keeps: every flow ranked in the top ten on either side or above 0.05% of world trade. rank is the partner’s rank among the economy’s suppliers; economy_rank_at_partner is the economy’s rank among the partner’s destinations.');
  notes.push('mirror_ratio is the importer’s report divided by the exporter’s (imports CIF, exports FOB; about 1.06 is usual); null when one side did not report the flow.');

  const sideW = dir === 'exports' ? side.exports : side.imports;
  const top3 = partners.slice(0, 3).map((x) => `${enName(meta, econIndex(meta, x.code))} ${x.share_of_economy_pct}%`).join(', ');
  const prodTop = products?.[0] ? ` Largest ${dir === 'exports' ? 'export' : 'import'} chapter: HS ${products[0].hs} ${meta.products.find((x) => x.id === products![0].id)?.en ?? ''}, ${products[0].share_of_economy_pct}% of ${dir}.` : '';
  const summary = `${nm}, ${pname.toLowerCase()}, ${periodWords(s)}: ${pctText(n.x)} of world exports (rank ${side.exports.rank ?? 'n/a'} of ${side.exports.of}) and ${pctText(n.m)} of world imports (rank ${side.imports.rank ?? 'n/a'} of ${side.imports.of}).`
    + (top3 ? ` Largest ${dir === 'exports' ? 'destinations' : 'suppliers'}, as shares of its ${dir}: ${top3}.` : '') + prodTop
    + ` Source: UN Comtrade${sources.length > 1 ? ' and the Korea Customs Service' : ''}, ${s.freq === 'M' ? '12-month windows' : 'annual data, mirror rule'}.`;

  return envelope(meta, 'economy', {
    period: periodBlock(meta, s), page, sources, notes, summary,
    data: {
      ...base, traded: true, reported: n.reported, completeness_pct: pct(c), ...side,
      partners, products, products_window: products ? ym(chaptersAt!) : null,
    },
    table: {
      columns: [
        { id: 'rank', label: 'Rank' }, { id: 'code', label: 'Partner (ISO3)' }, { id: 'name', label: 'Partner' },
        { id: 'share_of_economy_pct', label: `Share of ${poss(nm)} ${dir}`, unit: '%' }, { id: 'share_of_world_pct', label: 'Share of world trade', unit: '%' },
        { id: 'mirror_ratio', label: 'Mirror ratio (importer ÷ exporter)', unit: 'ratio' },
      ],
      rows: partners.map((x) => [x.rank, x.code, x.name, x.share_of_economy_pct, x.share_of_world_pct, x.mirror_ratio]),
    },
  });
}

/* A pair ------------------------------------------------------------------------------------------------------------------ */

const flowBlocks = cached<string, FlowsBlock | null>(8);

/** The 300 largest flows by peak share over time (flows/W or flows/A), the flow card's strip; only the block the view
 *  reads (12-month windows, or years) is kept. */
function flowBlock(p: MetaProduct, freq: 'A' | 'M'): Promise<FlowsBlock | null> {
  return flowBlocks(`${p.slug}|${freq}`, async () => {
    const f = await readOnce<RawFlowsFile>(`flows/${freq === 'M' ? 'W' : 'A'}/${p.slug}.json`);
    return f ? ((f[freq === 'M' ? '12' : 'A'] as FlowsBlock | undefined) ?? null) : null;
  });
}

interface ChapterFlow { hs: string; share: number; w: number; ro: number; ri: number; mr: number | null }
const pairChapters = cached<string, { ab: ChapterFlow[]; ba: ChapterFlow[] } | null>(32);

/** A pair's flows in every HS chapter in a year (the explorer with an HS chapter chosen, one chapter at a time), as
 *  shares of the pair's all-goods flow in each direction. Reads the 96 chapter snapshots once and keeps the result. */
function chaptersOfPair(meta: Meta, a: number, b: number, year: number): Promise<{ ab: ChapterFlow[]; ba: ChapterFlow[] } | null> {
  return pairChapters(`${a}|${b}|${year}`, async () => {
    const total = await readData<RawAnnualSnap>(`snap/A/TOTAL/${year}.json`).catch(() => null);
    if (!total) return null;
    const value = (raw: RawAnnualSnap, s: number, t: number) => {
      const c = Object.fromEntries(raw.ecols.map((k, j) => [k, j]));
      const r = raw.edges.find((e) => e[c.s] === s && e[c.t] === t);
      return r ? { v: (r[c.w] as number) * raw.world, w: r[c.w] as number, ro: r[c.ro] as number, ri: r[c.ri] as number, mr: (r[c.mr] as number | null) ?? null } : null;
    };
    const totAB = value(total, a, b), totBA = value(total, b, a);
    const ab: ChapterFlow[] = [], ba: ChapterFlow[] = [];
    for (const p of meta.products.filter((x) => x.kind === 'chapter' && x.A[0] <= year && x.A[1] >= year)) {
      const raw = await readOnce<RawAnnualSnap>(`snap/A/${p.slug}/${year}.json`).catch(() => null);
      if (!raw) continue;
      const x = totAB ? value(raw, a, b) : null, y = totBA ? value(raw, b, a) : null;
      if (x && totAB) ab.push({ hs: p.codes[0] ?? p.id.slice(3), share: x.v / totAB.v, w: x.w, ro: x.ro, ri: x.ri, mr: x.mr });
      if (y && totBA) ba.push({ hs: p.codes[0] ?? p.id.slice(3), share: y.v / totBA.v, w: y.w, ro: y.ro, ri: y.ri, mr: y.mr });
    }
    const top = (xs: ChapterFlow[]) => xs.sort((m, n) => n.share - m.share).slice(0, CHAPTERS_TOP);
    return { ab: top(ab), ba: top(ba) };
  });
}

export interface BilateralArgs { a: string; b: string; product: string | null; period: string | null; lang: Lang }

export async function bilateralView(o: BilateralArgs): Promise<Envelope> {
  const meta = await getMeta();
  const a = econIndex(meta, o.a), b = econIndex(meta, o.b);
  if (a === b) throw badParam('a and b must be two different economies.');
  const p = productOf(meta, o.product);
  const s = parsePeriod(meta, p, o.period);
  const snap = await snapOrFail(meta, p, s);
  const A = meta.nodes[a].id, B = meta.nodes[b].id;
  const na = snap.byIndex.get(a), nb = snap.byIndex.get(b);
  const { sources, notes } = sourcesOf(meta, s);
  const flow = (s1: number, t1: number) => {
    const e = snap.edges.find((x) => x.s === s1 && x.t === t1);
    const ns = snap.byIndex.get(s1), nt = snap.byIndex.get(t1);
    if (!e) return { exporter: econRef(meta, s1, o.lang), importer: econRef(meta, t1, o.lang), stored: false };
    const gap = gapFromRatio(e.mr);
    return {
      exporter: econRef(meta, s1, o.lang), importer: econRef(meta, t1, o.lang), stored: true,
      share_of_world_pct: pct(e.w),
      share_of_exporter_exports_pct: pct(ns && ns.x > 0 ? e.w / ns.x : null),
      share_of_importer_imports_pct: pct(nt && nt.m > 0 ? e.w / nt.m : null),
      importer_rank_among_destinations: e.ro,
      exporter_rank_among_suppliers: e.ri,
      mirror_ratio: ratio(e.mr),
      reports_gap_pct: pct(gap),
      reports_disagree: reportsDisagree(gap, e.w),
      ...drawn(e),
      divergence: divergence(e),
    };
  };
  const ab = flow(a, b), ba = flow(b, a);

  // the flow card's strip: shares of world trade and mirror ratios over time, for the 300 largest flows
  const fb = await flowBlock(p, s.freq);
  const kAB = fb ? fb.flows.findIndex(([x, y]) => x === a && y === b) : -1;
  const kBA = fb ? fb.flows.findIndex(([x, y]) => x === b && y === a) : -1;
  const first = s.freq === 'M' ? s.t - SERIES_YEARS * 100 : -Infinity;
  const idx = fb ? fb.t.map((t, j) => [t, j] as const).filter(([t]) => t > first && t <= s.t) : [];
  const rowsS = idx.map(([t, j]) => [
    s.freq === 'M' ? ym(t) : String(t),
    kAB >= 0 ? pct(fb!.w[kAB][j]) : null, kAB >= 0 ? ratio(fb!.mr[kAB][j]) : null,
    kBA >= 0 ? pct(fb!.w[kBA][j]) : null, kBA >= 0 ? ratio(fb!.mr[kBA][j]) : null,
  ] as [string, number | null, number | null, number | null, number | null]).filter((r) => r[1] != null || r[3] != null);
  // the strip's columns, one array each (the table carries the same rows for CSV)
  const series = {
    freq: s.freq, window_months: s.freq === 'M' ? 12 : null,
    periods: rowsS.map((r) => r[0]),
    a_to_b_share_of_world_pct: rowsS.map((r) => r[1]), a_to_b_mirror_ratio: rowsS.map((r) => r[2]),
    b_to_a_share_of_world_pct: rowsS.map((r) => r[3]), b_to_a_mirror_ratio: rowsS.map((r) => r[4]),
  };
  if (kAB < 0 && kBA < 0) notes.push('Neither direction is among the 300 largest flows of the product, which the site keeps over time: no series.');

  // HS chapters (all goods): the year in view, or the last complete year for a window (chapters are annual)
  let chapters: { year: number; a_to_b: unknown[]; b_to_a: unknown[] } | null = null;
  if (p.id === 'TOTAL') {
    const year = s.freq === 'A' ? s.t : meta.complete.A;
    const pc = await chaptersOfPair(meta, a, b, year);
    const rows = (xs: ChapterFlow[]) => xs.map((x, k) => {
      const prod = meta.products.find((q) => q.id === `HS:${x.hs}`);
      return {
        rank: k + 1, id: `HS:${x.hs}`, hs: x.hs, name: prod ? productName(prod, o.lang) : `HS ${x.hs}`,
        share_of_flow_pct: pct(x.share), share_of_world_chapter_pct: pct(x.w), importer_rank_among_destinations: x.ro, mirror_ratio: ratio(x.mr),
      };
    });
    if (pc) chapters = { year, a_to_b: rows(pc.ab), b_to_a: rows(pc.ba) };
    notes.push(`HS chapters are annual (${year}, mirror rule): each chapter's flow as a share of the pair's all-goods flow that year. Chapter flows ranked below ten on both sides and under 0.05% of world trade in the chapter are not stored, so the shares listed can sum to less than 100%.`);
  }
  notes.push('mirror_ratio is the importer’s report divided by the exporter’s (imports CIF, exports FOB; about 1.06 is usual). reports_gap_pct is |importer − exporter| over the larger; reports_disagree marks a gap above 50% on a flow of at least 1% of world trade.');

  const nA = enName(meta, a), nB = enName(meta, b);
  const line = (g: ReturnType<typeof flow>, x: string, y: string) => { const f = g as Record<string, unknown>; return (f.stored
    ? `${x} → ${y}: ${f.share_of_world_pct}% of world trade, ${f.share_of_exporter_exports_pct ?? 'n/a'}% of ${poss(x)} exports and ${f.share_of_importer_imports_pct ?? 'n/a'}% of ${poss(y)} imports (${y} is ${poss(x)} destination no. ${f.importer_rank_among_destinations}); mirror ratio ${f.mirror_ratio ?? 'n/a'}.`
    : `${x} → ${y}: not among the flows the snapshot keeps.`); };
  const summary = `${p.en}, ${periodWords(s)}. ${line(ab, nA, nB)} ${line(ba, nB, nA)}`
    + (chapters?.a_to_b[0] ? ` Largest HS chapter of ${nA} → ${nB} in ${chapters.year}: ${(chapters.a_to_b[0] as { hs: string }).hs} (${(chapters.a_to_b[0] as { share_of_flow_pct: number }).share_of_flow_pct}%).` : '')
    + ` Source: UN Comtrade${sources.length > 1 ? ' and the Korea Customs Service' : ''}.`;

  const q = new URLSearchParams({ flow: `${A}-${B}` });
  if (p.id !== 'TOTAL') q.set('p', p.id);
  return envelope(meta, 'bilateral', {
    period: periodBlock(meta, s),
    page: pageOf(o.lang, `/${s.freq === 'M' ? 'explore-monthly' : 'explore'}?${q.toString().replace(/%3A/g, ':')}`),
    sources, notes, summary,
    data: {
      a: econRef(meta, a, o.lang), b: econRef(meta, b, o.lang),
      product: { id: p.id, name: productName(p, o.lang), kind: p.kind },
      period: s.freq === 'M' ? { freq: 'M', window_months: 12, from: ym(windowMonths(s.t)[0]), to: ym(s.t) } : { freq: 'A', year: s.t },
      a_reported: na?.reported ?? false, b_reported: nb?.reported ?? false,
      a_to_b: ab, b_to_a: ba, series, chapters,
    },
    table: {
      columns: [
        { id: 'period', label: 'Period' },
        { id: 'a_to_b_share_of_world_pct', label: `${A}→${B}, share of world trade`, unit: '%' }, { id: 'a_to_b_mirror_ratio', label: `${A}→${B}, mirror ratio`, unit: 'ratio' },
        { id: 'b_to_a_share_of_world_pct', label: `${B}→${A}, share of world trade`, unit: '%' }, { id: 'b_to_a_mirror_ratio', label: `${B}→${A}, mirror ratio`, unit: 'ratio' },
      ],
      rows: rowsS,
    },
  });
}

/* A product's world picture (the explorer's overview) -------------------------------------------------------------- */

export interface ProductArgs { id: string; period: string | null; lang: Lang }

export function productBrief(meta: Meta, p: MetaProduct, lang: Lang) {
  const ws = p.W ? (meta.shown?.W != null ? [p.W[0], Math.min(p.W[1], meta.shown.W)] : p.W) : null;
  return {
    id: p.id, kind: p.kind, name: productName(p, lang), name_long: p.label_long ?? null, codes: p.codes,
    chain: p.chain ?? null, stage: p.stage_key ?? null, rung: p.stage ?? null, also_in: (p.chains ?? []).filter((c) => c !== p.chain),
    years: [p.A[0], Math.min(p.A[1], meta.shown?.A ?? p.A[1])],
    windows: ws ? [ym(ws[0]), ym(ws[1])] : null,
    page: pageOf(lang, `/${p.W ? 'explore-monthly' : 'explore'}${p.id === 'TOTAL' ? '' : `?p=${p.id}`}`),
  };
}

export async function productView(o: ProductArgs): Promise<Envelope> {
  const meta = await getMeta();
  const p = productOf(meta, o.id);
  const s = parsePeriod(meta, p, o.period);
  const snap = await snapOrFail(meta, p, s);
  const { sources, notes } = sourcesOf(meta, s);
  const tot = snap.tot;
  const top = (k: 'x' | 'm') => [...snap.nodes].filter((n) => n[k] > 0).sort((x, y) => y[k] - x[k]).slice(0, 10)
    .map((n, j) => ({ rank: j + 1, ...econRef(meta, n.i, o.lang), share_of_world_pct: pct(n[k]) }));
  const exporters = top('x'), importers = top('m');
  if (s.freq === 'A' && s.t > meta.complete.A) notes.push(`${s.t} is partial: fewer than the ten largest traders had filed.`);
  if (s.freq === 'M' && tot.est) notes.push(`${pctText(tot.est)} of world trade in this window is estimated from partners' reports (spliced, benchmarked or partner-only); the rest is reported by the importer.`);
  const brief = productBrief(meta, p, o.lang);
  const t1 = tot.top1_id >= 0 ? enName(meta, tot.top1_id) : null;
  const summary = `${p.en}${p.codes.length ? ` (HS ${p.codes.slice(0, 4).join(', ')}${p.codes.length > 4 ? ', …' : ''})` : ''}, ${periodWords(s)}: ${snap.nodes.filter((n) => n.x > 0).length} exporting economies; `
    + `${t1 ? `the largest, ${t1}, holds ${pctText(tot.top1)} of world exports, ` : ''}the five largest ${pctText(tot.top5)}; exporter HHI ${ratio(tot.hhi, 3) ?? 'n/a'}. `
    + `Largest importers: ${importers.slice(0, 3).map((x) => `${enName(meta, econIndex(meta, x.code))} ${x.share_of_world_pct}%`).join(', ')}. Source: UN Comtrade${sources.length > 1 ? ' and the Korea Customs Service' : ''}.`;
  return envelope(meta, 'product', {
    period: periodBlock(meta, s), page: brief.page, sources, notes, summary,
    data: {
      product: brief,
      period: s.freq === 'M' ? { freq: 'M', window_months: 12, from: ym(windowMonths(s.t)[0]), to: ym(s.t) } : { freq: 'A', year: s.t },
      economies: tot.nodes, exporters: tot.exporters, reporters: tot.reporters,
      top_exporter: tot.top1_id >= 0 ? { ...econRef(meta, tot.top1_id, o.lang), share_of_world_pct: pct(tot.top1) } : null,
      top5_share_pct: pct(tot.top5), exporter_hhi: ratio(tot.hhi), supplier_hhi: ratio(tot.hhi_sup),
      importer_reported_pct: pct(tot.imp_rep), estimated_pct: s.freq === 'M' ? pct(tot.est ?? null) : null,
      top_exporters: exporters, top_importers: importers,
    },
    table: {
      columns: [{ id: 'side', label: 'Side' }, { id: 'rank', label: 'Rank' }, { id: 'code', label: 'Economy (ISO3)' }, { id: 'name', label: 'Economy' }, { id: 'share_of_world_pct', label: 'Share of world trade', unit: '%' }],
      rows: [...exporters.map((x) => ['exports', x.rank, x.code, x.name, x.share_of_world_pct]), ...importers.map((x) => ['imports', x.rank, x.code, x.name, x.share_of_world_pct])],
    },
  });
}

