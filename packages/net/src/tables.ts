// "Show as table": every drawn flow (exporter, importer, value, rule, ranks, unit value, the gap between its two
// reports, change) and every drawn economy (exports, imports, net, two-way index, unit values, share, rank), with the
// same numbers as the map. Derived values only: a value is the flow's share of world trade × the world total;
// the two original reports stay out of the CSV (the gap is a ratio of them).
import { formatPeriod, formatShare, formatUSD, type Lang } from '@larch/ui/format';
import type { ChartTable } from './charts/common';
import { growth } from './decode';
import { formatNet, formatUV, growthText } from './words';
import type { SceneEdge, SceneNode } from './scene';
import { divergeText, estName, s } from './strings';
import type { BaseCompare } from './decode';
import type { Meta, Snap } from './types';
import { nodeName } from './util';

const T = {
  value: { en: 'Value, USD', ko: '금액(달러)' },
  share: { en: 'Share of world trade', ko: '세계 교역 비중' },
  rule: { en: 'Drawn from', ko: '표시 기준' },
  ro: { en: 'Rank, exporter’s destinations', ko: '수출국의 대상 순위' },
  ri: { en: 'Rank, importer’s suppliers', ko: '수입국의 공급국 순위' },
  change: { en: 'Change vs {b}', ko: '{b} 대비 변화' },
  iso: { en: 'ISO3', ko: 'ISO3' },
  exports: { en: 'Exports, USD', ko: '수출(달러)' },
  imports: { en: 'Imports, USD', ko: '수입(달러)' },
  rank: { en: 'Rank by trade', ko: '교역 순위' },
  net: { en: 'Net, USD: exports as partners record them (CIF) − imports as the economy records them', ko: '순수출(미 달러)은 교역상대국이 집계한 수출(CIF)에서 해당 경제가 집계한 수입을 뺀 값입니다.' },
  gl: { en: 'Two-way index (GL)', ko: '양방향 지수(GL)' },
  ux: { en: 'Exports, $/kg', ko: '수출 단가(달러/kg)' },
  um: { en: 'Imports, $/kg', ko: '수입 단가(달러/kg)' },
  uv: { en: 'Unit value, $/kg', ko: '단가(달러/kg)' },
  asym: { en: 'Gap between reports', ko: '신고 차이' },
  flag: { en: 'Note', ko: '비고' },
  disagree: { en: '⚠ reports disagree', ko: '⚠ 신고 불일치' },
  reported: { en: 'Reported', ko: '신고 여부' },
  yes: { en: 'yes', ko: '예' },
  no: { en: 'no', ko: '아니요' },
  isNew: { en: 'new', ko: '신규' },
} as const;
const tt = (lang: Lang, k: keyof typeof T, vars?: Record<string, string>) =>
  (T[k][lang] as string).replace(/\{(\w+)\}/g, (_m, x: string) => vars?.[x] ?? '');

