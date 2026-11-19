// The explorer's state, kept in the URL hash (design book 04-Explorer-layout, "URL state", plus strip, tbl and
// tab): #t=2024&base=2017&p=C:batteries:cells&c=bloc&blocs=EU,ASEAN&focus=CHN. Keys with default values are left
// out, so a shared link says only what differs from the default view. No economy is selected by default; a
// ?focus=ISO3 query (as on the chain pages) selects one when the hash does not, ?flow=A-B opens that flow's card
// and ?p= chooses the product (the server-rendered summary links this way; crawlers ignore the hash).
//
// The explorer (/explore) draws years only since 2 Nov 2026: `f` is always A and `lens` L.
// The monthly explorer (/explore-monthly) uses the same keys with f = M, plus w (window length, 3, 6 or
// 12; default 12), cmp (yoy: the base follows t − 12; base: a fixed base; default yoy below 12 months) and est (0
// hides the estimated flows; default 1).
import {
  addMonths, defaultBase, findProduct, periodsOf, windowPeriods, type ColorBy, type Freq, type Layout, type Lens, type Meta,
  type MetaProduct, type Rule, type Scale, type SizeBy, type WindowLen,
} from '@larch/net/core';

/** Which explorer: the years-and-lenses one (/explore) or the monthly windows (/explore-monthly). */
export type ExploreMode = 'explore' | 'windows';
export type Compare = 'yoy' | 'base';
export const WINDOWS: WindowLen[] = [3, 6, 12];

export type StripMetric = 'world' | 'momentum' | 'top1' | 'hhi' | 'edges' | 'reporters' | 'est';
export type DrawerTab = 'main' | 'checks';

export interface ExploreState {
  p: string;
  f: Freq;
  t: number;
  base: number;
  m: Rule;
  l: Layout;
  c: ColorBy;
  s: SizeBy;
  sc: Scale;
  /** Colour by trade blocs: the blocs, in the reader's order (an economy in two takes the first). */
  blocs: string[];
  /** Colour by clubs: the one highlighted. */
  club: string;
  /** Colour by the reader's own list: ISO3 codes. */
  custom: string[];
  /** Read bloc and club membership today instead of at the end of the period shown. */
  mt: boolean;
  k: number;
  min: number;
  lab: number;
  focus: string | null;
  flow: string | null;
  lens: Lens;
  strip: StripMetric;
  tbl: boolean;
  tab: DrawerTab;
  /** Monthly explorer: window length, comparison, estimated flows shown. */
  w: WindowLen;
  cmp: Compare;
  est: boolean;
}

/** A window's effective lag, (w − 1) / 2 months, in words: "1 month", "2.5 months", "5.5개월". */
export function lagText(lang: 'en' | 'ko', w: WindowLen): string {
  const n = (w - 1) / 2;
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return lang === 'ko' ? `${v}개월` : `${v} ${n === 1 ? 'month' : 'months'}`;
}

/** The default comparison for a window length: year on year below 12 months. */
export function defaultCmp(w: WindowLen): Compare {
  return w < 12 ? 'yoy' : 'base';
}

/** The periods the explorer can show: years, months through a lens, or the monthly explorer's window ends. */
export function periodsFor(meta: Meta, p: MetaProduct, mode: ExploreMode, f: Freq, lens: Lens, w: WindowLen): number[] {
  const ps = mode === 'windows' ? windowPeriods(meta, p, w) : periodsOf(p, f, lens);
  // the picker ends where enough of world trade has been filed (meta.shown)
  const end = meta.shown?.[mode === 'windows' ? 'W' : f];
  return end != null ? ps.filter((t) => t <= end) : ps;
}

/** The base actually compared against: t − 12 under cmp=yoy in the monthly explorer, else the chosen base. */
export function effectiveBase(st: ExploreState, mode: ExploreMode): number {
  return mode === 'windows' && st.cmp === 'yoy' ? addMonths(st.t, -12) : st.base;
}

