// Pure helpers for the chain pages, used by the server pages and the client components alike: formatting the stage
// numbers the Larch way, building the page model from the chain file, the default "main line" of the Trail, the
// two-way traders, a focus economy's place and the CSV text. No React, no browser APIs.
import { formatNumber, formatShare, formatUSD, stageLabel, type Lang } from '@larch/ui';
import type {
  ChainFile, ChainIndexFile, ChainModel, ChainSeries, EconFile, EconPlace, MetaFile, StageModel, StageRole, StageYear,
  TwoWayRow, UseShare, UseShareView, YearSlice,
} from './types';

import { supplementLine } from '@larch/net/core';

export { stageToken, stageVar } from '@larch/net/core';

/** The first month a 12-month sum ending in `t` covers. */
const addMonth12 = (t: number) => { const i = Math.floor(t / 100) * 12 + (t % 100) - 1 - 11; return Math.floor(i / 12) * 100 + (i % 12) + 1; };

/** The rungs of a ladder of n: 1 … n. */
export function rungs(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
/** Ladders longer than this draw compact waypoints on the ChainTrail and scroll sideways. */
export const LONG_LADDER = 6;
/** The comparison year of the stage tables (as in PRODUCT-CHAINS: 2019 against the latest complete year). */
export const BASE_YEAR = 2019;
/** Exporter HHI above which a stage is "high" and can be a chokepoint. */
export const HHI_HIGH = 0.25;
export const HHI_MODERATE = 0.15;
/** Unit values only where net weight covers at least this share of value. */
export const KG_COVERAGE_MIN = 0.8;

/** Side inputs that chains.yaml does not mark with a role yet: machines and anode coke join the trail from above
 *  (design book 03-Product-chains, "Feeds"). */
/** "S3" / "3단계". */
export function stageTag(lang: Lang, n: number): string {
  return stageLabel(lang, n);
}

/** A share of world trade as written on chain pages: one decimal below 10% ("4.0%"), none above ("56%"). */
export function fmtShare(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '–';
  if (v > 0 && v < 0.0005) return lang === 'ko' ? '0.1% 미만' : '<0.1%';
  return formatShare(v, lang, { decimals: v < 0.0995 ? 1 : 0 });
}

/** A share as an unformatted percentage for tables and CSV (one decimal, or two below 1%). */
export function pct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const p = v * 100;
  return Math.round(p * (p < 1 ? 100 : 10)) / (p < 1 ? 100 : 10);
}

/** USD with the Larch scale: "$115.4bn", "$4.0bn", "$1.1tn", "$616m" / "1,154억 달러". Billions and trillions keep
 *  one decimal, millions none (design book: "$115.4bn", "$640m"). */
export function fmtUSD(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v) || lang === 'ko') return formatUSD(v, lang);
  const a = Math.abs(v), sign = v < 0 ? '\u2212' : '';
  const one = (x: number) => formatNumber(x, lang, { decimals: 1 }).replace(/^([^.]*)$/, '$1.0');
  if (a >= 999.95e9) return `${sign}$${one(a / 1e12)}tn`;
  if (a >= 0.9995e9) return `${sign}$${one(a / 1e9)}bn`;
  if (a >= 1e6) return `${sign}$${formatNumber(a / 1e6, lang)}m`;
  return formatUSD(v, lang);
}

/** Unit value: "$14.2/kg" / "kg당 14.2달러"; two decimals below $1. */
export function fmtUV(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const n = formatNumber(v, lang, { decimals: v < 1 ? 2 : v < 1000 ? 1 : 0 });
  return lang === 'ko' ? `kg당 ${n}달러` : `$${n}/kg`;
}

/** HHI with two decimals ("0.61"). */
export function fmtHHI(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '–' : v.toFixed(2);
}

export function hhiBand(v: number | null | undefined): 'low' | 'mid' | 'high' {
  if (v == null || v < HHI_MODERATE) return 'low';
  return v > HHI_HIGH ? 'high' : 'mid';
}

/** Whether the unit value may be shown (weight covers ≥ 80% of value). */
export function uvShown(y: StageYear | null | undefined): boolean {
  return !!y && y.usd_per_kg != null && (y.kg_coverage ?? 0) >= KG_COVERAGE_MIN;
}