/** The drawn flows as a table. */
export function flowsTable(meta: Meta, lang: Lang, snap: Snap, edges: SceneEdge[], base: BaseCompare | null): ChartTable {
  const cols: ChartTable['columns'] = [
    { key: 's', label: s(lang, 'exporter') },
    { key: 't', label: s(lang, 'importer') },
    { key: 'v', label: tt(lang, 'value'), num: true },
    { key: 'w', label: tt(lang, 'share'), num: true },
    { key: 'src', label: tt(lang, 'rule') },
    { key: 'ro', label: tt(lang, 'ro'), num: true },
    { key: 'ri', label: tt(lang, 'ri'), num: true },
    { key: 'asym', label: tt(lang, 'asym'), num: true },
    { key: 'flag', label: tt(lang, 'flag') },
  ];
  // unit values exist for annual chain stages only
  if (edges.some((se) => se.e.uv != null)) cols.splice(4, 0, { key: 'uv', label: tt(lang, 'uv'), num: true });
  // the monthly explorer: estimate codes
  if (edges.some((se) => se.e.est != null)) cols.splice(cols.findIndex((c) => c.key === 'src') + 1, 0, { key: 'est', label: s(lang, 'estimate') });
  if (base) cols.push({ key: 'g', label: tt(lang, 'change', { b: formatPeriod(base.t, lang) }), num: true });
  const rows = [...edges].sort((a, b) => b.e.w - a.e.w).map((se) => {
    const e = se.e;
    const si = meta.nodes[e.s]?.id ?? '', ti = meta.nodes[e.t]?.id ?? '';
    const g = base ? growth(e.value, base.edge(e)) : null;
    const cells: Record<string, string> = {
      s: `${nodeName(meta, e.s, lang)} (${si})`, t: `${nodeName(meta, e.t, lang)} (${ti})`,
      v: formatUSD(e.value, lang), w: formatShare(e.w, lang, { decimals: 2 }),
      src: s(lang, e.src === 1 ? 'fromImporter' : 'fromExporter'), ro: `#${e.ro}`, ri: `#${e.ri}`,
      uv: formatUV(e.uv, lang), asym: e.asym == null ? '–' : e.asym.toFixed(2),
      flag: [e.disagree ? tt(lang, 'disagree') : '', e.dv ? `⚠ ${divergeText(lang, e)}` : ''].filter(Boolean).join(' · '),
      est: e.est == null ? '' : estName(lang, e.est, e.ky),
    };
    if (e.est) cells.src = '–';
    const raw: Record<string, string | number | null> = {
      s: si, t: ti, v: Math.round(e.value), w: e.w, src: e.est ? 'estimate' : e.src === 1 ? 'importer' : 'exporter', ro: e.ro, ri: e.ri,
      uv: e.uv, asym: e.asym == null ? null : Math.round(e.asym * 1000) / 1000,
      flag: [e.disagree ? 'reports disagree' : '', e.dv ? `reports diverge (${e.dv === 1 ? 'below' : 'above'} band)` : ''].filter(Boolean).join('; '),
      est: e.est == null ? null : estName('en', e.est, e.ky),
    };
    if (g) { cells.g = g.kind === 'new' ? tt(lang, 'isNew') : growthText(g, lang); raw.g = g.kind === 'new' ? 'new' : g.kind === 'value' ? g.g : null; }
    return { id: se.key, cells, raw };
  });
  return { columns: cols, rows };
}

/** The drawn economies as a table; `focus` (ISO3) carries the trail marker. */
export function nodesTable(meta: Meta, lang: Lang, snap: Snap, nodes: SceneNode[], focus: string | null = null): ChartTable {
  const units = nodes.some((d) => d.n.ux != null || d.n.um != null);
  const gl = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
  return {
    columns: [
      { key: 'who', label: s(lang, 'economy') },
      { key: 'iso', label: tt(lang, 'iso') },
      { key: 'x', label: tt(lang, 'exports'), num: true },
      { key: 'm', label: tt(lang, 'imports'), num: true },
      { key: 'net', label: tt(lang, 'net'), num: true },
      { key: 'gl', label: tt(lang, 'gl'), num: true },
      ...(units ? [{ key: 'ux', label: tt(lang, 'ux'), num: true }, { key: 'um', label: tt(lang, 'um'), num: true }] : []),
      { key: 'sh', label: tt(lang, 'share'), num: true },
      { key: 'rk', label: tt(lang, 'rank'), num: true },
      { key: 'rep', label: tt(lang, 'reported') },
    ],
    rows: [...nodes].sort((a, b) => a.n.rankTotal - b.n.rankTotal).map((d) => {
      const n = d.n;
      return {
        id: n.id, focus: n.id === focus,
        cells: {
          who: nodeName(meta, n.i, lang), iso: n.id, x: formatUSD(n.exports, lang), m: formatUSD(n.imports, lang),
          net: formatNet(n.net, lang), gl: n.gl == null ? '–' : n.gl.toFixed(2), ux: formatUV(n.ux, lang), um: formatUV(n.um, lang),
          sh: formatShare(n.share, lang, { decimals: 2 }), rk: `#${n.rankTotal}`, rep: tt(lang, n.reported ? 'yes' : 'no'),
        },
        raw: {
          who: nodeName(meta, n.i, lang), iso: n.id, x: Math.round(n.exports), m: Math.round(n.imports), net: Math.round(n.net),
          gl: gl(n.gl), ux: n.ux, um: n.um, sh: n.share, rk: n.rankTotal, rep: n.reported ? 1 : 0,
        },
      };
    }),
  };
}
