'use client';
// The network map for React. NetViewHost draws a snapshot the caller already has (the explorer); NetworkMap loads
// what it needs from /data itself (chain, event and case pages): meta, the snapshot, the base for change colouring,
// the series for the fixed scale and, for stage colouring, the chain.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatPeriod, type Lang } from '@larch/ui/format';
import { stageLeaders } from '../chains';
import { loadGroups, periodEnd, resolveColouring, today, type GroupColouring, type GroupsFile } from '../groups';
import { compareBase, decodeSeries, type BaseCompare } from '../decode';
import { loadChain, loadMeta, loadSeries, loadSnapshot } from '../load';
import { NetView, type Insets } from '../netview';
import { isGrouping, type ColorBy, type Layout, type Scale, type SizeBy } from '../scales';
import { DEFAULT_CONFIG, type ViewConfig } from '../scene';
import { s } from '../strings';
import { flowsTable, nodesTable } from '../tables';
import type { Freq, Lens, Meta, Rule, Snap } from '../types';
import { addMonths, defaultBase, findProduct, lensWindow, productName } from '../util';
import { sourceLine, supplementLine } from '../words';
import { ChartFrame } from './ChartFrame';
import { downloadCSV, tableCSV, type ChartTable } from '../charts/common';
import { DataTable } from '@larch/ui';
import '../net.css';

export interface NetViewHostProps {
  lang: Lang;
  meta: Meta;
  /** The snapshot to draw; null keeps the last one (at opacity-refetch while `loading`). */
  snap: Snap | null;
  config: Partial<ViewConfig>;
  /** Ease sizes and positions when the snapshot changes (default true). */
  animate?: boolean;
  loading?: boolean;
  /** A message over the map (an error), null for none. */
  message?: string | null;
  insets?: Partial<Insets>;
  interactive?: boolean;
  productLabel?: string;
  /** Economy tooltips: full (default) or brief (NetViewOptions.tip). */
  tip?: 'full' | 'brief';
  onSelectNode?: (iso: string | null) => void;
  onSelectFlow?: (key: string | null) => void;
  onRender?: (view: NetView) => void;
  /** The NetView instance, for fit(), ensureVisible() and drawn(). */
  viewRef?: { current: NetView | null };
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** NetView in a div that fills its parent. */
export function NetViewHost(p: NetViewHostProps) {
  const el = useRef<HTMLDivElement>(null);
  const view = useRef<NetView | null>(null);
  const handlers = useRef(p);
  handlers.current = p;
  const lastSnap = useRef<Snap | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const nv = new NetView(el.current, {
      lang: p.lang, meta: p.meta, interactive: p.interactive ?? true, insets: p.insets, productLabel: p.productLabel, tip: p.tip,
      onSelectNode: (id) => handlers.current.onSelectNode?.(id),
      onSelectFlow: (k) => handlers.current.onSelectFlow?.(k),
      onRender: (v) => handlers.current.onRender?.(v),
    });
    view.current = nv;
    if (p.viewRef) p.viewRef.current = nv;
    return () => { nv.destroy(); view.current = null; if (p.viewRef) p.viewRef.current = null; };
    // created once per meta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.meta]);

  useEffect(() => { view.current?.setLang(p.lang); }, [p.lang]);
  useEffect(() => { if (p.productLabel) view.current?.setProductLabel(p.productLabel); }, [p.productLabel]);
  useEffect(() => { if (p.insets) view.current?.setInsets(p.insets); }, [p.insets?.top, p.insets?.right, p.insets?.bottom, p.insets?.left]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { view.current?.setLoading(!!p.loading); }, [p.loading]);
  useEffect(() => { if (p.message !== undefined) view.current?.message(p.message); }, [p.message]);
  useEffect(() => {
    const nv = view.current;
    if (!nv || !p.snap) return;
    const changed = lastSnap.current !== p.snap;
    lastSnap.current = p.snap;
    nv.render(p.snap, p.config, changed && (p.animate ?? true));
  }, [p.snap, p.config, p.animate]);

  return <div ref={el} className={['ln-host', p.className].filter(Boolean).join(' ')} style={p.style}>{p.children}</div>;
}

export interface NetworkMapProps {
  lang: Lang;
  /** TOTAL, HS:<chapter>, B:<basket> or C:<chain>:<stage> (meta.products ids and aliases). */
  product: string;
  /** A years (default), M months. */
  freq?: Freq;
  /** YYYY or YYYYMM; default the last complete period (meta.complete). */
  period?: number;
  /** Monthly lens (default L): the window of the one monthly rule it stands for, L 12 months, M 3 months (snap/W). */
  lens?: Lens;
  /** Annual flow rule (all goods only; default mirror). */
  rule?: Rule;
  /** Base for change colouring: default 2017 (years) or 12 months back. */
  base?: number | null;
  colorBy?: ColorBy;
  sizeBy?: SizeBy;
  scale?: Scale;
  layout?: Layout;
  /** Top k flows per economy (1–10, default 2), share floor (default 0.0002 = 0.02%), labels (default 25). */
  k?: number;
  min?: number;
  labels?: number;
  /** Selected economy (ISO3) and flow ("CHN>USA"). Controlled when given; clicks call onSelect. */
  focus?: string | null;
  flow?: string | null;
  /** Trade blocs coloured (colorBy "bloc"), in order: an economy in two takes the first; default EU, ASEAN, USMCA. */
  blocs?: string[];
  /** The club highlighted (colorBy "club"); default G7. */
  club?: string;
  /** ISO3 codes (colorBy "custom"). */
  custom?: string[];
  /** Read bloc and club membership today instead of at the end of the period (default false). */
  membershipToday?: boolean;
  /** Economies drawn with a dashed outline (an event's economies). */
  outline?: string[];
  /** CSS height of the map (default 480). */
  height?: number | string;
  /** Hover, click, keyboard and zoom (default true). */
  interactive?: boolean;
  /** Economy tooltips: full (default) or brief, beside the economy (a page that pins the rest in a panel). */
  tip?: 'full' | 'brief';
  /** "Show as table" and CSV under the map (default true). */
  table?: boolean;
  /** The source line under the map (default true). */
  source?: boolean;
  onSelect?: (sel: { focus: string | null; flow: string | null }) => void;
  /** After each render: the snapshot and what is drawn. */
  onRender?: (view: NetView) => void;
  className?: string;
}

/** The network map, self-loading. See packages/net/README.md for the props. */
export function NetworkMap(p: NetworkMapProps) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [base, setBase] = useState<BaseCompare | null>(null);
  const [ref, setRef] = useState<number | null>(null);
  const [stageOf, setStageOf] = useState<{ of: Record<string, number>; count: number } | null>(null);
  const [groupsFile, setGroupsFile] = useState<GroupsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<{ focus: string | null; flow: string | null }>({ focus: p.focus ?? null, flow: p.flow ?? null });
  const [open, setOpen] = useState(false);
  const viewRef = useRef<NetView | null>(null);
  const [drawnTick, setDrawnTick] = useState(0);

