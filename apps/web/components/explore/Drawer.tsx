'use client';
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Marker, Notice, Signpost, StatTile, StatTiles, type SignpostDestination } from '@larch/ui';
import {
  CheckPairChart, MIN_COMPLETE, SharesChart, SlopeChart, StatusWord, StripChart,
  addMonths, divergeText, estName, growth, growthText, lensName, nearestYear, netString, ruleName, sourceLine, stageNeighbours, supplementFill, supplementLine,
  type BaseCompare, type Chain, type Check, type ChecksFile, type ChecksIndex, type MetaProduct, type Meta, type RawFlowsFile,
  type RawNodesFile, type SeriesRow, type Snap, type StripSeam,
} from '@larch/net';
import { formatDate, formatNumber, formatPercentChange, formatPeriod, formatShare, formatUSD, t, type Lang, type StringKey } from '@/lib/i18n';
import type { ExploreState } from './state';

export interface DrawerData {
  lang: Lang;
  meta: Meta;
  st: ExploreState;
  set: (patch: Partial<ExploreState>) => void;
  product: MetaProduct;
  snap: Snap | null;
  baseSnap: Snap | null;
  base: BaseCompare | null;
  series: SeriesRow[];
  nodeFile: RawNodesFile | null;
  flowFile: RawFlowsFile | null;
  chain: Chain | null;
  checks: ChecksFile | null | undefined;
  checksIndex: ChecksIndex | null;
  drawnFlows: number;
  slots: Map<number, number>;
  periods: number[];
  onClose: () => void;
  /** Monthly explorer: the window in words ("3-month sum") and the source line, in place of the lens. */
  windowLabel?: string | null;
  windowSource?: string | null;
}

/** A value for chart labels: two significant figures ("$4.9bn", "49억 달러"). Tables keep the full figure. */
const chartUSD = (v: number, lang: Lang) => { const p = 10 ** (Math.floor(Math.log10(Math.abs(v) || 1)) - 1); return formatUSD(Math.round(v / p) * p, lang); };

const name = (meta: Meta, i: number, lang: Lang) => meta.nodes[i]?.[lang] ?? meta.nodes[i]?.id ?? String(i);
const iso = (meta: Meta, i: number) => meta.nodes[i]?.id ?? String(i);
const idx = (meta: Meta, id: string | null) => (id ? meta.nodes.findIndex((n) => n.id === id) : -1);

function kicker(d: DrawerData): string {
  const { lang, product, st } = d;
  const p = lang === 'ko' ? product.ko : product.en;
  const lens = d.windowLabel ? ` · ${d.windowLabel}` : '';
  return `${p} · ${formatPeriod(st.t, lang)}${lens}`;
}

function source(d: DrawerData): string {
  if (d.windowSource) return d.windowSource;
  return sourceLine(d.lang, { freq: d.st.f, rule: d.st.m, lens: d.st.f === 'M' ? d.st.lens : null, total: d.product.id === 'TOTAL' });
}

/** The months the period on screen sums: the window, or the lens (12 or 3 months); 1 for years. */
function reach(d: DrawerData): number {
  if (d.st.f !== 'M') return 1;
  return d.windowSource ? d.st.w : (d.meta.lenses[d.st.lens] ?? 1);
}

/** The customs citation when the months [from, to] reach a supplement. */
function cite(d: DrawerData, from: number, to: number): string {
  const c = d.st.f === 'M' ? supplementLine(d.lang, d.meta, from, to) : '';
  return c ? ` ${c}` : '';
}

/** The citation for the period on screen, and for a chart over `periods`. */
const citeNow = (d: DrawerData) => cite(d, addMonths(d.st.t, 1 - reach(d)), d.st.t);
const citeSpan = (d: DrawerData, periods: number[]) => (periods.length ? cite(d, addMonths(periods[0], 1 - reach(d)), periods[periods.length - 1]) : '');

/** Where an economy's series changes source (Korea: the customs service's months and Comtrade's), as strip ticks. */
function seams(d: DrawerData, i: number, periods: number[]): StripSeam[] {
  if (d.st.f !== 'M' || !periods.length) return [];
  const out: StripSeam[] = [];
  const first = periods[0], last = periods[periods.length - 1];
  for (const sup of d.meta.supplements ?? []) {
    if (sup.node !== i) continue;
    const src = d.lang === 'ko' ? sup.ko : sup.en;
    for (const [a, b] of sup.ranges ?? [sup.M]) {
      if (a > first && a <= last) out.push({ t: a, label: t(d.lang, 'explore.seam.kcs', { m: formatPeriod(a, d.lang), src }) });
      const after = addMonths(b, 1);
      if (after > first && after <= last) out.push({ t: after, label: t(d.lang, 'explore.seam.comtrade', { m: formatPeriod(after, d.lang) }) });
    }
  }
  return out;
}

