'use client';
// The two small charts under each stage, drawn with the chart kit's Strip (@larch/net): the exporter HHI by year,
// with the 0.25 line of high concentration as a second, flat line, and world trade over the 12-month windows of the
// one monthly rule (build_windows.py, the monthly explorer's), on the windows' end months. One axis each, the selected year marked, partial periods under the band; "Show as table" and the CSV
// come with the Strip. With a focus economy, a third: its own exports and imports (FocusStrip).
import { useEffect, useState } from 'react';
import { SHOWN_MIN, StripChart, addMonths, loadMeta, loadNodeSeries, sourceLine, supplementLine, type Meta, type NodesBlock } from '@larch/net';
import { formatNumber, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import { fmtUSD, HHI_HIGH, stageToken } from './model';

export function HhiStrip({ lang, product, stage, levels, years, hhi, year, chokeYears, complete, coverage, first, fileStem }: {
  lang: Lang;
  product: string;
  /** The rung and the ladder's length (the line takes the rung's colour). */
  stage: number;
  levels: number;
  years: number[];
  hhi: (number | null)[];
  year: number;
  chokeYears: number[];
  /** meta.complete.A: later years are partial. */
  complete: number;
  coverage: Record<string, number>;
  /** The year the stage's code begins (first year with data). */
  first: number | null;
  fileStem: string;
}) {
  const last = years[years.length - 1];
  return (
    <StripChart
      lang={lang}
      className="ch-strip"
      title={t(lang, 'chains.hhiChart.title', { first: years[0], last })}
      label={t(lang, 'chains.hhiChart.aria', { product, first: years[0], last, year, value: hhi[years.indexOf(year)]?.toFixed(2) ?? '–' })}
      periods={years}
      series={[
        { key: 'hhi', label: t(lang, 'chains.col.hhi'), colour: stageToken(stage, levels), values: hhi },
        { key: 'high', label: t(lang, 'chains.hhiChart.threshold'), colour: 'viz-context', values: years.map(() => HHI_HIGH) },
      ]}
      format={(v) => v.toFixed(2)}
      current={year}
      complete={complete}
      coverage={coverage}
      codeBegins={first}
      zero
      height={150}
      csvName={`${fileStem}-hhi`}
      source={sourceLine(lang, { freq: 'A' })}
    >
      {chokeYears.length ? (
        <p className="ch-strip__note"><span className="ch-strip__choke" aria-hidden />{t(lang, 'chains.hhiChart.chokeYears', { years: chokeYears.join(', ') })}</p>
      ) : null}
    </StripChart>
  );
}

/** Short y-axis labels in one unit for the whole axis: "$1.5tn", "$60bn", "$4.5bn", "$600m" / "1.5조", "600억". */
function axisUSD(lang: Lang, max: number): (v: number) => string {
  const n = (v: number, d: number) => formatNumber(v, lang, { decimals: d });
  if (lang === 'ko') {
    if (max >= 1e12) return (v) => (v ? `${n(v / 1e12, 1)}조` : '0');
    if (max >= 1e8) return (v) => (v ? `${n(v / 1e8, 0)}억` : '0');
    return (v) => (v ? `${n(v / 1e4, 0)}만` : '0');
  }
  if (max >= 1e12) return (v) => (v ? `$${n(v / 1e12, 1)}tn` : '0');
  if (max >= 1e11) return (v) => (v ? `$${n(v / 1e9, 0)}bn` : '0');
  if (max >= 1e9) return (v) => (v ? `$${n(v / 1e9, 1)}bn` : '0');
  return (v) => (v ? `$${n(v / 1e6, 0)}m` : '0');
}

export function MonthlyStrip({ lang, product, stage, levels, series, complete, coverage, year, fileStem, cite }: {
  lang: Lang;
  product: string;
  stage: number;
  levels: number;
  series: { t: number[]; world: number[]; cmp: (number | null)[] | null } | null;
  /** The customs citation for these months. */
  cite?: string;
  /** meta.complete.M (YYYYMM). */
  complete: number;
  coverage: Record<string, number>;
  year: number;
  fileStem: string;
}) {
  if (!series || series.t.length < 2) return <p className="lr-caption ch-strip__none">{t(lang, 'chains.m12Chart.none')}</p>;
  const dec = year * 100 + 12;
  return (
    <StripChart
      lang={lang}
      className="ch-strip"
      title={t(lang, 'chains.m12Chart.title')}
      label={t(lang, 'chains.m12Chart.aria', { product, first: String(series.t[0]), last: String(series.t[series.t.length - 1]) })}
      periods={series.t}
      series={[{ key: 'world', label: t(lang, 'chains.col.m12'), colour: stageToken(stage, levels), values: series.world }]}
      format={(v) => fmtUSD(v, lang)}
      tickFormat={axisUSD(lang, Math.max(...series.world))}
      current={series.t.includes(dec) ? dec : null}
      complete={complete}
      coverage={coverage}
      zero
      height={150}
      csvName={`${fileStem}-12m`}
      completeness={series.cmp ?? undefined}
      minComplete={SHOWN_MIN}
      source={sourceLine(lang, { freq: 'M', w: 12 }) + (cite ? ` ${cite}` : '')}
    >
      <p className="ch-strip__note">{t(lang, 'chains.m12Chart.rule')}</p>
    </StripChart>
  );
}

/** The focus economy's own exports and imports of the stage (the 12-month windows of nodes/W/<stage>.json). The
 *  world strip stops at meta.shown.M; an economy whose latest months come from a supplement (Korea, from the customs
 *  service) is drawn to the supplement's last month, its preliminary months dashed. */
export function FocusStrip({ lang, product, productName, focus, stage, levels, shownMonth, year, fileStem }: {
  lang: Lang;
  /** The stage's product id. */
  product: string;
  productName: string;
  focus: { i: number; iso: string; name: string };
  stage: number;
  levels: number;
  /** meta.shown.M: where the world series stop. */
  shownMonth: number | null;
  year: number;
  fileStem: string;
}) {
  const [data, setData] = useState<{ meta: Meta; block: NodesBlock | null } | null | 'error'>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    loadMeta().then((meta) => loadNodeSeries(meta, product, 'W').then((f) => { if (live) setData({ meta, block: ((f as Record<string, unknown> | null)?.['12'] as NodesBlock | undefined) ?? null }); }))
      .catch(() => { if (live) setData('error'); });
    return () => { live = false; };
  }, [product]);
  if (data === null) return <p className="lr-caption ch-strip__none">{t(lang, 'chains.focus.loading', { name: focus.name })}</p>;
  if (data === 'error' || !data.block) return <p className="lr-caption ch-strip__none">{t(lang, 'chains.m12Chart.none')}</p>;
  const { meta, block } = data;
  const k = block.ids.indexOf(focus.i);
  if (k < 0) return <p className="lr-caption ch-strip__none">{t(lang, 'chains.focusStrip.notListed', { name: focus.name, product: productName })}</p>;
  const sup = (meta.supplements ?? []).find((x) => x.node === focus.i);
  const end = sup ? Math.max(sup.M[1], shownMonth ?? 0) : (shownMonth ?? block.t[block.t.length - 1]);
  const keep = block.t.map((p, j) => (p <= end ? j : -1)).filter((j) => j >= 0);
  if (keep.length < 2) return <p className="lr-caption ch-strip__none">{t(lang, 'chains.m12Chart.none')}</p>;
  const periods = keep.map((j) => block.t[j]);
  const x = keep.map((j) => block.x[k][j]);
  const m = keep.map((j) => block.m[k][j]);
  const c = block.c ? keep.map((j) => block.c![k][j]) : undefined;
  const pre = sup?.preliminary_from != null && sup.preliminary_from <= end ? { from: sup.preliminary_from, label: t(lang, 'chains.focusStrip.prelim', { src: sup.source }) } : null;
  const cite = supplementLine(lang, meta, addMonths(periods[0], -11), periods[periods.length - 1]);
  const dec = year * 100 + 12;
  const max = Math.max(...x.concat(m).map((v) => v ?? 0));
  return (
    <StripChart
      lang={lang}
      className="ch-strip ch-strip--focus"
      title={t(lang, 'chains.focusStrip.title', { name: focus.name })}
      label={t(lang, 'chains.focusStrip.aria', { name: focus.name, product: productName, last: String(periods[periods.length - 1]) })}
      periods={periods}
      series={[
        { key: 'x', label: t(lang, 'chains.focusStrip.exports'), colour: stageToken(stage, levels), values: x },
        { key: 'm', label: t(lang, 'chains.focusStrip.imports'), colour: 'viz-context', values: m },
      ]}
      format={(v) => fmtUSD(v, lang)}
      tickFormat={axisUSD(lang, max)}
      current={periods.includes(dec) ? dec : null}
      zero
      height={150}
      csvName={`${fileStem}-${focus.iso.toLowerCase()}-12m`}
      completeness={c}
      prelim={pre}
      source={sourceLine(lang, { freq: 'M', w: 12 }) + (cite ? ` ${cite}` : '')}
    >
      <p className="ch-strip__note">{t(lang, 'chains.focusStrip.rule', { name: focus.name })}</p>
    </StripChart>
  );
}
