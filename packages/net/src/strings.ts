import type { Lang } from '@larch/ui/format';

// The words the network views and the chart kit write by themselves, in both editions (glossary: design book
// 06-Bilingual). Page copy lives in apps/web/lib/strings/; these are only what a component says on its own.
const S = {
  exports: { en: 'Exports', ko: '수출' },
  imports: { en: 'Imports', ko: '수입' },
  // net exports: exports as partners record them (CIF), imports as the economy records them
  net: { en: 'Net: exports as partners record them (CIF) − imports as the economy records them', ko: '순수출: 상대국이 기록한 수출(CIF) − 해당 경제가 기록한 수입' },
  gl: { en: 'Two-way index (GL)', ko: '양방향 지수(GL)' },
  uvExports: { en: 'Exports, unit value', ko: '수출 단가' },
  uvImports: { en: 'Imports, unit value', ko: '수입 단가' },
  uvFlow: { en: 'Unit value', ko: '단가' },
  reportGap: { en: 'Gap between the two reports', ko: '두 신고의 차이' },
  disagree: { en: 'Reports disagree', ko: '신고 불일치' },
  disagreeNote: { en: 'The importer’s and the exporter’s reports differ by more than half; the map draws one of them.', ko: '수입국과 수출국의 신고가 절반 넘게 다릅니다. 지도는 그 가운데 하나를 표시합니다.' },
  twoWay: { en: 'two-way', ko: '양방향' },
  total: { en: 'Total trade', ko: '총교역' },
  shareWorld: { en: 'Share of world trade', ko: '세계 교역 비중' },
  rankTrade: { en: '#{n} by trade', ko: '교역 {n}위' },
  topSupplier: { en: 'From {name}, its top supplier', ko: '최대 공급국 {name} 비중' },
  changeVs: { en: 'Change vs {base}', ko: '{base} 대비' },
  isNew: { en: 'new', ko: '신규' },
  atLeast: { en: 'at least {v}', ko: '{v} 이상' },
  notInBase: { en: 'below the base backbone', ko: '기준 시점 주요 흐름 밖' },
  chokepoint: { en: 'Chokepoint', ko: '병목' },
  chokepointNote: { en: 'Supplies more than half of world exports', ko: '세계 수출의 절반 이상을 공급' },
  didNotReport: { en: 'Did not report in {t}: values from partners’ reports', ko: '{t} 미신고: 상대국 신고로 집계' },
  drawn: { en: 'Drawn value', ko: '표시 값' },
  importerRep: { en: 'Importer’s report', ko: '수입국 신고' },
  exporterRep: { en: 'Exporter’s report', ko: '수출국 신고' },
  mirrorGap: { en: 'Mirror ratio', ko: '거울 비율' },
  rankOut: { en: 'Rank among {s}’s destinations', ko: '{s}의 수출 대상 순위' },
  rankIn: { en: 'Rank among {t}’s suppliers', ko: '{t}의 공급국 순위' },
  ruleMirror: { en: 'mirror rule', ko: '상대국 통계 규칙' },
  ruleImporter: { en: 'importer-reported', ko: '수입국 신고' },
  ruleExporter: { en: 'exporter-reported', ko: '수출국 신고' },
  fromImporter: { en: 'importer’s report', ko: '수입국 신고' },
  fromExporter: { en: 'exporter’s report', ko: '수출국 신고' },
  mapLabel: { en: 'Trade network: economies as circles, flows as curved arrows from exporter to importer', ko: '교역 네트워크: 원은 경제권, 곡선 화살표는 수출국에서 수입국으로 가는 교역 흐름' },
  loading: { en: 'Loading the network…', ko: '네트워크를 불러오는 중…' },
  loadFailed: { en: 'Could not load the network.', ko: '네트워크를 불러오지 못했습니다.' },
  noData: { en: 'No data for this period.', ko: '이 시점의 자료가 없습니다.' },
  partial: { en: 'partial', ko: '집계 중' },
  partialFiled: { en: 'partial · {v} filed', ko: '집계 중 · {v} 신고' },
  incomplete: { en: 'incomplete, {v}', ko: '불완전, {v}' },
  completeness: { en: 'Share of usual trade present', ko: '평소 교역 중 집계된 비중' },
  base: { en: 'base', ko: '기준' },
  codeBegins: { en: 'code begins {t}', ko: '{t}년 코드 신설' },
  source: { en: 'Source', ko: '자료' },
  showTable: { en: 'Show as table', ko: '표로 보기' },
  hideTable: { en: 'Hide table', ko: '표 닫기' },
  csv: { en: 'Download CSV', ko: 'CSV 내려받기' },
  period: { en: 'Period', ko: '시점' },
  value: { en: 'Value', ko: '값' },
  other: { en: 'Other', ko: '기타' },
  others: { en: 'Others', ko: '기타' },
  economy: { en: 'Economy', ko: '경제권' },
  exporter: { en: 'Exporter', ko: '수출국' },
  importer: { en: 'Importer', ko: '수입국' },
  share: { en: 'Share', ko: '비중' },
  rank: { en: 'Rank', ko: '순위' },
  change: { en: 'Change', ko: '변화' },
  changePp: { en: 'Change, pp', ko: '변화(%p)' },
  gap: { en: 'Gap', ko: '차이' },
  index: { en: 'Index, {base} = 100', ko: '지수, {base} = 100' },
  moved: { en: 'Moved', ko: '변동' },
  status_pass: { en: 'Pass', ko: '통과' },
  status_watch: { en: 'Watch', ko: '주의' },
  status_fail: { en: 'Fail', ko: '실패' },
  status_info: { en: 'Context', ko: '참고' },
  'status_not run': { en: 'Not run', ko: '미실행' },
  fit: { en: 'Fit map', ko: '지도 맞춤' },
  lensL: { en: '12-month sum', ko: '12개월 합계' },
  lensM: { en: '3-month sum against a year earlier', ko: '3개월 합계, 전년비' },
  lensS: { en: 'single month (January and February together)', ko: '단월(1·2월 합산)' },
  window: { en: '{w}-month sum', ko: '{w}개월 합계' },
  estimate: { en: 'Estimate', ko: '추정' },
  est0: { en: 'reported', ko: '신고' },
  est1: { en: 'benchmarked to the annual file', ko: '연간 신고에 맞춘 추정' },
  est2: { en: 'spliced from the partner’s report', ko: '상대국 신고로 이은 추정' },
  // "spliced on 2024": the anchor's year of a splice; partner-only is times 1.06
  // Comtrade partner 490 (meta.nodes[].nes), wherever it is named in a ranking, tooltip or chain page
  nesNote: { en: 'UN Comtrade’s ‘Other Asia, not elsewhere specified’: most importers book their trade with Taiwan here; Gulf exporters book unnamed Asian destinations here.', ko: 'UN Comtrade의 기타 아시아(미분류, Other Asia, not elsewhere specified) 항목입니다. 대부분의 수입국은 대만과의 교역을 이 항목에 계상합니다. 걸프 지역 수출국은 행선지를 밝히지 않은 아시아 수출을 이 항목에 계상합니다.' },
  est2On: { en: 'spliced from the partner’s report on {year}', ko: '{year}년 상대국 보고 기준 접합' },
  est3: { en: 'partner’s report times 1.06 (CIF/FOB)', ko: '상대국 보고 × 1.06(CIF/FOB)' },
  est4: { en: 'interpolated: the reporter sent no row of the product that month', ko: '보간값입니다. 보고국이 그달 이 품목 자료를 보고하지 않았습니다.' },
  estNote: { en: 'Not a reported figure: the importer did not file every month of the window', ko: '신고된 수치가 아닙니다. 수입국이 이 기간의 모든 달을 신고하지 않았습니다.' },
  diverge: { en: 'Reports diverge', ko: '신고 관계 이탈' },
  divergeNote: { en: '12-month mirror ratio {r}, outside {lo}–{hi} (the median of the 36 months before ± {k} MAD, at least ±10%). Values are not changed.', ko: '12개월 거울 비율 {r}이 직전 36개월 범위({lo}–{hi}, 중앙값 ± {k} MAD, 최소 ±10%)를 벗어났습니다. 값은 수정하지 않습니다.' },
  divergeShort: { en: 'The 12-month mirror ratio left its 36-month band. Values are not changed.', ko: '12개월 거울 비율이 직전 36개월 범위를 벗어났습니다. 값은 수정하지 않습니다.' },
} satisfies Record<string, Record<Lang, string>>;