/** The stage's role on the trail: feedstock (chains.yaml role: feedstock), side input, or a stage of its own. */
export function roleOf(s: { key: string; role: string | null }): StageRole {
  if (s.role === 'feedstock') return 'feedstock';
  if (s.role === 'side') return 'side';
  return null;
}

/** The short name of a use-share source for the badge: "IEA, The Future …" -> "IEA". */
function shortSource(src: string | null | undefined): string | null {
  if (!src || /^none\b/i.test(src)) return null;
  return src.split(',')[0].trim();
}

export function useShareView(u: UseShare | null | undefined, lang: Lang): UseShareView | null {
  if (!u) return null;
  const free = !!u.source && !/^none\b/i.test(u.source);
  return {
    share: u.share ?? null,
    what: u.what ? u.what[lang] ?? u.what.en : null,
    source: free ? u.source ?? null : null,
    short: shortSource(u.source),
    year: u.year ?? null,
    url: u.url ?? null,
  };
}

/** Before-2022 code contents that the HS notice names (the two codes chains.yaml splits). */
export const PRE2022_WHAT: Record<string, { en: string; ko: string }> = {
  '854140': { en: 'solar cells, modules and LEDs', ko: '태양전지 셀·모듈과 LED가' },
  '851712': { en: 'smartphones and all other mobile phones', ko: '스마트폰과 그 밖의 휴대전화가' },
  '851770': { en: 'the parts of phones and of all other telephone and transmission apparatus', ko: '휴대전화와 그 밖의 모든 전화·전송 장치의 부품이' },
};

/* The page model --------------------------------------------------------------------------------------------- */

/** The static part of a chain page in one language: stages without their yearly numbers, node names, chain names. */
/** checks/kcs_gaps.json: each stage's customs-against-Comtrade gap for Korea over the months both hold (checks.py). */
export interface KcsGaps { products: Record<string, { x: number | null; m: number | null; months: [number, number] }> }

/** A gap worth a note on the stage (the customs records short of Korea's Comtrade file by more than this). */
export const KCS_GAP_NOTE = 0.005;

export function buildModel(chain: ChainFile, meta: MetaFile, index: ChainIndexFile, lang: Lang, gaps?: KcsGaps | null): ChainModel {
  // the customs months of the economy filled from the customs service (the latest run), for the stage notes
  const sup = (meta.supplements ?? [])[0];
  const supLast = sup ? (sup.ranges ?? [sup.M])[(sup.ranges ?? [sup.M]).length - 1] : null;
  const chainNames: Record<string, string> = {};
  for (const c of index.chains) chainNames[c.id] = lang === 'ko' ? c.ko : c.en;
  const stageProducts = meta.products.filter((p) => p.kind === 'stage');

  const stages: StageModel[] = chain.stages.map((s) => {
    const years = Object.keys(s.years).map(Number).filter((y) => (s.years[y]?.world ?? 0) > 0).sort((a, b) => a - b);
    const inputs = chain.stages.filter((o) => o.feeds.includes(s.key)).map((o) => o.key);
    const shared = s.shared.map((other) => {
      // The same codes in the other chain: link to that stage; else to the chain's page.
      const match = stageProducts.find((p) => p.chain === other && p.codes.some((c) => s.codes.includes(c)))
        ?? stageProducts.find((p) => (p.chains ?? []).includes(other) && (p.id === s.product));
      const anchor = match?.stage_key ? `#stage-${match.stage_key}` : '';
      return { chain: other, name: chainNames[other] ?? other, href: `/${lang}/chains/${other}${anchor}` };
    });
    return {
      key: s.key,
      product: s.product,
      stage: s.stage,
      name: lang === 'ko' ? s.ko : s.en,
      codes: s.codes,
      codesPre: s.codes_pre2022,
      feeds: s.feeds.filter((f) => chain.stages.some((o) => o.key === f)),
      inputs,
      shared,
      role: roleOf(s),
      use: useShareView(s.use_share?.[chain.id], lang),
      caveat: s.caveat ? s.caveat[lang] ?? s.caveat.en : null,
      residual: s.residual,
      first: years[0] ?? null,
      last: years[years.length - 1] ?? null,
      kcsGap: (() => {
        const g = gaps?.products[s.product];
        if (!g || !sup || !supLast) return null;
        const side = Math.abs(g.m ?? 0) >= Math.abs(g.x ?? 0) ? 'm' : 'x';
        const v = g[side];
        return v != null && Math.abs(v) > KCS_GAP_NOTE
          ? { side, gap: v, months: g.months, supplied: supLast, node: sup.node, source: sup.source } : null;
      })(),
    };
  });

  return {
    id: chain.id,
    lang,
    name: lang === 'ko' ? chain.ko : chain.en,
    levels: chain.levels.map((l) => ({ name: lang === 'ko' ? l.ko : l.en, who: lang === 'ko' ? l.who.ko : l.who.en })),
    years: chain.years,
    complete: meta.complete.A,
    completeMonth: meta.complete.M,
    coverage: meta.coverage.A,
    coverageM: meta.coverage.M,
    shownMonth: meta.shown?.M ?? null,
    monthCite: (() => {
      const ts = chain.stages.flatMap((s) => s.monthly?.t ?? []);
      if (!ts.length) return '';
      const nodes = meta.nodes as unknown as Parameters<typeof supplementLine>[1]['nodes'];
      return supplementLine(lang, { supplements: meta.supplements, nodes }, addMonth12(Math.min(...ts)), meta.shown?.M ?? Math.max(...ts));
    })(),
    chokepoint: chain.chokepoint,
    stages,
    nodes: meta.nodes.map((n) => [n.id, lang === 'ko' ? n.ko : n.en]),
    focusable: meta.nodes.flatMap((n, i) => (!n.hist && !n.nes && /^[A-Z]{3}$/.test(n.id) ? [i] : [])),
    nes: meta.nodes.flatMap((n, i) => (n.nes ? [i] : [])),
    chainNames,
  };
}