type Range = '5' | '10' | 'all';

/** A card's strip with range buttons: monthly cards open on ten years, annual on all.
 *  `cite` gives the citation for the periods drawn, so a range that leaves out the customs months does not cite them. */
function RangedStrip(props: Parameters<typeof StripChart>[0] & { freq: 'A' | 'M'; cite?: (periods: number[]) => string }) {
  const { freq, lang, periods, series, completeness, seams: ticks, source: src, cite: citeFor, ...rest } = props;
  const [range, setRange] = useState<Range>(freq === 'A' ? 'all' : '10');
  const last = periods[periods.length - 1] ?? 0;
  const from = range === 'all' ? -Infinity : last - Number(range) * (freq === 'A' ? 1 : 100);
  const keep = periods.map((p) => p > from);
  const pick = <T,>(xs: T[]) => xs.filter((_x, j) => keep[j]);
  const shown = pick(periods);
  return (
    <>
      <div className="lr-seg gx-span" role="group" aria-label={t(lang, 'explore.range')}>
        {(['5', '10', 'all'] as Range[]).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{t(lang, `explore.range.${r}` as StringKey)}</button>
        ))}
      </div>
      <StripChart {...rest} lang={lang} periods={shown} series={series.map((sr) => ({ ...sr, values: pick(sr.values) }))}
        completeness={completeness ? pick(completeness) : undefined}
        seams={ticks?.filter((x) => shown.length > 0 && x.t > shown[0] && x.t <= shown[shown.length - 1])}
        source={(src ?? '') + (citeFor ? citeFor(shown) : '')} />
    </>
  );
}

/** The drawer: overview when nothing is selected, the CountryCard or the flow card, and the Checks tab. */
export function Drawer(d: DrawerData) {
  const { lang, st, set } = d;
  const label = st.flow ? st.flow.replace('>', '→') : st.focus ? (d.meta.nodes.find((n) => n.id === st.focus)?.[lang] ?? st.focus) : t(lang, 'explore.overview');
  return (
    <div className="gx-drawer__inner">
      <div className="gx-drawer__bar">
        <div className="gx-tabs" role="tablist" aria-label={label}>
          <button type="button" role="tab" aria-selected={st.tab === 'main'} onClick={() => set({ tab: 'main' })}>
            {st.focus || st.flow ? label : t(lang, 'explore.overview')}
          </button>
          <button type="button" role="tab" aria-selected={st.tab === 'checks'} onClick={() => set({ tab: 'checks' })}>{t(lang, 'explore.checks')}</button>
        </div>
        <button type="button" className="lr-iconbtn" aria-label={t(lang, 'explore.close')} title={t(lang, 'explore.close')} onClick={d.onClose}>
          <X size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div className="gx-drawer__body" role="tabpanel">
        {st.tab === 'checks' ? <ChecksPanel {...d} /> : st.flow ? <FlowCard {...d} /> : st.focus ? <CountryCard {...d} /> : <Overview {...d} />}
      </div>
    </div>
  );
}