  useEffect(() => { setSel({ focus: p.focus ?? null, flow: p.flow ?? null }); }, [p.focus, p.flow]);
  useEffect(() => { loadMeta().then(setMeta).catch(() => setError(s(p.lang, 'loadFailed'))); }, [p.lang]);

  const product = meta ? findProduct(meta, p.product) : null;
  const freq: Freq = p.freq === 'M' && product?.M ? 'M' : 'A';
  const t = meta ? (p.period ?? meta.complete[freq]) : null;
  const lens: Lens | null = freq === 'M' ? (p.lens === 'M' ? 'M' : 'L') : null;
  const win = freq === 'M' ? lensWindow(lens) : null;   // months: the windows of the one monthly rule (snap/W)
  const rule: Rule = freq === 'A' && product?.id === 'TOTAL' ? (p.rule ?? 'mirror') : 'mirror';
  const colorBy = p.colorBy ?? 'region';
  const first = product ? (freq === 'A' ? product.A[0] : product.M?.[0]) : undefined;
  const baseT = t != null ? (p.base ?? defaultBase(t, freq, first)) : null;

  useEffect(() => {
    if (!meta || !product || t == null) return;
    let live = true;
    setLoading(true);
    const o = { win: win ?? undefined, rule };
    loadSnapshot(meta, product.id, freq, t, o).then((x) => {
      if (!live) return;
      setSnap(x);
      setError(x ? null : s(p.lang, 'noData'));
      setLoading(false);
    }).catch(() => { if (live) { setError(s(p.lang, 'loadFailed')); setLoading(false); } });
    return () => { live = false; };
  }, [meta, product, freq, t, win, rule, p.lang]);

  useEffect(() => {
    if (!meta || !product || baseT == null || colorBy !== 'change') { setBase(null); return; }
    let live = true;
    loadSnapshot(meta, product.id, freq, baseT, { win: win ?? undefined, rule }).then((b) => { if (live) setBase(b ? compareBase(b) : null); }).catch(() => undefined);
    return () => { live = false; };
  }, [meta, product, freq, baseT, win, rule, colorBy]);

