'use client';
// The event page's charts from the @larch/net chart kit, with what cannot cross from a server component (formatters,
// the product switch): the lead strip (lens M change on a year earlier) and the partner-share charts, product by
// product.
import { useState } from 'react';
import { SharesChart, StripChart, type SharesSlot } from '@larch/net';
import { formatPercentChange, t, type Lang } from '@/lib/i18n';

export function LeadStrip({ lang, periods, values, label, seriesLabel, start, base, now, complete, coverage, source, eventLabel, csvName }: {
  lang: Lang;
  periods: number[];
  values: (number | null)[];
  label: string;
  seriesLabel: string;
  start: number | null;
  base: number;
  now: number;
  complete: number;
  coverage: Record<string, number> | null;
  source: string;
  eventLabel: string;
  csvName: string;
}) {
  return (
    <StripChart lang={lang} label={label} periods={periods} mark="line" zero height={190}
      series={[{ key: 'yoy', label: seriesLabel, values }]}
      format={(v) => formatPercentChange(v, lang, { decimals: 1 })}
      tickFormat={(v) => formatPercentChange(v, lang, { decimals: 0 })}
      current={now} base={base} complete={complete} coverage={coverage}
      events={start != null ? [{ t: start, label: eventLabel }] : []}
      source={source} csvName={csvName} />
  );
}

export interface SharesChartData {
  key: string;
  title: string;
  reading: string;
  note?: string | null;
  periods: number[];
  slots: SharesSlot[];
  other: (number | null)[] | null;
  label: string;
  source: string;
  csvName: string;
}

export function SharesByProduct({ lang, products, base, now, complete, coverage }: {
  lang: Lang;
  products: { id: string; label: string; charts: SharesChartData[] }[];
  base: number;
  now: number;
  complete: number | null;
  coverage: Record<string, number> | null;
}) {
  const [sel, setSel] = useState(products[0]?.id ?? '');
  const cur = products.find((p) => p.id === sel) ?? products[0];
  if (!cur) return null;
  return (
    <div className="st-sharesby">
      {products.length > 1 ? (
        <div className="lr-field">
          <span className="lr-label" id="st-sharesby-l">{t(lang, 'events.shares.product')}</span>
          <div className="lr-seg st-seg-wrap" role="group" aria-labelledby="st-sharesby-l">
            {products.map((p) => <button key={p.id} type="button" aria-pressed={p.id === cur.id} onClick={() => setSel(p.id)}>{p.label}</button>)}
          </div>
        </div>
      ) : null}
      <div className="st-figs">
        {cur.charts.map((c) => (
          <div key={c.key} className="st-fig">
            <h3 className="st-fig__title">{c.title}</h3>
            <p className="st-fig__reading">{c.reading}</p>
            <SharesChart lang={lang} label={c.label} periods={c.periods} slots={c.slots} other={c.other}
              current={now} base={base} complete={complete} coverage={coverage} source={c.source} csvName={c.csvName} />
            {c.note ? <p className="st-fig__note">{c.note}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
