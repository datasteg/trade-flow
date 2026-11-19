// Types and server-side readers for the files the home, method and checks pages read (docs/DATA.md). Server only:
// readData() reads trade-flow/data at build time (the pages are static).
import { readData } from '@/lib/data';
import { formatDate, formatShare, type Lang } from '@/lib/i18n';

/** readData, or null when the file is not there (events/index.json and build.json may not be built yet). */
export async function tryData<T>(rel: string): Promise<T | null> {
  try {
    return await readData<T>(rel);
  } catch {
    return null;
  }
}

export interface MetaNode {
  id: string;
  en: string;
  ko: string;
  name: string;
  region: string;
  subregion: string;
  lat: number;
  lon: number;
  hist: boolean;
}

export type ProductKind = 'total' | 'chapter' | 'basket' | 'stage';

export interface MetaProduct {
  id: string;
  slug: string;
  kind: ProductKind;
  en: string;
  ko: string;
  codes: string[];
  A: [number, number];
  M?: [number, number];
  lenses?: string[];
  chain?: string;
  chains?: string[];
  stage?: number;
  stage_key?: string;
  aliases?: string[];
  label_long?: string;
}

export interface Records { originals: number; budget: number; line: number }

export interface Meta {
  built_at: string;
  layer_built: { A: string; M: string };
  nodes: MetaNode[];
  products: MetaProduct[];
  complete: { A: number; M: number };
  last: { A: number; M: number };
  shown?: { A?: number; M?: number; W?: number };
  coverage: { A: Record<string, number>; M: Record<string, number> };
  reporters: { A: Record<string, number>; M: Record<string, number> };
  lenses: Record<string, number>;
  records: Records;
  /** Months an economy's monthly records come from another source. */
  supplements?: MetaSupplement[];
}

export interface MetaSupplement {
  node: number;
  source: string;
  en: string;
  ko: string;
  url: string;
  M: [number, number];
  ranges?: [number, number][];
  fetched: string;
  vintages?: [number, number, string | null][];
  preliminary_from?: number;
}

export const readMeta = () => readData<Meta>('meta.json');

export type Status = 'pass' | 'watch' | 'fail' | 'info' | 'not run';
export const STATUSES: readonly Status[] = ['pass', 'watch', 'fail', 'info', 'not run'];

export interface CheckDef {
  tier: number;
  en: string;
  ko: string;
  threshold: { en: string; ko: string };
}

export interface Validator { id: string; what: string; fetched: boolean; last: number | null }

export interface ChecksIndex {
  run_at: string;
  checks: Record<string, CheckDef>;
  counts: Record<string, Partial<Record<Status, number>>>;
  /** [product, tier, check, status, subject] */
  rows: [string, number, string, Status, string | null][];
  records: Records;
  validators: Validator[];
  /** The monthly explorer's diagnostics (scripts/build_windows.py). */
  windows?: WindowsSummary | null;
}

/** One backtest cell: n windows; median and 90th-percentile absolute % error. */
export interface BacktestScore { n: number; mdape: number | null; p90: number | null }

export interface WindowsSummary {
  total: {
    months: [number, number];
    timing: { flows: number; share_w3?: number; share_w12?: number; share_w3_median?: number; var?: Record<string, { pooled: number; median: number }> };
    /** {w: {all | q1..q4: {n, splice, splice_window, partner}}} */
    backtest: Record<string, Record<string, { n: number; splice: BacktestScore; splice_window: BacktestScore; partner: BacktestScore }>>;
    size_quartiles_usd: number[];
    leak_test: { flows: number; single_month: number };
    dropped_share: Record<string, number>;
    benchmark: { pair_years: number; skipped: number };
  } | null;
  products: number;
  backtest_median: Record<string, { products: number; splice_mdape: number | null; splice_p90: number | null; partner_mdape: number | null; partner_p90: number | null }>;
  timing_share_median: number | null;
  leaks: number;
  leak_tested: number;
}

/** One check in data/checks/<slug>.json; the fields beyond id and status differ by check. */
export interface Check {
  id: string;
  status: Status;
  rows?: unknown[][];
  cols?: string[];
  worst?: number | null;
  band?: [number, number];
  period?: [number, number];
  partner?: string;
  [k: string]: unknown;
}

export interface ProductChecks { p: string; run_at: string; tiers: { tier: number; checks: Check[] }[] }

export interface PapersCheck { run_at: string; tier: number; anchors: { case: string; ref: string; verified: boolean }[]; verified: number; papers: number }

export interface BuildStats { built_at: string; sec: number; files: number; bytes: number; records: Records }

/** A product's display name in the page language. */
export function productName(p: MetaProduct, lang: Lang): string {
  return lang === 'ko' ? p.ko : p.en;
}

/** An ISO timestamp as a date ("23 Oct 2026" / "2026년 10월 23일"). */
export function day(iso: string, lang: Lang): string {
  return formatDate(iso.slice(0, 10), lang);
}

/** Months from `from` to `to` (YYYYMM), inclusive. */
export function monthRange(from: number, to: number): number[] {
  const out: number[] = [];
  let y = Math.floor(from / 100), m = from % 100;
  while (y * 100 + m <= to) {
    out.push(y * 100 + m);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** The explorer with a product's Checks tab open in the drawer (components/explore/state.ts: `p` and `tab`). */
export function exploreChecksHref(lang: Lang, product: string): string {
  return product === 'TOTAL' ? `/${lang}/explore#tab=checks` : `/${lang}/explore#p=${product}&tab=checks`;
}

/** A coverage share as a percentage: one decimal near the ends (99.7%, 0.9%), none between (64%). */
export function coverageShare(v: number | null | undefined, lang: Lang): string {
  if (v == null) return '–';
  return formatShare(v, lang, { decimals: v >= 0.995 || v < 0.1 ? 1 : 0 });
}