/** One year of every stage. */
export function sliceOf(chain: ChainFile, year: number): YearSlice {
  const out: YearSlice = {};
  for (const s of chain.stages) {
    const y = s.years[String(year)];
    out[s.key] = y && y.world > 0 ? y : null;
  }
  return out;
}

/** The strips: HHI by chain year, and the monthly 12-month sum (rounded to four significant digits). */
export function seriesOf(chain: ChainFile, shownM?: number): ChainSeries {
  const out: ChainSeries = {};
  const sig = (v: number) => (v ? Number(v.toPrecision(4)) : v);
  // the monthly strip ends with the explorers' last offered month (meta.shown)
  const upTo = (m: NonNullable<ChainFile['stages'][number]['monthly']>) => {
    const n = shownM == null ? m.t.length : m.t.filter((x) => x <= shownM).length;
    return { t: m.t.slice(0, n), world: m.world.slice(0, n).map(sig), cmp: m.cmp ? m.cmp.slice(0, n) : null };
  };
  for (const s of chain.stages) {
    out[s.key] = {
      hhi: chain.years.map((y) => {
        const v = s.years[String(y)];
        return v && v.world > 0 && v.hhi != null ? Math.round(v.hhi * 10000) / 10000 : null;
      }),
      m: s.monthly && s.monthly.t.length ? upTo(s.monthly) : null,
    };
  }
  return out;
}

/* The Trail's default products ------------------------------------------------------------------------------- */