/** Predefined groupings first (region is the default); Louvain communities last, as the advanced option. */
export const COLOR_MODES: ColorBy[] = ['region', 'bloc', 'club', 'custom', 'change', 'concentration', 'reporting', 'stage', 'community'];
export const SIZE_MODES: SizeBy[] = ['total', 'split', 'exports', 'imports', 'pagerank', 'betweenness', 'degree'];
export const DEFAULT_BLOCS = ['EU', 'ASEAN', 'USMCA'];
export const CLUBS = ['G7', 'G20', 'OECD', 'BRICS'];
export const BLOCS = ['EU', 'ASEAN', 'USMCA', 'MERCOSUR', 'GCC', 'EAEU', 'AFCFTA'];
export const MIN_STEPS = [0, 0.00005, 0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01];
export const LABEL_STEPS = [0, 10, 25, 50, 999];
export const STRIPS: StripMetric[] = ['world', 'momentum', 'top1', 'hhi', 'edges', 'reporters'];
/** The monthly explorer's strip adds the estimated share of world trade. */
export const STRIPS_W: StripMetric[] = ['world', 'momentum', 'est', 'top1', 'hhi', 'edges', 'reporters'];

/** The defaults for a product and frequency: the last complete period, base 2017 (years) or t − 12 (months). */
export function defaults(meta: Meta, p: MetaProduct, f: Freq, lens: Lens, t?: number, mode: ExploreMode = 'explore', w: WindowLen = 12): ExploreState {
  const periods = periodsFor(meta, p, mode, f, lens, w);
  const complete = meta.complete[f];
  let t0 = periods.includes(complete) ? complete : periods.filter((x) => x <= complete).at(-1) ?? periods.at(-1) ?? complete;
  const tt = t ?? t0;
  return {
    p: 'TOTAL', f: 'A', t: tt, base: clampBase(defaultBase(tt, f, periods[0]), periods),
    m: 'mirror', l: 'map', c: 'region', s: 'total', sc: 'fixed', blocs: DEFAULT_BLOCS, club: 'G7', custom: [], mt: false, k: 2, min: 0.0002, lab: 25,
    focus: null, flow: null, lens: 'L', strip: 'world', tbl: false, tab: 'main',
    w, cmp: defaultCmp(w), est: true,
    ...(mode === 'windows' ? { p: p.id, f: 'M' as Freq } : {}),
  };
}

function clampBase(b: number, periods: number[]): number {
  if (!periods.length || periods.includes(b)) return b;
  if (b < periods[0]) return periods[0];
  return periods.filter((x) => x <= b).at(-1) ?? periods[0];
}

