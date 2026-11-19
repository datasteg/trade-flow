'use client';
// Everything on a chain page that depends on the year: the year and focus-economy selectors, the ChainTrail, the two
// network views (Stage map | Trail), the explainer of two-way trade, one section per stage and the focus economy's
// place. The server renders the latest complete year; other years come from /data/chains/<chain>.json, fetched once.
// State lives in the hash (#t=2019&v=trail&s=cathode&size=total), so a view can be shared; a hash without "=" is an
// anchor (#stage-cathode) and leaves the state alone. The focus economy is ?focus=ISO3 (none by default), the one
// state the select, a click on the map, Esc and back/forward all go through; it re-centres the page on that economy:
// the map's side panel, the ladder cards, the stage tabs, each stage's facts and tables, and a summary line, all from
// the stage snapshots (focus.ts), plus its place across the chain from /data/econ/<chain>/<year>.json.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, HSCode, Notice, SegmentedControl, TrailRule } from '@larch/ui';
import { t } from '@/lib/i18n';
import { ChainTrail } from './ChainTrail';
import { ChartFrame } from './ChartFrame';
import { setPageContext } from '@/lib/pageContext';
import { useFocusSnaps } from './focus';
import { FocusPlace } from './FocusPlace';
import { exploreHref, fmtHHI, fmtShare, fmtUSD, focusFrom, pct, rungs, sliceOf, stageTag, stageVar, uvShown } from './model';
import { MAP_SIZES, StageMap, type MapSize } from './StageMap';
import { StageSection, type StageFocus } from './StageSection';
import { TrailSankey } from './TrailSankey';
import type { ChainFile, ChainModel, ChainSeries, EconFile, YearSlice } from './types';

type View = 'map' | 'trail';