  useEffect(() => {
    if (!meta || !product) return;
    let live = true;
    loadSeries(meta, product.id, freq === 'A' ? 'A' : 'W').then((raw) => {
      if (!live || !raw) return;
      const rows = decodeSeries(raw, freq === 'A' ? rule : String(win ?? 12));
      setRef(Math.max(0, ...rows.map((r) => r.world)) || null);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [meta, product, freq, rule, win]);

  useEffect(() => {
    if (!meta || !product?.chain || colorBy !== 'stage' || t == null) { setStageOf(null); return; }
    let live = true;
    loadChain(product.chain).then((c) => {
      if (live && c) setStageOf({ of: stageLeaders(meta, c, freq === 'A' ? t : Math.floor(t / 100)), count: c.levels.length });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [meta, product, colorBy, t, freq]);

  useEffect(() => {
    if (!isGrouping(colorBy) || groupsFile) return;
    let live = true;
    loadGroups().then((g) => { if (live) setGroupsFile(g); }).catch(() => undefined);
    return () => { live = false; };
  }, [colorBy, groupsFile]);
  const groups = useMemo<GroupColouring | null>(() => {
    if (!groupsFile || !isGrouping(colorBy) || t == null) return null;
    return resolveColouring(groupsFile, colorBy, {
      blocs: p.blocs ?? ['EU', 'ASEAN', 'USMCA'], club: p.club ?? 'G7', custom: p.custom,
      date: p.membershipToday ? today() : periodEnd(t, freq),
    });
  }, [groupsFile, colorBy, t, freq, p.blocs, p.club, p.custom, p.membershipToday]);

  const config = useMemo<Partial<ViewConfig>>(() => ({
    ...DEFAULT_CONFIG,
    layout: p.layout ?? 'map', sizeBy: p.sizeBy ?? 'total', scale: p.scale ?? 'fixed', ref,
    colorBy, k: p.k ?? 2, min: p.min ?? 0.0002, labels: p.labels ?? 25,
    focus: sel.focus, flow: sel.flow,
    groups, outline: p.outline ?? [], base, stageOf: stageOf?.of ?? null, stageCount: stageOf?.count ?? null,
  }), [p.layout, p.sizeBy, p.scale, ref, colorBy, p.k, p.min, p.labels, sel.focus, sel.flow, groups, p.outline, base, stageOf]);

  const select = (next: { focus: string | null; flow: string | null }) => {
    if (p.onSelect) p.onSelect(next);
    if (p.focus === undefined && p.flow === undefined) setSel(next);
  };

  const label = productName(product, p.lang);
  // the months the map sums reach a supplement (Korea's customs months): cite it
  const cite = meta && freq === 'M' && t != null ? supplementLine(p.lang, meta, addMonths(t, 1 - (win ?? 1)), t) : '';
  const src = `${sourceLine(p.lang, { freq, rule, w: win, total: product?.id === 'TOTAL' })}${t != null ? ` ${formatPeriod(t, p.lang)}.` : ''}${cite ? ` ${cite}` : ''}`;
  const drawn = viewRef.current?.drawn();
  const tables = open && meta && snap && drawn ? { flows: flowsTable(meta, p.lang, snap, drawn.edges, config.colorBy === 'change' ? base : null), nodes: nodesTable(meta, p.lang, snap, drawn.nodes, sel.focus) } : null;
  void drawnTick;

  if (!meta) return <div className={['ln-mapbox', p.className].filter(Boolean).join(' ')} style={{ height: p.height ?? 480 }} aria-busy="true"><p className="ln-msg">{error ?? s(p.lang, 'loading')}</p></div>;
  return (
    <div className={['ln-mapwrap', p.className].filter(Boolean).join(' ')}>
      <NetViewHost
        lang={p.lang} meta={meta} snap={snap} config={config} loading={loading} message={error}
        interactive={p.interactive ?? true} productLabel={label} viewRef={viewRef} tip={p.tip}
        onSelectNode={(id) => select({ focus: id && id === sel.focus ? null : id, flow: null })}
        onSelectFlow={(k) => select({ focus: null, flow: k })}
        onRender={(v) => { setDrawnTick((x) => x + 1); p.onRender?.(v); }}
        className="ln-mapbox" style={{ height: p.height ?? 480 }}
      />
      {p.source !== false ? <p className="lr-caption ln-chart__source">{src}</p> : null}
      {p.table !== false ? (
        <div className="ln-chart__tools">
          <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>{s(p.lang, open ? 'hideTable' : 'showTable')}</button>
          {tables ? <>
            <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={() => downloadCSV(`${product?.slug ?? 'flows'}-${t}-flows`, tableCSV(tables.flows, src))}>{s(p.lang, 'csv')} · {p.lang === 'ko' ? '교역 흐름' : 'flows'}</button>
            <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={() => downloadCSV(`${product?.slug ?? 'nodes'}-${t}-economies`, tableCSV(tables.nodes, src))}>{s(p.lang, 'csv')} · {p.lang === 'ko' ? '경제권' : 'economies'}</button>
          </> : null}
        </div>
      ) : null}
      {tables ? <MapTables lang={p.lang} flows={tables.flows} nodes={tables.nodes} /> : null}
    </div>
  );
}

/** The two tables behind a map: the drawn flows and the drawn economies. */
export function MapTables({ lang, flows, nodes }: { lang: Lang; flows: ChartTable; nodes: ChartTable }) {
  const conv = (t: ChartTable) => ({
    columns: t.columns.map((c) => ({ key: c.key, label: c.label, num: c.num, sortable: true })),
    rows: t.rows.map((r) => ({ id: r.id, cells: r.cells, sort: r.raw, focus: r.focus })),
  });
  return (
    <div className="ln-maptables">
      <h3 className="lr-card__h">{lang === 'ko' ? `표시된 교역 흐름 ${flows.rows.length}개` : `${flows.rows.length} flows drawn`}</h3>
      <DataTable {...conv(flows)} />
      <h3 className="lr-card__h">{lang === 'ko' ? `경제권 ${nodes.rows.length}개` : `${nodes.rows.length} economies`}</h3>
      <DataTable {...conv(nodes)} />
    </div>
  );
}

export { ChartFrame };