function reachable(stages: StageModel[], from: string): Set<string> {
  const by = new Map(stages.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const queue = [...(by.get(from)?.feeds ?? [])];
  while (queue.length) {
    const k = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push(...(by.get(k)?.feeds ?? []));
  }
  return seen;
}

/** One product per rung for the Trail: the chokepoint (or the largest stage) and the stages that connect to it
 *  through the feeds, the largest where there is a choice. Feedstocks and side inputs are never the default.
 *  `n` is the ladder's length. */
export function mainLine(stages: StageModel[], slice: YearSlice, anchorKey: string | null, n: number): Record<number, string | null> {
  const world = (k: string) => slice[k]?.world ?? 0;
  const eligible = stages.filter((s) => s.role === null && world(s.key) > 0);
  const largest = (xs: StageModel[]) => (xs.length ? xs.reduce((a, b) => (world(b.key) > world(a.key) ? b : a)).key : null);
  const picks: Record<number, string | null> = Object.fromEntries(rungs(n).map((k) => [k, null]));
  const anchor = eligible.find((s) => s.key === anchorKey) ?? eligible.find((s) => s.key === largest(eligible));
  if (!anchor) return picks;
  picks[anchor.stage] = anchor.key;
  const reach = new Map(stages.map((s) => [s.key, reachable(stages, s.key)]));
  const picked = () => Object.values(picks).filter((k): k is string => !!k);

  for (let k = anchor.stage - 1; k >= 1; k--) {
    const here = eligible.filter((s) => s.stage === k);
    let m = k + 1;
    while (m <= n && !picks[m]) m++;
    const target = picks[m];
    const direct = here.filter((s) => target && reach.get(s.key)!.has(target));
    const any = here.filter((s) => picked().some((x) => reach.get(s.key)!.has(x)));
    picks[k] = largest(direct.length ? direct : any.length ? any : here);
  }
  for (let k = anchor.stage + 1; k <= n; k++) {
    const here = eligible.filter((s) => s.stage === k);
    let m = k - 1;
    while (m >= 1 && !picks[m]) m--;
    const source = picks[m];
    const direct = here.filter((s) => source && reach.get(source)!.has(s.key));
    const any = here.filter((s) => picked().some((x) => reach.get(x)!.has(s.key)));
    picks[k] = largest(direct.length ? direct : any.length ? any : here);
  }
  return picks;
}

/* Two-way traders and a focus economy ------------------------------------------------------------------------ */

/** The two-way row of an economy at a stage-year, or null. */
export function twoWayOf(y: StageYear | null | undefined, i: number): TwoWayRow | null {
  return y?.two_way?.find((r) => r.i === i) ?? null;
}

/** The two-way traders among a stage's top five exporters or importers, largest trade first (the economies the
 *  stage's sentence names). */
export function twoWayTop5(y: StageYear | null | undefined): TwoWayRow[] {
  if (!y?.two_way?.length) return [];
  const top = new Set([...y.top_exporters, ...y.top_importers].map(([i]) => i));
  return y.two_way.filter((r) => top.has(r.i));
}

export interface TwoWayBest { key: string; i: number; gl: number }

/** The chain's most two-way stage in a year: among the two-way traders that are top-five exporters or importers of
 *  a stage (feedstocks left out), the highest Grubel–Lloyd index. */
export function mostTwoWay(stages: { key: string; role: string | null }[], slice: YearSlice): TwoWayBest | null {
  let best: TwoWayBest | null = null;
  for (const s of stages) {
    if (s.role === 'feedstock') continue;
    for (const r of twoWayTop5(slice[s.key])) if (!best || r.gl > best.gl) best = { key: s.key, i: r.i, gl: r.gl };
  }
  return best;
}

/** A focus economy's place at one stage, from the econ file: shares, ranks among the economies trading the stage
 *  (1 = largest; null when it has no exports or imports), top supplier, unit values. Null when it did not trade it. */
export function econPlace(econ: EconFile | null, key: string, i: number): EconPlace | null {
  const rows = econ?.stages[key];
  if (!rows) return null;
  const c = Object.fromEntries(econ!.cols.map((k, j) => [k, j]));
  const me = rows.find((r) => r[c.i] === i);
  if (!me) return null;
  const x = (me[c.x] as number) ?? 0, m = (me[c.m] as number) ?? 0;
  const rank = (col: number, v: number) => (v > 0 ? 1 + rows.filter((r) => ((r[col] as number) ?? 0) > v).length : null);
  const ts = me[c.ts] as number | null;
  return {
    x, m, xRank: rank(c.x, x), mRank: rank(c.m, m),
    ts: ts != null && ts >= 0 ? ts : null, tss: (me[c.tss] as number | null) ?? null,
    ux: (me[c.ux] as number | null) ?? null, um: (me[c.um] as number | null) ?? null,
  };
}

/** The focus economy of a page: ?focus=ISO3, when the economy exists; else null (no focus by default). */
export function focusFrom(search: string, nodes: [string, string][]): string | null {
  const v = new URLSearchParams(search).get('focus')?.toUpperCase() ?? '';
  return /^[A-Z0-9_]{3}$/.test(v) && nodes.some((n) => n[0] === v) ? v : null;
}

/* CSV ---------------------------------------------------------------------------------------------------------- */

/** CSV text with a UTF-8 BOM, headers in the page language, numbers unformatted. */
export function csvText(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** YYYYMM -> "2024-12" for tables and CSV. */
export function monthKey(t: number): string {
  return `${Math.floor(t / 100)}-${String(t % 100).padStart(2, '0')}`;
}

/** The explorer at this product and year, with the focus economy selected when there is one. */
export function exploreHref(lang: Lang, product: string, year: number, focus?: string | null): string {
  return `/${lang}/explore${focus ? `?focus=${focus}` : ''}#p=${product}&t=${year}`;
}
