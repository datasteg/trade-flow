'use client';
// The focus economy's place (?focus=ISO3; nothing without one): its export and import rank and share at every stage
// of the chain, and its top supplier, from econ/<chain>/<year>.json. The trail diamond marks the stages where it is a
// top-three exporter.
import { DataTable, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import { ChartFrame } from './ChartFrame';
import { econPlace, pct, stageTag } from './model';
import type { ChainModel, EconFile } from './types';

export function FocusPlace({ model, econ, status, focus, year }: {
  model: ChainModel;
  econ: EconFile | null;
  status: 'loading' | 'ready' | 'error';
  focus: { i: number; iso: string; name: string };
  year: number;
}) {
  const lang: Lang = model.lang;
  const nodes = model.nodes;
  const rows = model.stages.map((s) => {
    const k = econPlace(econ, s.key, focus.i);
    const sup = k?.ts != null ? nodes[k.ts] : null;
    return { s, k, sup };
  });
  const p = (v: number | null | undefined) => {
    const x = pct(v);
    if (x == null || !v) return '–';
    return x === 0 ? '<0.01' : x.toFixed(x < 1 ? 2 : 1);
  };
  const header = [
    t(lang, 'chains.focus.col.stage'), t(lang, 'chains.focus.col.product'), t(lang, 'chains.focus.col.xr'),
    t(lang, 'chains.focus.col.xs'), t(lang, 'chains.focus.col.mr'), t(lang, 'chains.focus.col.ms'),
    t(lang, 'chains.focus.col.sup'), t(lang, 'chains.focus.col.supShare'),
  ];
  const table = (
    <DataTable
      columns={[
        { key: 'st', label: header[0] },
        { key: 'p', label: header[1], marker: true },
        { key: 'xr', label: header[2], num: true, sortable: true },
        { key: 'xs', label: header[3], num: true, sortable: true },
        { key: 'mr', label: header[4], num: true, sortable: true },
        { key: 'ms', label: header[5], num: true, sortable: true },
        { key: 'sup', label: header[6] },
        { key: 'ss', label: header[7], num: true },
      ]}
      rows={rows.map(({ s, k, sup }) => ({
        id: s.key,
        focus: !!k && k.xRank != null && k.xRank <= 3,
        cells: {
          st: stageTag(lang, s.stage),
          p: <a href={`#stage-${s.key}`}>{s.name}</a>,
          xr: k?.xRank != null ? `#${k.xRank}` : '–',
          xs: p(k?.x),
          mr: k?.mRank != null ? `#${k.mRank}` : '–',
          ms: p(k?.m),
          sup: sup ? <><span className="lr-iso">{sup[0]}</span> {sup[1]}</> : '–',
          ss: p(k?.tss),
        },
        sort: { xr: k?.xRank ?? null, xs: k?.x ?? null, mr: k?.mRank ?? null, ms: k?.m ?? null },
      }))}
    />
  );
  return (
    <section className="ch-focus" id="focus" aria-labelledby="focus-h">
      <h2 className="lr-h2" id="focus-h"><span className="lr-marker" aria-hidden /> {t(lang, 'chains.focus.h', { name: focus.name, year })}</h2>
      <p className="ch-section__dek">{t(lang, 'chains.focus.dek', { name: focus.name })}</p>
      {status === 'ready' ? (
        <ChartFrame
          lang={lang}
          wide
          caption={t(lang, 'chains.focus.caption', { name: focus.name, year })}
          csv={{
            name: `${model.id}-${focus.iso.toLowerCase()}-${year}.csv`,
            header,
            rows: rows.map(({ s, k, sup }) => [stageTag(lang, s.stage), s.name, k?.xRank ?? null, pct(k?.x), k?.mRank ?? null, pct(k?.m), sup?.[0] ?? null, pct(k?.tss)]),
          }}
        >
          {table}
        </ChartFrame>
      ) : (
        <p className="ch-section__dek" aria-live="polite">{t(lang, status === 'error' ? 'chains.focus.error' : 'chains.focus.loading', { name: focus.name })}</p>
      )}
    </section>
  );
}
