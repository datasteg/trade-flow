'use client';
// One stage on a chain page: h2 "S3 · Cathode active material" with its HS codes, three StatTiles, the top exporters
// and importers (two-way traders badged; the focus economy's row marked, or added below a rule when it is outside the
// five), one sentence of facts about the largest two-way trader among them (the focus economy's facts instead when
// there is one), the stage's caveats as Notices, the Signposts up and down the trail, and the two strips (exporter
// HHI by year, the 12-month sum by month).
import { MapPinned, Scissors } from 'lucide-react';
import { monthRange, netString } from '@larch/net/core';
import { Button, DataTable, HSCode, Notice, Signpost, StatTile, StatTiles, formatHS, type DataRow, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import {
  BASE_YEAR, exploreHref, fmtHHI, fmtShare, fmtUSD, fmtUV, hhiBand, pct, PRE2022_WHAT, stageTag, stageVar, twoWayOf, twoWayTop5, uvShown,
} from './model';
import { FocusStrip, HhiStrip, MonthlyStrip } from './Strips';
import { TwoWayBadge } from './TwoWayBadge';
import type { FocusStage } from './focus';
import type { ChainModel, StageModel, StageSeries, StageYear, YearSlice } from './types';

/** The focus economy at this stage: its node index, name and numbers from the stage snapshot (`at` null without
 *  trade, or while loading). */
export interface StageFocus { i: number; iso: string; name: string; at: FocusStage | null; status: 'loading' | 'ready' | 'error' }

function RankTable({ lang, side, y, base, nodes, year, focus }: {
  lang: Lang;
  side: 'x' | 'm';
  y: StageYear;
  base: StageYear | null;
  nodes: [string, string][];
  year: number;
  focus: StageFocus | null;
}) {
  const list = side === 'x' ? y.top_exporters : y.top_importers;
  const baseList = base ? (side === 'x' ? base.top_exporters : base.top_importers) : [];
  const showBase = !!base && year !== BASE_YEAR;
  const who = (i: number) => {
    const tw = twoWayOf(y, i);
    return <><span className="lr-iso">{nodes[i]?.[0]}</span> {nodes[i]?.[1]}{tw ? <> <TwoWayBadge lang={lang} row={tw} world={y.world} name={nodes[i]?.[1] ?? ''} /></> : null}</>;
  };
  const rows: DataRow[] = list.map(([i, sh], r) => {
    const b = baseList.find(([j]) => j === i)?.[1];
    return {
      id: String(i),
      focus: focus?.i === i,
      cells: { r: String(r + 1), e: who(i), s: pct(sh)?.toFixed(1), b: b != null ? pct(b)?.toFixed(1) : '–' },
    };
  });
  // the focus economy below the five, at its own rank, under a rule; "–" when it has no trade on this side
  const fn = focus?.status === 'ready' ? focus.at?.n ?? null : null;
  if (focus && focus.status === 'ready' && !list.some(([i]) => i === focus.i)) {
    const fShare = fn ? (side === 'x' ? fn.x : fn.m) : 0;
    const fRank = fn && fShare > 0 ? (side === 'x' ? fn.rankExports : fn.rankImports) : null;
    const b = baseList.find(([j]) => j === focus.i)?.[1];
    rows.push({
      id: 'focus',
      focus: true,
      sep: true,
      cells: { r: fRank != null ? `… ${fRank}` : '…', e: who(focus.i), s: fRank != null ? (fShare < 0.0001 ? '<0.01' : pct(fShare)?.toFixed(fShare < 0.01 ? 2 : 1)) : '–', b: b != null ? pct(b)?.toFixed(1) : '–' },
    });
  }
  return (
    <div className="ch-ranks">
      <p className="ch-ranks__h">{t(lang, side === 'x' ? 'chains.stage.topExporters' : 'chains.stage.topImporters', { year })}</p>
      <DataTable
        columns={[
          { key: 'r', label: t(lang, 'chains.stage.col.rank'), num: true },
          { key: 'e', label: t(lang, 'chains.stage.col.economy'), marker: true },
          { key: 's', label: t(lang, side === 'x' ? 'chains.stage.col.xshare' : 'chains.stage.col.mshare'), num: true },
          ...(showBase ? [{ key: 'b', label: t(lang, 'chains.stage.col.base', { base: BASE_YEAR }), num: true }] : []),
        ]}
        rows={rows}
      />
    </div>
  );
}

/** One sentence of facts about the largest two-way trader among the stage's top five, or null: what it imports
 *  and exports, the unit value of each side where weight covers enough of the value, its main suppliers and buyers.
 *  Never a cause: causes are hand-written and sourced, never generated. */
function twoWaySentence(lang: Lang, y: StageYear, nodes: [string, string][]): string | null {
  const r = twoWayTop5(y)[0];
  if (!r) return null;
  const list = (xs: number[]) => xs.map((i) => nodes[i]?.[1]).filter(Boolean).join(', ');
  const parts = [t(lang, 'chains.tw.sentence', { name: nodes[r.i]?.[1] ?? '', m: fmtUSD(r.m * y.world, lang), x: fmtUSD(r.x * y.world, lang) })];
  if (r.um != null && r.ux != null) parts.push(t(lang, 'chains.tw.sentenceUV', { um: fmtUV(r.um, lang), ux: fmtUV(r.ux, lang) }));
  if (r.sup.length) parts.push(t(lang, 'chains.tw.sentenceSup', { list: list(r.sup) }));
  if (r.buy.length) parts.push(t(lang, 'chains.tw.sentenceBuy', { list: list(r.buy) }));
  return parts.join(' ');
}

/** The same facts about the focus economy, from the stage snapshot: exports and imports with world rank and share,
 *  unit values, its three largest suppliers and buyers with their shares; or that it did not trade the stage. */
export function focusSentence(lang: Lang, f: StageFocus, year: number, nodes: [string, string][]): string {
  if (f.status === 'loading') return t(lang, 'chains.focus.loading', { name: f.name });
  if (f.status === 'error') return t(lang, 'chains.focus.error', { name: f.name });
  const n = f.at?.n;
  if (!n) return t(lang, 'chains.stage.focusNoTrade', { name: f.name, year });
  const x = n.exports > 0 ? t(lang, 'chains.stage.focusX', { v: fmtUSD(n.exports, lang), r: n.rankExports, s: fmtShare(n.x, lang) }) : t(lang, 'chains.stage.focusXNone');
  const m = n.imports > 0 ? t(lang, 'chains.stage.focusM', { v: fmtUSD(n.imports, lang), r: n.rankImports, s: fmtShare(n.m, lang) }) : t(lang, 'chains.stage.focusMNone');
  const parts = [t(lang, 'chains.stage.focusLine', { name: f.name, x, m })];
  if (n.um != null && n.ux != null) parts.push(t(lang, 'chains.tw.sentenceUV', { um: fmtUV(n.um, lang), ux: fmtUV(n.ux, lang) }));
  else if (n.ux != null) parts.push(t(lang, 'chains.stage.focusUX', { ux: fmtUV(n.ux, lang) }));
  else if (n.um != null) parts.push(t(lang, 'chains.stage.focusUM', { um: fmtUV(n.um, lang) }));
  const list = (xs: { i: number; share: number }[]) => xs.map((p) => t(lang, 'chains.stage.partner', { name: nodes[p.i]?.[1] ?? '?', share: fmtShare(p.share, lang) })).join(', ');
  if (f.at!.sup.length) parts.push(t(lang, 'chains.tw.sentenceSup', { list: list(f.at!.sup) }));
  if (f.at!.buy.length) parts.push(t(lang, 'chains.tw.sentenceBuy', { list: list(f.at!.buy) }));
  return parts.join(' ');
}

export function StageSection({ model, s, slice, base, series, year, focus }: {
  model: ChainModel;
  s: StageModel;
  slice: YearSlice;
  base: StageYear | null;
  series: StageSeries;
  year: number;
  /** The focus economy (?focus=ISO3), or null: then nothing about any one economy is added. */
  focus: StageFocus | null;
}) {
  const y = slice[s.key];
  const lang = model.lang;
  const nodes = model.nodes;
  const byKey = new Map(model.stages.map((x) => [x.key, x]));
  const isChoke = model.chokepoint[String(year)] === s.key;
  const fileStem = `${model.id}-${s.key}`;
  const chokeYears = Object.entries(model.chokepoint).filter(([, k]) => k === s.key).map(([yy]) => Number(yy));
  const useComparison = !!base && !!y && year !== BASE_YEAR;
  const band = hhiBand(y?.hhi);

  const dest = (keys: string[]) => keys.map((k) => byKey.get(k)!).filter(Boolean)
    .sort((a, b) => (b.stage - a.stage) || 0).slice(0, 4).map((d) => ({
      name: d.name,
      href: `#stage-${d.key}`,
      meta: undefined as string | undefined,
      stage: d.stage,
      key: d.key,
    }));
  const down = dest(s.feeds);
  const up = dest(s.inputs);

  // with a focus economy its facts take the place of the two-way trader's, here and where the stage has no trade
  const sentence = focus ? focusSentence(lang, focus, year, nodes) : y ? twoWaySentence(lang, y, nodes) : null;
  const n = model.levels.length;
  const colour = stageVar(s.stage, n);

  return (
    <section className="ch-stage" id={`stage-${s.key}`} aria-labelledby={`stage-${s.key}-h`} style={{ ['--stage' as string]: colour }}>
      <div className="ch-stage__head">
        <p className="lr-stage-pill"><i style={{ background: colour }} aria-hidden />{`${stageTag(lang, s.stage)} · ${model.levels[s.stage - 1]?.name ?? ''}`}
          {s.role ? <span className="ch-stage__role">{t(lang, s.role === 'feedstock' ? 'chains.way.feedstock' : 'chains.way.side')}</span> : null}
          {isChoke ? <span className="ch-stage__choke">{t(lang, 'chains.card.choke')}</span> : null}
        </p>
        <h2 className="lr-h2 ch-stage__title" id={`stage-${s.key}-h`}>{`${stageTag(lang, s.stage)} · ${s.name}`}</h2>
        <div className="lr-way__codes ch-stage__codes">
          {s.codes.map((c) => <HSCode key={c} lang={lang} code={c} residual={s.residual} version={s.codesPre ? 'H6' : undefined} />)}
          {(s.codesPre ?? []).map((c) => <HSCode key={`p${c}`} lang={lang} code={c} version="H5" />)}
        </div>
      </div>

      {y ? (
        <>
          <StatTiles>
            <StatTile label={t(lang, 'chains.stage.world', { year })} value={fmtUSD(y.world, lang)}
              meta={useComparison && base!.world > 0 ? t(lang, 'chains.stage.times', { x: (y.world / base!.world).toFixed(1), base: BASE_YEAR }) : undefined} />
            <StatTile label={t(lang, 'chains.stage.uv', { year })} value={uvShown(y) ? fmtUV(y.usd_per_kg, lang) : '–'}
              meta={uvShown(y) ? (useComparison && uvShown(base) ? t(lang, 'chains.stage.vs', { change: fmtUV(base!.usd_per_kg, lang), base: BASE_YEAR }) : undefined)
                : t(lang, 'chains.stage.uvHidden', { share: fmtShare(y.kg_coverage ?? 0, lang) })} />
            <StatTile label={t(lang, 'chains.stage.hhi', { year })} value={<span className={band === 'high' ? 'ch-hhi--high' : undefined}>{fmtHHI(y.hhi)}</span>}
              meta={<>{t(lang, `chains.hhi.${band}` as 'chains.hhi.low')}{useComparison && base!.hhi != null ? ` · ${t(lang, 'chains.stage.vs', { change: fmtHHI(base!.hhi), base: BASE_YEAR })}` : ''}</>} />
            <StatTile label={t(lang, 'chains.stage.exporters', { n: y.exporters })} value={y.top_exporters[0] ? `${nodes[y.top_exporters[0][0]]?.[0]} ${fmtShare(y.top_exporters[0][1], lang)}` : '–'}
              meta={y.importer_reported != null ? t(lang, 'chains.stage.importerReported', { share: fmtShare(y.importer_reported, lang) }) : undefined} />
          </StatTiles>

          <div className="ch-stage__ranks">
            <RankTable lang={lang} side="x" y={y} base={base} nodes={nodes} year={year} focus={focus} />
            <RankTable lang={lang} side="m" y={y} base={base} nodes={nodes} year={year} focus={focus} />
          </div>
          {sentence ? <StageSentence sentence={sentence} focus={!!focus} /> : null}
          <p className="lr-caption">{t(lang, 'chains.stage.tableCaption', { product: s.name, year })}</p>
          {[...y.top_exporters, ...y.top_importers].some(([i]) => model.nes.includes(i))
            ? <p className="lr-caption">{`${nodes[model.nes[0]]?.[1] ?? ''}: ${netString(lang, 'nesNote')}`}</p> : null}
        </>
      ) : (
        <>
          <p className="ch-stage__nodata">
            {s.first != null && s.first > year ? t(lang, 'chains.stage.begins', { year: s.first }) : t(lang, 'chains.stage.nodata', { year })}
          </p>
          {sentence ? <StageSentence sentence={sentence} focus /> : null}
        </>
      )}

      <div className="ch-notices">
        {s.caveat ? (
          <Notice tone="warning" title={t(lang, s.residual ? 'chains.caveat.residual' : 'chains.caveat.title')}>{s.caveat}</Notice>
        ) : null}
        {s.codesPre ? (
          <Notice tone="warning" title={t(lang, 'chains.hsv.title')}>
            {s.codesPre.length
              ? t(lang, 'chains.hsv.body', {
                // only the codes that changed in 2022 (a stage may keep other codes across versions)
                what: s.codesPre.map((c) => PRE2022_WHAT[c]?.[lang]).filter(Boolean).join(', ') || t(lang, 'chains.hsv.generic'),
                old: s.codesPre.filter((c) => !s.codes.includes(c)).map(formatHS).join(', '),
                new: s.codes.filter((c) => !s.codesPre!.includes(c)).map(formatHS).join(', '),
              })
              : t(lang, 'chains.hsv.bodyEmpty')}
          </Notice>
        ) : null}
        {s.use ? (
          <Notice tone="info" title={t(lang, 'chains.use.title')}>
            {s.use.share != null
              ? t(lang, 'chains.use.body', { share: fmtShare(s.use.share, lang), what: s.use.what ?? '' })
              : t(lang, 'chains.use.bodyUnknown', { what: s.use.what ?? '' })}
            {s.use.source ? (
              <>
                {' '}
                {s.use.url
                  ? <a href={s.use.url} rel="noopener noreferrer">{t(lang, s.use.year ? 'chains.use.sourceYear' : 'chains.use.source', { source: s.use.source, year: s.use.year ?? '' })}</a>
                  : t(lang, s.use.year ? 'chains.use.sourceYear' : 'chains.use.source', { source: s.use.source, year: s.use.year ?? '' })}
                .
              </>
            ) : null}
          </Notice>
        ) : null}
        {s.kcsGap ? (
          <Notice tone="warning" title={t(lang, 'chains.kcsGap.title', { src: s.kcsGap.source })}>
            {t(lang, s.kcsGap.side === 'm' ? 'chains.kcsGap.bodyM' : 'chains.kcsGap.bodyX', {
              name: nodes[s.kcsGap.node]?.[1] ?? '', when: monthRange(s.kcsGap.supplied[0], s.kcsGap.supplied[1], lang),
              span: monthRange(s.kcsGap.months[0], s.kcsGap.months[1], lang), v: fmtShare(Math.abs(s.kcsGap.gap), lang),
            })}
          </Notice>
        ) : null}
        {s.shared.length ? (
          <Notice tone="info" title={t(lang, 'chains.shared.title')}>
            {(() => {
              const parts = t(lang, 'chains.shared.body', { chains: '\u0000' }).split('\u0000');
              return <>{parts[0]}{s.shared.map((x, i) => <span key={x.chain}>{i ? ', ' : ''}<a href={x.href}>{x.name}</a></span>)}{parts[1]}</>;
            })()}
          </Notice>
        ) : null}
      </div>

      <div className="ch-stage__signs">
        {up.length ? (
          <Signpost lang={lang} direction="up" stage={[...new Set(up.map((d) => d.stage))]}
            destinations={up.map((d) => ({ name: d.name, href: d.href, meta: signMeta(lang, nodes, slice[d.key]) }))} />
        ) : null}
        {down.length ? (
          <Signpost lang={lang} direction="down" stage={[...new Set(down.map((d) => d.stage))]}
            destinations={down.map((d) => ({ name: d.name, href: d.href, meta: signMeta(lang, nodes, slice[d.key]) }))} />
        ) : null}
        <Button href={exploreHref(lang, s.product, year, focus?.iso)} variant="secondary" size="sm" icon={<MapPinned size={16} strokeWidth={1.5} aria-hidden />}>
          {t(lang, 'chains.stage.explore')}
        </Button>
        {y?.top_exporters[0] ? (
          <Button href={`/${lang}/cases/tools/cut-supplier?stage=${model.id}/${s.key}&exporter=${nodes[y.top_exporters[0][0]]?.[0] ?? ''}`}
            variant="secondary" size="sm" icon={<Scissors size={16} strokeWidth={1.5} aria-hidden />}>
            {t(lang, 'chains.stage.cut')}
          </Button>
        ) : null}
      </div>

      <div className="ch-stage__strips">
        <HhiStrip lang={lang} product={s.name} stage={s.stage} levels={n} years={model.years} hhi={series.hhi} year={year} chokeYears={chokeYears}
          complete={model.complete} coverage={model.coverage} first={s.first} fileStem={fileStem} />
        <MonthlyStrip lang={lang} product={s.name} stage={s.stage} levels={n} series={series.m} complete={model.completeMonth}
          coverage={model.coverageM} year={year} fileStem={fileStem} cite={model.monthCite} />
        {focus ? <FocusStrip lang={lang} product={s.product} productName={s.name} focus={focus} stage={s.stage} levels={n}
          shownMonth={model.shownMonth} year={year} fileStem={fileStem} /> : null}
      </div>
    </section>
  );
}

function StageSentence({ sentence, focus }: { sentence: string; focus: boolean }) {
  return focus
    ? <p className="ch-stage__tw ch-stage__tw--focus"><span className="lr-marker lr-marker--sm" aria-hidden /> {sentence}</p>
    : <p className="ch-stage__tw">{sentence}</p>;
}

/** A Signpost's meta line, where a trail sign gives the walking time: the destination's unit value (when weight
 *  covers enough of its value) and its top exporter, "$14.2/kg · KOR 56%"; never a value step between stages. */
function signMeta(lang: Lang, nodes: [string, string][], d: StageYear | null): string | undefined {
  if (!d) return undefined;
  const top = d.top_exporters[0];
  const parts = [uvShown(d) ? fmtUV(d.usd_per_kg, lang) : null, top ? `${nodes[top[0]]?.[0]} ${fmtShare(top[1], lang)}` : null];
  return parts.filter(Boolean).join(' · ') || undefined;
}