export type NetKey = keyof typeof S;

/** A component's own words: s(lang, 'exports'), with {name} placeholders filled from vars. */
export function s(lang: Lang, key: NetKey, vars?: Record<string, string | number>): string {
  const x = S[key][lang];
  return vars ? x.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : x;
}

/** The flow rule in words, as the source lines name it. */
export function ruleName(lang: Lang, rule: 'mirror' | 'importer' | 'exporter'): string {
  return s(lang, rule === 'mirror' ? 'ruleMirror' : rule === 'importer' ? 'ruleImporter' : 'ruleExporter');
}

/** An estimate code in words (monthly explorer); a splice names its anchor's year when given ("spliced … on 2024"). */
export function estName(lang: Lang, est: number, ky?: number | null): string {
  if (est === 2 && ky) return s(lang, 'est2On', { year: ky });
  return s(lang, (['est0', 'est1', 'est2', 'est3', 'est4'] as const)[Math.max(0, Math.min(4, est))]);
}

/** A divergence flag in words, with its numbers when they are loaded. */
export function divergeText(lang: Lang, e: { dv: number; div?: { r: number; med: number; mad: number; k: number; floor?: number } | null }): string {
  if (!e.dv) return '';
  const d = e.div;
  if (!d) return `${s(lang, 'diverge')}: ${s(lang, 'divergeShort')}`;
  const f = (x: number) => x.toFixed(2);
  const half = Math.max(d.k * d.mad, (d.floor ?? 0) * d.med);
  return `${s(lang, 'diverge')}: ${s(lang, 'divergeNote', { r: f(d.r), lo: f(d.med - half), hi: f(d.med + half), k: d.k })}`;
}

/** A monthly lens in words. */
export function lensName(lang: Lang, lens: 'L' | 'M' | 'S'): string {
  return s(lang, lens === 'L' ? 'lensL' : lens === 'M' ? 'lensM' : 'lensS');
}