/** The state of a hash, validated against meta: unknown products fall back to all goods, periods to the default. */
export function parseHash(meta: Meta, hash: string, mode: ExploreMode = 'explore'): { state: ExploreState; missingProduct: boolean } {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const get = (k: string) => q.get(k);
  const wanted = get('p');
  let product = findProduct(meta, wanted ?? 'TOTAL');
  if (mode === 'windows' && product && !product.W) product = null;
  const missingProduct = !!wanted && !product;
  if (!product) product = findProduct(meta, 'TOTAL')!;
  // the explorer draws years only; the monthly
  // explorer is always monthly on the 12-month lens's files
  const f: Freq = mode === 'windows' ? 'M' : 'A';
  const lens: Lens = 'L';
  const wQ = Number(get('w'));
  const w: WindowLen = (WINDOWS as number[]).includes(wQ) ? (wQ as WindowLen) : 12;
  const periods = periodsFor(meta, product, mode, f, lens, w);
  const d = defaults(meta, product, f, lens, undefined, mode, w);
  let t = Number(get('t'));
  if (!periods.includes(t)) {
    // a month in which no window of this length ends (monthly explorer) moves to the window ending a month later
    if (mode === 'windows' && periods.includes(addMonths(t, 1))) t = addMonths(t, 1);
    else t = d.t;
  }
  const dt = defaults(meta, product, f, lens, t, mode, w);
  let base = Number(get('base'));
  if (!periods.includes(base)) base = dt.base;
  const pick = <T extends string>(v: string | null, ok: readonly T[], dflt: T): T => (v && (ok as readonly string[]).includes(v) ? (v as T) : dflt);
  const num = (v: string | null, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
  };
  const iso = (v: string | null) => (v && /^[A-Z0-9_]{3}$/.test(v.toUpperCase()) && meta.nodes.some((n) => n.id === v.toUpperCase()) ? v.toUpperCase() : null);
  const flowQ = get('flow');
  const flow = flowQ && /^[A-Z0-9_]{3}>[A-Z0-9_]{3}$/.test(flowQ.toUpperCase()) ? flowQ.toUpperCase() : null;
  return {
    missingProduct,
    state: {
      p: product.id, f, t, base,
      m: product.id === 'TOTAL' && f === 'A' ? pick(get('m'), ['mirror', 'importer', 'exporter'] as const, 'mirror') : 'mirror',
      l: pick(get('l'), ['map', 'force'] as const, 'map'),
      c: pick(get('c'), COLOR_MODES, 'region'),
      s: pick(get('s'), SIZE_MODES, 'total'),
      sc: pick(get('sc'), ['fixed', 'period'] as const, 'fixed'),
      blocs: get('blocs') != null ? [...new Set((get('blocs') ?? '').toUpperCase().split(',').filter((x) => BLOCS.includes(x)))] : DEFAULT_BLOCS,
      club: pick(get('club')?.toUpperCase() ?? null, CLUBS, 'G7'),
      custom: [...new Set((get('custom') ?? '').split(',').map(iso).filter((x): x is string => !!x))],
      mt: get('mt') === '1',
      k: Math.round(num(get('k'), 1, 10, 2)),
      min: num(get('min'), 0, 0.05, 0.0002),
      lab: Math.round(num(get('lab'), 0, 999, 25)),
      focus: flow ? null : iso(get('focus')),
      flow,
      lens,
      strip: pick(get('strip'), STRIPS, 'world'),
      tbl: get('tbl') === '1',
      tab: pick(get('tab'), ['main', 'checks'] as const, 'main'),
      w,
      cmp: pick(get('cmp'), ['yoy', 'base'] as const, defaultCmp(w)),
      est: get('est') !== '0',
    },
  };
}

/** The hash for a state, without the keys at their defaults. */
export function toHash(meta: Meta, st: ExploreState, mode: ExploreMode = 'explore'): string {
  const product = findProduct(meta, st.p)!;
  const d = defaults(meta, product, st.f, st.lens, undefined, mode, st.w);
  const dt = defaults(meta, product, st.f, st.lens, st.t, mode, st.w);
  const win = mode === 'windows';
  const q = new URLSearchParams();
  const put = (k: string, v: string | number | boolean | null, dflt: string | number | boolean | null) => {
    if (v == null || v === dflt) return;
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  };
  put('t', st.t, d.t);
  if (!win || st.cmp === 'base') put('base', st.base, dt.base);
  put('p', st.p, 'TOTAL');
  if (win) {
    put('w', st.w, 12);
    put('cmp', st.cmp, defaultCmp(st.w));
    put('est', st.est, true);
  }
  put('m', st.m, 'mirror');
  put('l', st.l, 'map');
  put('c', st.c, 'region');
  put('s', st.s, 'total');
  put('sc', st.sc, 'fixed');
  if (st.c === 'bloc') put('blocs', st.blocs.join(','), DEFAULT_BLOCS.join(','));
  if (st.c === 'club') put('club', st.club, 'G7');
  if (st.c === 'custom') put('custom', st.custom.join(','), '');
  if (st.c === 'bloc' || st.c === 'club') put('mt', st.mt, false);
  put('k', st.k, 2);
  put('min', st.min, 0.0002);
  put('lab', st.lab, 25);
  put('focus', st.focus, null);
  put('flow', st.flow, null);
  put('strip', st.strip, 'world');
  put('tbl', st.tbl, false);
  put('tab', st.tab, 'main');
  // keep ':' and '>' readable in the address bar
  return q.toString().replace(/%3A/gi, ':').replace(/%3E/gi, '>').replace(/%2C/gi, ',');
}
