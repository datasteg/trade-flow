// Small phrases shared by the tooltips, cards and tables.
import { formatDate, formatMonth, formatNumber, formatPercentChange, formatUSD, type Lang } from '@larch/ui/format';
import type { Growth } from './decode';
import type { Meta, MetaSupplement } from './types';
import { s } from './strings';

/** A change against the base in words: "+12%", "new", "at least +40%", or "below the base backbone". */
export function growthText(g: Growth | null, lang: Lang): string {
  if (!g) return '–';
  if (g.kind === 'new') return s(lang, 'isNew');
  if (g.kind === 'atLeast') return s(lang, 'atLeast', { v: formatPercentChange(g.g, lang, { decimals: 0 }) });
  if (g.kind === 'unknown' || g.g == null) return s(lang, 'notInBase');
  return formatPercentChange(g.g, lang, { decimals: Math.abs(g.g) < 0.1 ? 1 : 0 });
}

// The monthly source line names the one monthly rule. Korean waits for ko-refine
// (an empty ko is the convention for "waiting for Korean"; the page shows it empty until then).
const SRC_M = {
  en: 'Source: UN Comtrade, monthly data, {level}; {w}-month windows; each flow the importer’s report where it filed the month, else the exporter’s report spliced to the importer’s level, benchmarked to the importer’s annual file or times 1.06 (CIF/FOB); a flow counts only when positive in every month of the window.',
  ko: '자료: UN Comtrade 월간 자료, {level}. {w}개월 창 기준입니다. 각 교역 흐름은 수입국이 그달 보고했으면 수입국 보고를 씁니다. 보고하지 않았으면 수출국 보고를 수입국 수준에 맞춰 접합하고, 수입국 연간 자료에 맞춰 조정하거나 1.06을 곱합니다(CIF/FOB). 창 안의 모든 달에 양(+)의 값인 흐름만 집계합니다.',
} as const;
// The annual mirror rule, stated with its CIF/FOB factor.
const SRC_A_MIRROR = {
  en: 'Source: UN Comtrade, Final data, {level}; mirror rule (the importer’s report where it filed the year, else the exporter’s times 1.06, CIF/FOB).',
  ko: '자료: UN Comtrade 확정 자료, {level}. 거울 규칙을 적용합니다. 수입국이 그해 보고했으면 수입국 보고를 쓰고, 보고하지 않았으면 수출국 보고에 1.06을 곱합니다(CIF/FOB).',
} as const;

/** The source line under a map or chart: data, flow rule and window, as Larch writes it.
 *  EN "Source: UN Comtrade, Final data, HS6; mirror rule (…)." / months: the one monthly rule and the window length
 *  (`w`, else the lens's: L 12 months, M 3). */
export function sourceLine(lang: Lang, o: { freq: 'A' | 'M'; rule?: 'mirror' | 'importer' | 'exporter'; lens?: 'L' | 'M' | 'S' | null; w?: number | null; total?: boolean }): string {
  const level = o.total ? (lang === 'ko' ? '전체 상품' : 'all goods') : (lang === 'ko' ? 'HS 6단위' : 'HS6');
  if (o.freq === 'A') {
    const rule = o.rule ?? 'mirror';
    if (rule === 'mirror') return SRC_A_MIRROR[lang].replace('{level}', level);
    if (lang === 'ko') return `자료: UN Comtrade 확정치(${level}), ${rule === 'importer' ? '수입국 신고' : '수출국 신고'}.`;
    return `Source: UN Comtrade, Final data, ${level}; ${rule === 'importer' ? 'importer-reported' : 'exporter-reported'}.`;
  }
  const w = o.w ?? (o.lens === 'M' ? 3 : 12);
  return SRC_M[lang].replace('{level}', level).replace('{w}', String(w));
}