function Bars({ lang, items, colour, onPick }: { lang: Lang; items: { key: string; label: ReactNode; value: number; focus?: boolean }[]; colour: string; onPick?: (key: string) => void }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  if (!items.length) return <p className="gx-note">{t(lang, 'explore.noPartners')}</p>;
  return (
    <ul className="lr-partners gx-bars">
      {items.map((x) => (
        <li key={x.key}>
          {onPick ? (
            <button type="button" className="gx-bars__btn" onClick={() => onPick(x.key)}>
              <span className="lr-iso">{x.focus ? <Marker size="sm" /> : null}{x.label}</span>
              <span className="lr-partners__bar" style={{ width: `${(100 * x.value) / max}%`, background: `var(--${colour})` }} />
              <span className="lr-partners__v">{formatUSD(x.value, lang)}</span>
            </button>
          ) : (
            <>
              <span className="lr-iso">{x.label}</span>
              <span className="lr-partners__bar" style={{ width: `${(100 * x.value) / max}%`, background: `var(--${colour})` }} />
              <span className="lr-partners__v">{formatUSD(x.value, lang)}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Overview(d: DrawerData) {
  const { lang, meta, snap, set, st } = d;
  if (!snap) return <p className="gx-note">{t(lang, 'explore.loadingNetwork')}</p>;
  const tot = snap.tot;
  const top = (k: 'exports' | 'imports') => [...snap.nodes].sort((a, b) => b[k] - a[k]).slice(0, 10)
    .map((n) => ({ key: n.id, label: n.id, value: n[k] }));
  const ys = d.series.map((r) => r.world);
  const now = d.series.findIndex((r) => r.t === st.t);
  const spark = now >= 0 ? ys.slice(Math.max(0, now - 15), now + 1) : undefined;
  // who moved: the ten largest exporters now, at the base and now
  const base = d.baseSnap;
  const movers = [...snap.nodes].sort((a, b) => b.x - a.x).slice(0, 10);
  return (
    <div className="gx-card">
      <div className="lr-card__head">
        <p className="lr-kicker">{kicker(d)}</p>
        <h2 className="lr-card__name">{t(lang, 'explore.theNetwork')}</h2>
      </div>
      <StatTiles>
        <StatTile label={t(lang, 'explore.worldTrade', { t: formatPeriod(snap.t, lang) })} value={formatUSD(snap.world, lang)} spark={spark && spark.length > 2 ? spark : undefined}
          meta={d.windowLabel ?? (st.f === 'M' ? lensName(lang, st.lens) : ruleName(lang, snap.rule))} />
        <StatTile label={t(lang, 'explore.economies')} value={formatNumber(tot.nodes, lang)} meta={t(lang, 'explore.reportedN', { n: formatNumber(tot.reporters, lang) })} />
        <StatTile label={t(lang, 'explore.flowsDrawn')} value={formatNumber(d.drawnFlows, lang)} meta={t(lang, 'explore.ofFlows', { n: formatNumber(tot.edges, lang) })} />
        <StatTile label={t(lang, 'explore.top5')} value={formatShare(tot.top5, lang)} meta={t(lang, 'explore.hhiMeta', { v: tot.hhi?.toFixed(3) ?? '–' })} />
      </StatTiles>
      {tot.imp_rep != null ? <p className="gx-note">{t(lang, 'explore.impRep', { v: formatShare(tot.imp_rep, lang) })}</p> : null}
      <section className="lr-panel__section">
        <h3 className="lr-card__h">{t(lang, 'explore.topExporters')}</h3>
        <Bars lang={lang} items={top('exports')} colour="viz-1" onPick={(id) => set({ focus: id, flow: null, tab: 'main' })} />
      </section>
      <section className="lr-panel__section">
        <h3 className="lr-card__h">{t(lang, 'explore.topImporters')}</h3>
        <Bars lang={lang} items={top('imports')} colour="viz-1" onPick={(id) => set({ focus: id, flow: null, tab: 'main' })} />
      </section>
      {(() => {   // Asia, n.e.s. (Comtrade partner 490) among the largest: say what it is
        const n = [...snap.nodes].filter((x) => x.nes).find((x) => [...snap.nodes].sort((a, b) => b.exports - a.exports).slice(0, 10).includes(x)
          || [...snap.nodes].sort((a, b) => b.imports - a.imports).slice(0, 10).includes(x));
        return n ? <p className="gx-note">{`${name(d.meta, n.i, lang)}: ${netString(lang, 'nesNote')}`}</p> : null;
      })()}
      {snap.comm.length ? (
        <section className="lr-panel__section">
          <h3 className="lr-card__h">{t(lang, 'explore.communities')}</h3>
          <ul className="gx-comm">
            {snap.comm.slice(0, 6).map((c) => {
              const slot = d.slots.get(c.anchor);
              return (
                <li key={c.anchor}>
                  <span className="lr-legend__dot" style={{ background: `var(--${slot != null ? `viz-${slot + 1}` : 'viz-context'})` }} aria-hidden />
                  <button type="button" className="gx-link" onClick={() => set({ focus: iso(meta, c.anchor), flow: null })}>{name(meta, c.anchor, lang)}</button>
                  <span className="gx-muted">{t(lang, 'explore.legendCommunityMeta', { n: c.size, share: formatShare(c.share, lang) })}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {base ? (
        <section className="lr-panel__section">
          <SlopeChart lang={lang} label={t(lang, 'explore.whoMoved', { base: formatPeriod(base.t, lang), t: formatPeriod(snap.t, lang) })}
            title={t(lang, 'explore.whoMoved', { base: formatPeriod(base.t, lang), t: formatPeriod(snap.t, lang) })}
            left={formatPeriod(base.t, lang)} right={formatPeriod(snap.t, lang)} csvName={`who-moved-${snap.t}`}
            items={movers.map((n) => ({ key: n.id, label: n.id, a: base.byIndex.get(n.i)?.x ?? null, b: n.x }))}
            source={source(d)} />
        </section>
      ) : null}
      <p className="gx-note">{t(lang, 'explore.hint')}</p>
      <p className="lr-caption">{source(d)} {formatPeriod(snap.t, lang)}.{citeNow(d)}</p>
    </div>
  );
}

function nodeTrajectory(d: DrawerData, i: number): { periods: number[]; x: (number | null)[]; m: (number | null)[]; c: (number | null)[] | null } | null {
  const f = d.nodeFile;
  if (!f) return null;
  const block = d.st.f === 'A' ? f.A : (d.st.lens === 'M' ? f.M ?? null : f.L) ?? f.L;
  if (!block) return null;
  const k = block.ids.indexOf(i);
  if (k < 0) return null;
  return { periods: block.t, x: block.x[k], m: block.m[k], c: block.c?.[k] ?? null };
}

/** An economy's preliminary months on its monthly strip (a supplement's latest months, which its source may revise). */
function prelimOf(d: DrawerData, i: number): { from: number; label: string } | null {
  const sup = d.st.f === 'M' ? (d.meta.supplements ?? []).find((x) => x.node === i) : undefined;
  return sup?.preliminary_from != null ? { from: sup.preliminary_from, label: t(d.lang, 'explore.prelim', { src: sup.source }) } : null;
}

/** An economy's completeness at the period on screen, when its series is loaded. */
function completenessAt(d: DrawerData, i: number): number | null {
  const tr = nodeTrajectory(d, i);
  const j = tr ? tr.periods.indexOf(d.st.t) : -1;
  return tr?.c && j >= 0 ? tr.c[j] : null;
}

function CountryCard(d: DrawerData) {
  const { lang, meta, snap, st, set, product } = d;
  const i = idx(meta, st.focus);
  const n = snap?.byIndex.get(i);
  const nm = name(meta, i, lang);
  if (!snap) return <p className="gx-note">{t(lang, 'explore.loadingNetwork')}</p>;
  const head = (
    <div className="lr-card__head">
      <p className="lr-kicker">{kicker(d)}</p>
      <h2 className="lr-card__name"><Marker />{nm} <span className="lr-iso">{st.focus}</span></h2>
      <p className="lr-card__sub">{n?.reported
        ? t(lang, 'explore.reportedLine', { t: formatPeriod(snap.t, lang), rule: d.windowLabel ?? (st.f === 'M' ? lensName(lang, st.lens) : ruleName(lang, snap.rule)) })
        : t(lang, 'explore.notReportedLine', { t: formatPeriod(snap.t, lang) })}</p>
      {supplementFill(lang, meta, i) ? <p className="lr-caption gx-fill">{supplementFill(lang, meta, i)}</p> : null}
    </div>
  );
  if (!n) return <div className="gx-card">{head}<p className="gx-note">{t(lang, 'explore.noPartners')}</p></div>;
  const dests = snap.edges.filter((e) => e.s === i).sort((a, b) => b.w - a.w).slice(0, 8);
  const sups = snap.edges.filter((e) => e.t === i).sort((a, b) => b.w - a.w).slice(0, 8);
  const traj = nodeTrajectory(d, i);
  const cNow = completenessAt(d, i);
  const ts = n.topSup >= 0 ? name(meta, n.topSup, lang) : '';
  const g = d.base ? growth(n.total, d.base.node(i)?.total ?? 0) : null;

  // suppliers' shares of its imports over time, from the 300 stored flows
  const fb = d.st.f === 'A' ? d.flowFile?.A : d.flowFile?.L;
  let shares: ReactNode = null;
  if (fb && traj && sups.length && (st.f === 'A' || st.lens === 'L')) {
    const world = new Map(d.series.map((r) => [r.t, r.world]));
    const imp = new Map(traj.periods.map((p, k) => [p, traj.m[k]]));
    const slots = sups.slice(0, 5).map((e) => {
      const k = fb.flows.findIndex(([s, tt]) => s === e.s && tt === e.t);
      return k < 0 ? null : {
        key: iso(meta, e.s), label: iso(meta, e.s),
        values: fb.t.map((p, j) => { const w = fb.w[k][j], m = imp.get(p), W = world.get(p); return w != null && m && W ? Math.min(1, (w * W) / m) : null; }),
      };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    if (slots.length) {
      const missing = slots.length < Math.min(5, sups.length);
      shares = (
        <section className="lr-panel__section">
          <SharesChart lang={lang} label={`${nm}: ${t(lang, 'explore.supplierShares')}`} title={t(lang, 'explore.supplierShares')}
            periods={fb.t} slots={slots} other={missing ? null : undefined} current={st.t} base={st.base} complete={meta.complete[st.f]}
            coverage={meta.coverage[st.f]} csvName={`${st.focus}-supplier-shares`} source={source(d)} onPick={(x) => set({ t: x })} />
          {missing ? <p className="gx-note">{t(lang, 'explore.sharesPartial')}</p> : null}
        </section>
      );
    }
  }

  // Signposts for chain stages
  let signs: ReactNode = null;
  if (product.kind === 'stage' && d.chain && product.stage_key) {
    const nb = stageNeighbours(d.chain, product.stage_key);
    const year = String(nearestYear(d.chain, st.f === 'A' ? st.t : Math.floor(st.t / 100)));
    const dest = (stg: typeof nb.up): SignpostDestination[] => stg.slice(0, 4).map((x) => {
      const top = x.years[year]?.top_exporters?.[0];
      return {
        name: lang === 'ko' ? x.ko : x.en,
        meta: top ? t(lang, 'explore.signMeta', { iso: iso(meta, top[0]), share: formatShare(top[1], lang) }) : undefined,
        href: `#${new URLSearchParams({ p: x.product }).toString().replace(/%3A/g, ':')}${st.focus ? `&focus=${st.focus}` : ''}`,
      };
    });
    signs = (
      <section className="lr-panel__section gx-signs">
        {nb.up.length ? <Signpost lang={lang} direction="up" stage={[...new Set(nb.up.map((x) => x.stage))]} destinations={dest(nb.up)} /> : null}
        {nb.down.length ? <Signpost lang={lang} direction="down" stage={[...new Set(nb.down.map((x) => x.stage))]} destinations={dest(nb.down)} /> : null}
      </section>
    );
  }

  return (
    <div className="gx-card">
      {head}
      <StatTiles>
        <StatTile label={t(lang, 'explore.s.exports')} value={formatUSD(n.exports, lang)}
          meta={t(lang, 'explore.rankShare', { r: n.rankExports, share: formatShare(n.x, lang, { decimals: n.x < 0.1 ? 1 : 0 }) })} />
        <StatTile label={t(lang, 'explore.s.imports')} value={formatUSD(n.imports, lang)}
          meta={n.topSupShare != null && ts ? t(lang, 'explore.rankTop', { r: n.rankImports, share: formatShare(n.topSupShare, lang), name: ts }) : `#${n.rankImports}`} />
      </StatTiles>
      <p className="gx-note">
        {t(lang, 'explore.partnersMeta', { out: n.outDeg, in: n.inDeg })}
        {g ? ` · ${t(lang, 'explore.changeVsBase', { base: formatPeriod(d.base!.t, lang) })}: ${growthText(g, lang)}` : ''}
      </p>
      {cNow != null && cNow < MIN_COMPLETE ? (
        <Notice tone="warning" title={t(lang, 'explore.incompleteTitle', { name: nm, v: formatShare(cNow, lang) })}>{t(lang, 'explore.incompleteBody')}</Notice>
      ) : null}
      {n.x > 0.5 ? <Notice tone="warning" title={t(lang, 'explore.chokeCard', { name: nm, share: formatShare(n.x, lang) })} /> : null}
      <section className="lr-panel__section">
        <h3 className="lr-card__h">{t(lang, 'explore.topDest')}</h3>
        <Bars lang={lang} colour="flow-out" items={dests.map((e) => ({ key: e.key, label: iso(meta, e.t), value: e.value }))} onPick={(k) => set({ flow: k, focus: null })} />
      </section>
      <section className="lr-panel__section">
        <h3 className="lr-card__h">{t(lang, 'explore.topSup')}</h3>
        <Bars lang={lang} colour="flow-in" items={sups.map((e) => ({ key: e.key, label: iso(meta, e.s), value: e.value }))} onPick={(k) => set({ flow: k, focus: null })} />
      </section>
      <section className="lr-panel__section">
        {traj ? (
          <RangedStrip freq={st.f} lang={lang} label={t(lang, 'explore.overTime', { product: lang === 'ko' ? product.ko : product.en })}
            title={t(lang, 'explore.overTime', { product: lang === 'ko' ? product.ko : product.en })}
            periods={traj.periods} completeness={traj.c ?? undefined} seams={seams(d, i, traj.periods)}
            series={[
              { key: 'x', label: t(lang, 'explore.s.exports'), colour: 'flow-out', values: traj.x },
              { key: 'm', label: t(lang, 'explore.s.imports'), colour: 'flow-in', values: traj.m },
            ]}
            format={(v) => chartUSD(v, lang)} tableFormat={(v) => formatUSD(v, lang)} tickFormat={(v) => formatUSD(v, lang, { decimals: 0 })} zero
            current={st.t} base={st.base} complete={meta.complete[st.f]} coverage={meta.coverage[st.f]}
            codeBegins={st.f === 'A' && product.A[0] > 1995 && product.id !== 'TOTAL' ? product.A[0] : null}
            csvName={`${st.focus}-${product.slug}`} source={source(d)} cite={(ps) => citeSpan(d, ps)} onPick={(x) => set({ t: x })} height={150}
            prelim={prelimOf(d, i)} />
        ) : <p className="gx-note">{t(lang, 'explore.notStoredNode')}</p>}
      </section>
      {shares}
      {signs}
      <p className="lr-caption">{source(d)} {formatPeriod(snap.t, lang)}.{citeNow(d)}</p>
    </div>
  );
}

function FlowCard(d: DrawerData) {
  const { lang, meta, snap, st, set, product } = d;
  if (!snap || !st.flow) return <p className="gx-note">{t(lang, 'explore.loadingNetwork')}</p>;
  const [sI, tI] = st.flow.split('>').map((x) => idx(meta, x));
  const e = snap.edges.find((x) => x.s === sI && x.t === tI);
  const rev = snap.edges.find((x) => x.s === tI && x.t === sI);
  const sName = name(meta, sI, lang), tName = name(meta, tI, lang);
  const g = e && d.base ? growth(e.value, d.base.edge(e)) : null;
  const fb = st.f === 'A' ? d.flowFile?.A : d.flowFile?.L;
  const k = fb ? fb.flows.findIndex(([a, b]) => a === sI && b === tI) : -1;
  const world = new Map(d.series.map((r) => [r.t, r.world]));
  let chart: ReactNode = <p className="gx-note">{t(lang, 'explore.notStoredFlow')}</p>;
  if (fb && k >= 0 && (st.f === 'A' || st.lens === 'L')) {
    const drawn = fb.t.map((p, j) => { const w = fb.w[k][j], W = world.get(p); return w != null && W ? w * W : null; });
    // annual, mirror rule: a known mirror ratio means the importer reported, so the drawn value is its report
    const series = st.f === 'A'
      ? [
        { key: 'vm', label: t(lang, 'explore.imReport', { iso: iso(meta, tI) }), colour: 'flow-in', values: drawn.map((v, j) => (v != null && fb.mr[k][j] != null ? v : null)) },
        { key: 'vx', label: t(lang, 'explore.imReport', { iso: iso(meta, sI) }), colour: 'flow-out', values: drawn.map((v, j) => { const r = fb.mr[k][j]; return v != null && r ? v / r : null; }) },
        { key: 'w', label: t(lang, 'explore.drawnValue'), colour: 'viz-context', values: drawn.map((v, j) => (fb.mr[k][j] == null ? v : null)) },
      ].filter((x) => x.values.some((v) => v != null)).slice(0, 2)
      : [{ key: 'w', label: t(lang, 'explore.drawnValue'), colour: 'viz-focus', values: drawn }];
    chart = (
      <>
        <StripChart lang={lang} label={`${st.flow.replace('>', '→')}: ${t(lang, 'explore.flowOverTime')}`} title={t(lang, 'explore.flowOverTime')}
          periods={fb.t} series={series} format={(v) => chartUSD(v, lang)} tableFormat={(v) => formatUSD(v, lang)} tickFormat={(v) => formatUSD(v, lang, { decimals: 0 })} zero
          current={st.t} base={st.base} complete={meta.complete[st.f]} coverage={meta.coverage[st.f]} height={150}
          csvName={`${st.flow.replace('>', '-')}-${product.slug}`} source={source(d) + citeSpan(d, fb.t)} onPick={(x) => set({ t: x })} />
        {st.f === 'M' ? <p className="gx-note">{t(lang, 'explore.monthlyOneSide')}</p> : null}
      </>
    );
  }
  return (
    <div className="gx-card">
      <div className="lr-card__head">
        <p className="lr-kicker">{kicker(d)}</p>
        <h2 className="lr-card__name">{t(lang, 'explore.flowTitle', { s: sName, t: tName })}</h2>
        <p className="lr-card__sub"><span className="lr-iso">{st.flow.replace('>', '→')}</span>{e ? ` · ${e.est ? `${t(lang, 'explore.w.estimate')}: ${estName(lang, e.est, e.ky)}` : t(lang, 'explore.drawnFrom', { side: lang === 'ko' ? (e.src === 1 ? '수입국 신고' : '수출국 신고') : e.src === 1 ? 'importer’s report' : 'exporter’s report' })}` : ''}</p>
      </div>
      {[sI, tI].map((g) => {
        const c = completenessAt(d, g);
        return c != null && c < MIN_COMPLETE ? (
          <Notice key={g} tone="warning" title={t(lang, 'explore.incompleteTitle', { name: name(meta, g, lang), v: formatShare(c, lang) })}>{t(lang, 'explore.incompleteBody')}</Notice>
        ) : null;
      })}
      {e?.est ? <Notice tone="info" title={t(lang, 'explore.w.estTitle', { how: estName(lang, e.est, e.ky) })}>{t(lang, `explore.w.estBody${e.est}` as StringKey)}</Notice> : null}
      {e?.dv ? (
        <Notice tone="warning" title={t(lang, 'explore.w.divTitle')}>
          {divergeText(lang, e)}
          {e.div?.events.length ? <> {t(lang, 'explore.w.divEvents')} {e.div.events.map((id, k) => <span key={id}>{k ? ', ' : ''}<a href={`/${lang}/events/${id}`}>{id}</a></span>)}</> : null}
        </Notice>
      ) : null}
      {e ? (
        <>
          <StatTiles>
            <StatTile label={t(lang, 'explore.importerReports', { iso: iso(meta, tI) })} value={formatUSD(e.vm, lang)} meta={lang === 'ko' ? 'CIF' : 'imports, CIF'} />
            <StatTile label={t(lang, 'explore.exporterReports', { iso: iso(meta, sI) })} value={formatUSD(e.vx, lang)} meta={lang === 'ko' ? 'FOB' : 'exports, FOB'} />
            <StatTile label={t(lang, 'explore.mirrorRatio')} value={e.mr == null ? '–' : formatNumber(e.mr, lang, { decimals: 2 })} meta={t(lang, 'explore.mirrorMeta')} />
            <StatTile label={t(lang, 'explore.reverse')} value={formatUSD(rev?.value ?? null, lang)} meta={`${iso(meta, tI)}→${iso(meta, sI)}`} />
          </StatTiles>
          {e.mr != null && (e.mr < 0.8 || e.mr > 1.25) ? <Notice tone="serious" title={t(lang, 'explore.mirrorOutside')} /> : null}
          <p className="gx-note">{t(lang, 'explore.mirrorNote')}</p>
          <section className="lr-panel__section">
            <h3 className="lr-card__h">{t(lang, 'explore.ranks')}</h3>
            <p className="gx-plain">{t(lang, 'explore.rankOutLine', { r: e.ro, name: sName })}<br />{t(lang, 'explore.rankInLine', { r: e.ri, name: tName })}
              {g ? <><br />{t(lang, 'explore.changeVsBase', { base: formatPeriod(d.base!.t, lang) })}: {growthText(g, lang)}</> : null}</p>
          </section>
        </>
      ) : <p className="gx-note">{t(lang, 'explore.noSnap', { t: formatPeriod(st.t, lang) })}</p>}
      <section className="lr-panel__section">{chart}</section>
      <div className="gx-row gx-row--buttons">
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={() => set({ focus: iso(meta, sI), flow: null })}>{t(lang, 'explore.cardOf', { name: sName })}</button>
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={() => set({ focus: iso(meta, tI), flow: null })}>{t(lang, 'explore.cardOf', { name: tName })}</button>
      </div>
      <p className="lr-caption">{source(d)} {formatPeriod(snap.t, lang)}.{citeNow(d)}</p>
    </div>
  );
}

const PAIR_LABELS: Record<string, [StringKey, StringKey]> = {
  korea_index: ['explore.pair.ours', 'explore.pair.korea_index'],
  us_imports: ['explore.pair.ours', 'explore.pair.us_imports'],
  value_volume: ['explore.pair.value', 'explore.pair.volume'],
  price: ['explore.pair.unit_value', 'explore.pair.price'],
  output: ['explore.pair.trade', 'explore.pair.output'],
};

function checkSummary(c: Check, lang: Lang): string {
  const parts: string[] = [];
  if (typeof c.corr === 'number') parts.push(t(lang, 'explore.corr', { v: formatNumber(c.corr, lang, { decimals: 2 }) }));
  if (typeof c.worst === 'number') parts.push(t(lang, 'explore.worst', { v: formatPercentChange(c.worst, lang, { decimals: 1 }) }));
  if (typeof c.gap_mean === 'number') parts.push(t(lang, 'explore.gapMean', { v: formatPercentChange(c.gap_mean, lang, { decimals: 1 }) }));
  if (c.partner) parts.push(String(c.partner));
  if (c.node) parts.push(String(c.node));
  if (c.note) parts.push(String(c.note));
  // the monthly explorer's tier-0 checks
  const pc = (v: unknown) => (typeof v === 'number' ? formatShare(v / 100, lang, { decimals: 1 }) : '–');
  if (c.id === 'timing_share' && typeof c.share_w3 === 'number') {
    parts.push(t(lang, 'explore.w.timingLine', { v: formatShare(c.share_w3, lang), v12: formatShare(Number(c.share_w12 ?? 0), lang), n: formatNumber(Number(c.flows ?? 0), lang) }));
  }
  if (c.id === 'splice_backtest' && Array.isArray(c.rows)) {
    for (const r of c.rows as (string | number | null)[][]) {
      if (r[1] !== 'all') continue;
      parts.push(t(lang, 'explore.w.backtestLine', { w: Number(r[0]), s: pc(r[3]), s90: pc(r[4]), p: pc(r[7]), p90: pc(r[8]) }));
    }
  }
  if (c.id === 'windows_guard' && typeof c.tested === 'number') {
    parts.push(t(lang, 'explore.w.guardLine', { n: formatNumber(c.tested, lang), k: formatNumber(Number(c.single_month ?? 0), lang) }));
  }
  return parts.join(' · ');
}

function ChecksPanel(d: DrawerData) {
  const { lang, checks, checksIndex, product } = d;
  if (checks === undefined) return <p className="gx-note">{t(lang, 'explore.loading')}</p>;
  if (!checks) return <p className="gx-note">{t(lang, 'explore.checksNone')}</p>;
  return (
    <div className="gx-card">
      <div className="lr-card__head">
        <p className="lr-kicker">{lang === 'ko' ? product.ko : product.en}</p>
        <h2 className="lr-card__name">{t(lang, 'explore.checks')}</h2>
        <p className="lr-card__sub">{t(lang, 'explore.checksRun', { d: formatDate(checks.run_at, lang) })}</p>
      </div>
      <p className="gx-note">{t(lang, 'explore.checksIntro')}</p>
      {checks.tiers.map((tier) => (
        <section key={tier.tier} className="lr-panel__section">
          <h3 className="lr-card__h">{t(lang, 'explore.tier', { n: tier.tier })} · {t(lang, `explore.tier.${tier.tier}` as 'explore.tier.0')}</h3>
          <ul className="gx-checks">
            {tier.checks.map((c, k) => {
              const what = checksIndex?.checks[c.id];
              const labels = PAIR_LABELS[c.id];
              const pair = c.pair;
              return (
                <li key={`${c.id}-${k}`}>
                  <div className="gx-checks__head">
                    <span className="gx-checks__name">{what ? what[lang] : c.id}</span>
                    <StatusWord lang={lang} status={c.status} />
                  </div>
                  {checkSummary(c, lang) ? <p className="gx-note">{checkSummary(c, lang)}</p> : null}
                  {what ? <p className="gx-note">{what.threshold[lang]}</p> : null}
                  {pair && labels ? (
                    <CheckPairChart lang={lang} label={`${what ? what[lang] : c.id}`} periods={pair.t} base={pair.base}
                      a={{ label: c.id === 'us_imports' && c.partner ? `${t(lang, labels[0])} (USA←${c.partner})` : t(lang, labels[0]), values: pair.a }}
                      b={{ label: t(lang, labels[1]), values: pair.b }}
                      csvName={`check-${c.id}${c.partner ? `-${c.partner}` : ''}`} height={130}
                      source={lang === 'ko' ? `자료: UN Comtrade${c.against ? `; ${c.against}` : ''}. 두 선 모두 ${pair.base} = 100.` : `Source: UN Comtrade${c.against ? `; ${c.against}` : ''}. Both lines ${pair.base} = 100.`}>
                      <p className="gx-pairkey">
                        <span><i style={{ background: 'var(--viz-1)' }} aria-hidden />{c.id === 'us_imports' && c.partner ? `${t(lang, labels[0])} (USA←${c.partner})` : t(lang, labels[0])}</span>
                        <span><i style={{ background: 'var(--viz-2)' }} aria-hidden />{t(lang, labels[1])}</span>
                      </p>
                    </CheckPairChart>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