const econCache = new Map<string, Promise<EconFile>>();
function loadEcon(id: string, year: number): Promise<EconFile> {
  const key = `${id}/${year}`;
  let p = econCache.get(key);
  if (!p) {
    p = fetch(`/data/econ/${id}/${year}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<EconFile>;
    });
    p.catch(() => econCache.delete(key));
    econCache.set(key, p);
  }
  return p;
}

const cache = new Map<string, Promise<ChainFile>>();
function loadChain(id: string): Promise<ChainFile> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/data/chains/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<ChainFile>;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

function readHash(): URLSearchParams | null {
  const h = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return h.includes('=') ? new URLSearchParams(h) : null;
}

export function ChainBody({ model, initialYear, initialSlice, baseSlice, series }: {
  model: ChainModel;
  initialYear: number;
  initialSlice: YearSlice;
  baseSlice: YearSlice;
  series: ChainSeries;
}) {
  const lang = model.lang;
  const [year, setYear] = useState(initialYear);
  const [slice, setSlice] = useState<YearSlice>(initialSlice);
  const [shown, setShown] = useState(initialYear);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [view, setView] = useState<View>('map');
  const [size, setSize] = useState<MapSize>('split');
  const [focus, setFocus] = useState<string | null>(null);
  const [econ, setEcon] = useState<{ year: number; file: EconFile | null; status: 'loading' | 'ready' | 'error' } | null>(null);
  const stagesWithData = (n: number, sl: YearSlice) => model.stages.filter((s) => s.stage === n && sl[s.key]);
  const defaultMapKey = useCallback((sl: YearSlice, y: number) => {
    const ck = model.chokepoint[String(y)];
    if (ck && sl[ck]) return ck;
    return model.stages.find((s) => s.role === null && sl[s.key])?.key ?? model.stages[0].key;
  }, [model]);
  const [mapKey, setMapKey] = useState<string>(() => defaultMapKey(initialSlice, initialYear));
  const fullRef = useRef<ChainFile | null>(null);

  // Load a year: from the server's slice when it is the initial year, else from the chain file.
  const goTo = useCallback((y: number) => {
    setYear(y);
    if (y === initialYear) { setSlice(initialSlice); setShown(y); setStatus('idle'); return; }
    const apply = (f: ChainFile) => { setSlice(sliceOf(f, y)); setShown(y); setStatus('idle'); };
    if (fullRef.current) { apply(fullRef.current); return; }
    setStatus('loading');
    loadChain(model.id).then((f) => { fullRef.current = f; apply(f); }).catch(() => setStatus('error'));
  }, [initialSlice, initialYear, model.id]);

  // The hash: read once on load and on back/forward; write on every change of year, view or map stage.
  const applyHash = useCallback(() => {
    const h = readHash();
    if (!h) return;
    const ty = Number(h.get('t'));
    if (model.years.includes(ty)) goTo(ty);
    const v = h.get('v');
    if (v === 'map' || v === 'trail') setView(v);
    const s = h.get('s');
    if (s && model.stages.some((x) => x.key === s)) setMapKey(s);
    const z = h.get('size') as MapSize | null;
    if (z && MAP_SIZES.includes(z)) setSize(z);
  }, [goTo, model]);
  useEffect(() => {
    setFocus(focusFrom(location.search, model.nodes));
    applyHash();
    const on = () => applyHash();
    // back/forward between focus economies: ?focus= is read again
    const pop = () => { setFocus(focusFrom(location.search, model.nodes)); applyHash(); };
    addEventListener('hashchange', on);
    addEventListener('popstate', pop);
    return () => { removeEventListener('hashchange', on); removeEventListener('popstate', pop); };
  }, [applyHash, model.nodes]);
  const writeHash = (next: { t?: number; v?: View; s?: string; size?: MapSize }) => {
    const ty = next.t ?? year, vv = next.v ?? view, ss = next.s ?? mapKey, zz = next.size ?? size;
    const p = new URLSearchParams();
    if (ty !== initialYear) p.set('t', String(ty));
    if (vv !== 'map') p.set('v', vv);
    if (ss !== defaultMapKey(initialSlice, initialYear)) p.set('s', ss);
    if (zz !== 'split') p.set('size', zz);
    const h = p.toString();
    history.replaceState(null, '', h ? `#${h.replace(/%3A/g, ':')}` : location.pathname + location.search);
  };
  // the focus economy: ?focus=ISO3, kept with the hash; each change is a history entry, so back undoes it
  const [said, setSaid] = useState('');
  const chooseFocus = useCallback((iso: string | null) => {
    setFocus(iso);
    const q = new URLSearchParams(location.search);
    if (iso) q.set('focus', iso); else q.delete('focus');
    const qs = q.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
    if (url !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', url);
    const i = iso ? model.nodes.findIndex((x) => x[0] === iso) : -1;
    setSaid(i >= 0 ? t(lang, 'chains.focus.announce', { name: model.nodes[i][1] }) : t(lang, 'chains.focus.cleared'));
  }, [lang, model.nodes]);
  // Esc clears the focus (not while typing or choosing in a form field)
  useEffect(() => {
    if (!focus) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      chooseFocus(null);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [focus, chooseFocus]);
  useEffect(() => {
    if (!focus) { setEcon(null); return; }
    let live = true;
    setEcon({ year: shown, file: null, status: 'loading' });
    loadEcon(model.id, shown).then((f) => { if (live) setEcon({ year: shown, file: f, status: 'ready' }); })
      .catch(() => { if (live) setEcon({ year: shown, file: null, status: 'error' }); });
    return () => { live = false; };
  }, [focus, shown, model.id]);
  const focusIdx = focus ? model.nodes.findIndex((n) => n[0] === focus) : -1;
  const focusInfo = focus && focusIdx >= 0 ? { i: focusIdx, iso: focus, name: model.nodes[focusIdx][1] } : null;
  const snaps = useFocusSnaps(model.stages, slice, shown, focusInfo ? focusInfo.i : null);
  // the focus economy, for the family strip's context links (components/Family.tsx)
  useEffect(() => {
    setPageContext(focusInfo ? { focus: { iso: focusInfo.iso, name: focusInfo.name } } : {});
    return () => setPageContext({});
  }, [focusInfo?.iso, focusInfo?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapStatus = snaps?.year === shown ? snaps.status : 'loading';
  const stageFocus = (key: string): StageFocus | null => (focusInfo
    ? { ...focusInfo, at: snapStatus === 'ready' ? snaps!.at[key] ?? null : null, status: snapStatus }
    : null);
  const trailFocus = useMemo(() => (focusInfo ? { iso: focusInfo.iso, snaps: snaps?.year === shown ? snaps : null } : null), [focusInfo?.iso, snaps, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  // where the focus economy is strong or dependent: top-three exporter, top-three net importer (summary line)
  const focusSummary = focusInfo && snapStatus === 'ready' ? (() => {
    const item = (s: { name: string }, rank: number) => t(lang, 'chains.focus.summary.item', { stage: s.name, rank });
    const byStage = [...model.stages].sort((a, b) => a.stage - b.stage);
    const top = byStage.flatMap((s) => { const n = snaps!.at[s.key]?.n; return n && n.exports > 0 && n.rankExports <= 3 ? [item(s, n.rankExports)] : []; });
    const net = byStage.flatMap((s) => { const r = snaps!.at[s.key]?.netImpRank; return r != null && r <= 3 ? [item(s, r)] : []; });
    return [
      top.length ? t(lang, 'chains.focus.summary.top', { list: top.join(', ') }) : t(lang, 'chains.focus.summary.topNone'),
      net.length ? t(lang, 'chains.focus.summary.net', { list: net.join(', ') }) : t(lang, 'chains.focus.summary.netNone'),
    ].join(' ');
  })() : null;
  // a rung's net exports for the focus economy, summed over its products with trade (stage tabs)
  const rungNet = (k: number): number | null => {
    if (!focusInfo || snapStatus !== 'ready') return null;
    const list = model.stages.filter((s) => s.stage === k && snaps!.at[s.key]?.n);
    return list.length ? list.reduce((a, s) => a + snaps!.at[s.key]!.n!.net, 0) : null;
  };
  const focusOptions = useMemo(() => model.focusable.map((i) => ({ iso: model.nodes[i][0], name: model.nodes[i][1] }))
    .sort((a, b) => a.name.localeCompare(b.name, lang)), [model, lang]);

  const choke = model.chokepoint[String(shown)] ?? null;
  const partial = shown > model.complete;
  const mapStage = model.stages.find((s) => s.key === mapKey) ?? model.stages[0];
  const ordered = useMemo(() => [...model.stages].sort((a, b) => a.stage - b.stage), [model.stages]);
  const n = model.levels.length;
  const R = rungs(n);

  const trailTable = (
    <DataTable
      columns={[
        { key: 'st', label: t(lang, 'chains.trailTable.col.stage') },
        { key: 'p', label: t(lang, 'chains.trailTable.col.product') },
        { key: 'c', label: t(lang, 'chains.trailTable.col.codes') },
        { key: 'w', label: t(lang, 'chains.trailTable.col.world'), num: true, sortable: true },
        { key: 'u', label: t(lang, 'chains.trailTable.col.uv'), num: true },
        { key: 'h', label: t(lang, 'chains.trailTable.col.hhi'), num: true, sortable: true },
        { key: 'x', label: t(lang, 'chains.trailTable.col.top') },
        { key: 'xs', label: t(lang, 'chains.trailTable.col.topShare'), num: true },
      ]}
      rows={ordered.map((s) => {
        const y = slice[s.key];
        const top = y?.top_exporters[0];
        return {
          id: s.key,
          cells: {
            st: stageTag(lang, s.stage),
            p: <a href={`#stage-${s.key}`}>{s.name}</a>,
            c: <span className="ch-codes">{s.codes.map((c) => <HSCode key={c} lang={lang} code={c} residual={s.residual} />)}</span>,
            w: y ? (y.world / 1e9).toFixed(y.world < 1e9 ? 3 : 1) : '–',
            u: y && uvShown(y) ? (y.usd_per_kg! < 1 ? y.usd_per_kg!.toFixed(2) : y.usd_per_kg!.toFixed(1)) : '–',
            h: y ? fmtHHI(y.hhi) : '–',
            x: top ? <span className="lr-iso">{model.nodes[top[0]]?.[0]}</span> : '–',
            xs: top ? pct(top[1])?.toFixed(1) : '–',
          },
          sort: { w: y?.world ?? null, h: y?.hhi ?? null },
        };
      })}
    />
  );
  const trailCsv = {
    name: `${model.id}-stages-${shown}.csv`,
    header: [t(lang, 'chains.trailTable.col.stage'), t(lang, 'chains.trailTable.col.product'), t(lang, 'chains.trailTable.col.codes'), t(lang, 'chains.trailTable.col.hhi'), t(lang, 'chains.trailTable.col.top'), t(lang, 'chains.trailTable.col.topShare')],
    rows: ordered.map((s) => {
      const y = slice[s.key];
      const top = y?.top_exporters[0];
      return [stageTag(lang, s.stage), s.name, s.codes.join(' '), y?.hhi ?? null, top ? model.nodes[top[0]]?.[0] ?? null : null, top ? pct(top[1]) : null];
    }),
  };

  return (
    <div className="ch-body" data-loading={status === 'loading' || undefined}>
      <div className="ch-toolbar">
        <label className="lr-field" htmlFor="ch-year">
          <span className="lr-label">{t(lang, 'chains.year.label')}</span>
          <select id="ch-year" className="ch-select" value={year}
            onChange={(e) => { const y = Number(e.target.value); goTo(y); writeHash({ t: y }); }}>
            {[...model.years].reverse().map((y) => (
              <option key={y} value={y}>{t(lang, y > model.complete ? 'chains.year.partial' : 'chains.year.option', { year: y })}</option>
            ))}
          </select>
        </label>
        <label className="lr-field" htmlFor="ch-focus">
          <span className="lr-label">{t(lang, 'chains.focus.label')}</span>
          <select id="ch-focus" className="ch-select" value={focus ?? ''} onChange={(e) => chooseFocus(e.target.value || null)}>
            <option value="">{t(lang, 'chains.focus.none')}</option>
            {focusOptions.map((o) => <option key={o.iso} value={o.iso}>{o.name} ({o.iso})</option>)}
          </select>
        </label>
        <p className="ch-toolbar__status" aria-live="polite">
          {status === 'loading' ? t(lang, 'chains.year.loading', { year }) : status === 'error' ? t(lang, 'chains.year.error', { year, shown }) : ''}
        </p>
        <nav className="ch-jump" aria-label={t(lang, 'chains.jump.label')}>
          {R.map((k) => {
            const first = ordered.find((s) => s.stage === k);
            return first ? <a key={k} href={`#stage-${first.key}`} style={{ ['--stage' as string]: stageVar(k, n) }}><i aria-hidden />{stageTag(lang, k)}</a> : null;
          })}
          {focusInfo ? <a href="#focus"><span className="lr-marker lr-marker--sm" aria-hidden />{focusInfo.name}</a> : null}
        </nav>
      </div>

      <p className="ch-sr" aria-live="polite">{said}</p>
      {focusInfo ? (
        <p className="ch-focusline">
          <span className="lr-marker lr-marker--sm" aria-hidden /> <b>{t(lang, 'chains.focus.summary.h', { name: focusInfo.name, year: shown })}</b>{' '}
          {focusSummary ?? t(lang, snapStatus === 'error' ? 'chains.focus.error' : 'chains.focus.loading', { name: focusInfo.name })}
        </p>
      ) : null}

      {partial ? (
        <Notice tone="warning" title={t(lang, 'chains.partial.title', { year: shown })}>
          {t(lang, 'chains.partial.body', { year: shown, share: fmtShare(model.coverage[String(shown)] ?? null, lang) })}
        </Notice>
      ) : null}

      <section className="ch-section" aria-labelledby="trail-h">
        <h2 className="lr-h2" id="trail-h">{t(lang, 'chains.trail.h', { year: shown })}</h2>
        <ChartFrame lang={lang} wide caption={<>{t(lang, 'chains.trail.caption', { year: shown })} {t(lang, 'chains.source')}.</>} csv={trailCsv} table={trailTable}>
          <ChainTrail lang={lang} levels={model.levels} stages={model.stages} slice={slice} year={shown} choke={choke} nodes={model.nodes} focus={trailFocus} />
        </ChartFrame>
      </section>

      <section className="ch-section" aria-labelledby="views-h">
        <div className="ch-section__head">
          <h2 className="lr-h2" id="views-h">{t(lang, 'chains.view.h', { year: shown })}</h2>
          <SegmentedControl<View>
            label={t(lang, 'chains.view.label')}
            value={view}
            onChange={(v) => { setView(v); writeHash({ v }); }}
            options={[{ value: 'map', label: t(lang, 'chains.view.map') }, { value: 'trail', label: t(lang, 'chains.view.trail') }]}
          />
        </div>
        {view === 'map' ? (
          <div className="ch-stagemap">
            <div className="ch-tabs" role="tablist" aria-label={t(lang, 'chains.map.stages')} style={{ ['--levels' as string]: n }}>
              {R.map((k) => {
                const list = model.stages.filter((s) => s.stage === k);
                const withData = stagesWithData(k, slice);
                const selected = mapStage.stage === k;
                const net = rungNet(k);
                const netText = focusInfo && snapStatus === 'ready' && list.length
                  ? (net == null || net === 0 ? t(lang, 'chains.map.tab.none', { name: focusInfo.name })
                    : t(lang, net > 0 ? 'chains.map.tab.netX' : 'chains.map.tab.netM', { name: focusInfo.name, v: fmtUSD(Math.abs(net), lang) }))
                  : null;
                return (
                  <button key={k} type="button" role="tab" aria-selected={selected} disabled={!list.length}
                    style={{ ['--stage' as string]: stageVar(k, n) }}
                    onClick={() => { const key = (withData.find((s) => s.role === null) ?? withData[0] ?? list[0])?.key; if (key) { setMapKey(key); writeHash({ s: key }); } }}>
                    <span className="lr-marker" aria-hidden /><b>{stageTag(lang, k)}</b>{netText ? <span className="ch-tabs__name">{model.levels[k - 1].name}</span> : <> {model.levels[k - 1].name}</>}
                    {netText ? (
                      <span className={`ch-tabs__net ch-tabs__net--${net == null || net === 0 ? 'none' : net > 0 ? 'x' : 'm'}`} title={netText}>
                        <span aria-hidden>{net == null || net === 0 ? '·' : net > 0 ? '▲' : '▼'}</span><span className="ch-sr">{netText}</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {model.stages.filter((s) => s.stage === mapStage.stage).length > 1 ? (
              <div className="lr-seg ch-products" role="group" aria-label={t(lang, 'chains.map.product')}>
                {model.stages.filter((s) => s.stage === mapStage.stage).map((s) => (
                  <button key={s.key} type="button" aria-pressed={s.key === mapStage.key} onClick={() => { setMapKey(s.key); writeHash({ s: s.key }); }}>
                    {s.name}
                  </button>
                ))}
              </div>
            ) : null}
            <StageMap
              key={`${mapStage.key}-${shown}`}
              lang={lang}
              product={mapStage.product}
              productName={mapStage.name}
              year={shown}
              data={slice[mapStage.key]}
              nodes={model.nodes}
              chokepoint={choke === mapStage.key}
              exploreHref={exploreHref(lang, mapStage.product, shown, focusInfo?.iso)}
              focus={focusInfo?.iso ?? null}
              focusName={focusInfo?.name ?? null}
              focusAt={snapStatus === 'ready' ? snaps!.at[mapStage.key] ?? null : null}
              focusStatus={snapStatus}
              onFocus={chooseFocus}
              size={size}
              onSize={(z) => { setSize(z); writeHash({ size: z }); }}
            />
          </div>
        ) : (
          <TrailSankey lang={lang} chainName={model.name} chainId={model.id} levels={model.levels} stages={model.stages} slice={slice} year={shown} choke={choke} nodes={model.nodes} />
        )}
      </section>

      <TrailRule />

      <details className="ch-why">
        <summary>{t(lang, 'chains.tw.why.title')}</summary>
        <ul>
          {([1, 2, 3, 4] as const).map((n) => {
            const [head, ...rest] = t(lang, `chains.tw.why.${n}`).split('. ');
            return <li key={n}><b>{head}.</b> {rest.join('. ')}</li>;
          })}
        </ul>
        <p>{t(lang, 'chains.tw.why.rule')} <a href={`/${lang}/method#two-way`}>{t(lang, 'chains.tw.why.link')}</a></p>
      </details>

      {ordered.map((s) => (
        <StageSection key={s.key} model={model} s={s} slice={slice} base={baseSlice[s.key]} series={series[s.key]} year={shown} focus={stageFocus(s.key)} />
      ))}

      {focusInfo ? <FocusPlace model={model} econ={econ?.file ?? null} status={econ?.status ?? 'loading'} focus={focusInfo} year={shown} /> : null}
    </div>
  );
}