/** A run of months: "Jan 2000–Dec 2012", "Jan–Sep 2026" / "2000년 1월~2012년 12월", "2026년 1~9월". */
export function monthRange(a: number, b: number, lang: Lang): string {
  const [ya, ma, yb, mb] = [Math.floor(a / 100), a % 100, Math.floor(b / 100), b % 100];
  if (a === b) return formatMonth(ya, ma, lang);
  if (ya === yb) return lang === 'ko' ? `${ya}년 ${ma}~${mb}월` : `${formatMonth(ya, ma, lang).split(' ')[0]}–${formatMonth(yb, mb, lang)}`;
  return lang === 'ko' ? `${formatMonth(ya, ma, lang)}~${formatMonth(yb, mb, lang)}` : `${formatMonth(ya, ma, lang)}–${formatMonth(yb, mb, lang)}`;
}

/** The supplements' runs of months that fall in [from, to] (YYYYMM), each clipped to it. */
export function supplementRuns(sup: MetaSupplement, from: number, to: number): [number, number][] {
  return (sup.ranges ?? [sup.M]).filter(([a, b]) => a <= to && b >= from).map(([a, b]) => [Math.max(a, from), Math.min(b, to)]);
}

/** The citation of a supplement, for any monthly chart, table or map whose
 *  months [from, to] reach a supplement's months; "" when none does. EN "Korea, Jan 2000–Dec 2012 and Jan–Sep 2026:
 *  Korea Customs Service, trade by item and country (data.go.kr), fetched 31 Oct 2026." */
export function supplementLine(lang: Lang, meta: Pick<Meta, 'supplements' | 'nodes'>, from: number, to: number): string {
  return (meta.supplements ?? []).map((sup) => {
    const runs = supplementRuns(sup, from, to);
    if (!runs.length) return '';
    const who = meta.nodes[sup.node]?.[lang] ?? '';
    const when = runs.map(([a, b]) => monthRange(a, b, lang)).join(lang === 'ko' ? ', ' : ' and ');
    // the preliminary months these runs reach (the source may still revise them)
    const pf = sup.preliminary_from;
    const pre = pf != null ? runs.filter(([, b]) => b >= pf).map(([a, b]) => monthRange(Math.max(a, pf), b, lang)) : [];
    const tail = pre.length ? (lang === 'ko' ? ` ${pre.join(', ')}은 잠정치입니다.` : ` ${pre.join(' and ')} preliminary.`) : '';
    return lang === 'ko'
      ? `${who} ${when}: ${sup.ko}, ${formatDate(sup.fetched, lang)} 수집.${tail}`
      : `${who}, ${when}: ${sup.en}, fetched ${formatDate(sup.fetched, lang)}.${tail}`;
  }).filter(Boolean).join(' ');
}

/** YYYYMM as "2026-08". */
const ym = (p: number) => `${Math.floor(p / 100)}-${String(p % 100).padStart(2, '0')}`;

/** An economy's months filled from a supplement, for its card: EN "Filled from KCS: 2000-01–2012-12, 2026-01–2026-09
 *  (preliminary from 2026-08)"; "" when the economy has none. */
export function supplementFill(lang: Lang, meta: Pick<Meta, 'supplements'>, node: number): string {
  const sup = (meta.supplements ?? []).find((x) => x.node === node);
  if (!sup) return '';
  const runs = (sup.ranges ?? [sup.M]).map(([a, b]) => `${ym(a)}–${ym(b)}`).join(', ');
  const pre = sup.preliminary_from != null ? (lang === 'ko' ? ` (${ym(sup.preliminary_from)}부터 잠정치)` : ` (preliminary from ${ym(sup.preliminary_from)})`) : '';
  return lang === 'ko' ? `월별 자료 중 ${sup.source}(관세청)로 채운 달: ${runs}${pre}` : `Monthly records filled from ${sup.source} (Korea Customs Service): ${runs}${pre}`;
}

/** Unit value, as the chain pages write it: "$0.35/kg", "$14.2/kg" / "kg당 14.2달러"; two decimals below $1, one
 *  below $1,000, none above. */
export function formatUV(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const n = formatNumber(v, lang, { decimals: v < 1 ? 2 : v < 1000 ? 1 : 0 });
  return lang === 'ko' ? `kg당 ${n}달러` : `$${n}/kg`;
}

/** Net trade with its sign: "+$742m" (net exporter) / "−$742m" (net importer). */
export function formatNet(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const a = formatUSD(Math.abs(v), lang);
  return v > 0 ? `+${a}` : v < 0 ? `\u2212${a}` : a;
}
