'use client';
// The explorer (ExplorerShowcase): the full-bleed map, the floating rail (product, frequency, lens, layout, colour,
// size, flows, labels, find, legend), the drawer (overview, CountryCard, flow card, Checks), the TimeScrubber with
// the strip, Notices, and the table view. All state lives in the URL hash (state.ts). With mode="windows" it is the
// monthly explorer (/explore-monthly): rolling windows of 3, 6 or 12 months, estimated flows drawn dashed,
// divergence flags in the table and tooltips.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, SlidersHorizontal, PanelRightOpen } from 'lucide-react';
import { Notice } from '@larch/ui';
import {
  MapTables, NetViewHost, StripChart,
  addMonths, bigRadius, compareBase, decodeSeries, downloadCSV, findProduct, flowsTable, groupStats, isGrouping, lensName,
  estName, loadChain, loadChecks, loadData, loadDivergence, loadFlowSeries, loadGroups, loadNodeSeries, loadSeries, loadSnapshot, momentum, nearestYear,
  nodesTable, periodEnd, periodsOf, prefetchSnapshots, rHalf, resolveColouring, rNode, sizeRef, sizeValue, sourceLine, stageLeaders,
  supplementLine, tableCSV, today, wEdge, SHOWN_MIN,
  type BaseCompare, type Chain, type ChecksFile, type ChecksIndex, type ColorBy, type DivFile, type GroupColouring, type GroupsFile, type Meta,
  type NetView, type RawFlowsFile, type RawNodesFile, type RawSeries, type SizeBy, type Snap, type ViewConfig,
} from '@larch/net';
import { formatNumber, formatPercentChange, formatPeriod, formatShare, formatUSD, t, type Lang } from '@/lib/i18n';
import { setPageContext } from '@/lib/pageContext';
import { Drawer } from './Drawer';
import type { ChainName } from './ProductPicker';
import { Rail, type LegendKeys } from './Rail';
import {
  defaultCmp, defaults, effectiveBase, lagText, parseHash, periodsFor, toHash, type ExploreMode, type ExploreState, type StripMetric, STRIPS, STRIPS_W,
} from './state';

const SPEEDS = [0.5, 1, 2, 4];

function useMedia(q: string, initial: boolean): boolean {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

/** An event of events/index.json, drawn as a diamond on the strip that links to its page. */
export interface ExplorerEvent { id: string; num: string; start: string; title: { en: string; ko: string } }

export interface ExplorerProps {
  lang: Lang;
  meta: Meta;
  chains: ChainName[];
  events?: ExplorerEvent[];
  /** series/A/TOTAL.json, so the strip draws with the first render. */
  initialSeries: RawSeries | null;
  /** The server-rendered first view, shown until NetView draws. */
  staticMap: ReactNode;
  /** "windows": the monthly explorer; default the years-and-lenses explorer. */
  mode?: ExploreMode;
}

export function Explorer({ lang, meta, chains, events = [], initialSeries, staticMap, mode = 'explore' }: ExplorerProps) {
  const total = findProduct(meta, 'TOTAL')!;
  const win = mode === 'windows';
  const [st, setSt] = useState<ExploreState>(() => defaults(meta, total, win ? 'M' : 'A', 'L', undefined, mode));
  const [ready, setReady] = useState(false);
  const [missingProduct, setMissingProduct] = useState(false);
  // notices closed with their x, by kind, until the page is reloaded
  const [closed, setClosed] = useState<string[]>([]);
  const wide = useMedia('(min-width: 1024px)', true);
  const small = useMedia('(max-width: 719px)', false);
  const [railOpen, setRailOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [firstFrame, setFirstFrame] = useState(false);
  const [drawnFlows, setDrawnFlows] = useState(0);
  const [mapW, setMapW] = useState(1440);
  const viewRef = useRef<NetView | null>(null);
  const findRef = useRef<HTMLInputElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [, setRenderTick] = useState(0);

  const set = useCallback((patch: Partial<ExploreState>) => {
    setSt((s) => {
      let next = { ...s, ...patch };
      if (win && patch.w !== undefined && patch.cmp === undefined && s.cmp === defaultCmp(s.w)) next.cmp = defaultCmp(patch.w);
      if (win && (patch.p !== undefined || patch.w !== undefined)) {
        // the monthly explorer: products with windows only; a period where no window of the new length ends moves on
        const p = findProduct(meta, next.p)?.W ? findProduct(meta, next.p)! : total;
        const ps = periodsFor(meta, p, mode, 'M', 'L', next.w);
        const t1 = ps.includes(next.t) ? next.t : ps.find((x) => x > next.t) ?? ps.at(-1) ?? next.t;
        const d = defaults(meta, p, 'M', 'L', t1, mode, next.w);
        next = { ...next, p: p.id, t: d.t, base: ps.includes(next.base) ? next.base : d.base };
      }
      // a new product or frequency or lens re-validates the period and the base
      if (!win && (patch.p !== undefined || patch.f !== undefined || patch.lens !== undefined)) {
        const p = findProduct(meta, next.p) ?? total;
        const f = next.f === 'M' && p.M ? 'M' : 'A';
        const lens = f === 'M' && (p.lenses ?? ['L']).includes(next.lens) ? next.lens : 'L';
        const ps = periodsOf(p, f, lens);
        const keepT = f === s.f && ps.includes(next.t) ? next.t : (lens === 'S' && ps.includes(next.t + 1) && f === s.f ? next.t + 1 : null);
        const d = defaults(meta, p, f, lens, keepT ?? undefined);
        next = { ...next, p: p.id, f, lens, t: d.t, base: f === s.f && ps.includes(next.base) && patch.f === undefined ? next.base : d.base,
          m: p.id === 'TOTAL' && f === 'A' ? next.m : 'mirror' };
      }
      if (patch.focus !== undefined || patch.flow !== undefined) next.tab = patch.tab ?? 'main';
      return next;
    });
  }, [meta, total, win, mode]);

  // the hash: read on load and on back/forward, written on every change
  useEffect(() => {
    const read = () => {
      // The query seeds what the hash leaves open: ?p= the product (the server-rendered summary's product links),
      // ?flow=A-B the flow card (the family's pair links), ?focus=ISO3 the economy (the chain pages' focus).
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const q = new URLSearchParams(window.location.search);
      const known = (iso: string) => meta.nodes.some((n) => n.id === iso);
      if (!h.has('p') && q.get('p')) h.set('p', q.get('p')!);
      if (!h.has('focus') && !h.has('flow')) {
        const flow = (q.get('flow') ?? '').toUpperCase().match(/^([A-Z0-9_]{3})-([A-Z0-9_]{3})$/);
        const focus = (q.get('focus') ?? '').toUpperCase();
        if (flow && known(flow[1]) && known(flow[2])) h.set('flow', `${flow[1]}>${flow[2]}`);
        else if (focus && known(focus)) h.set('focus', focus);
      }
      const r = parseHash(meta, h.toString(), mode);
      setSt(r.state);
      setMissingProduct(r.missingProduct);
      if (r.state.focus || r.state.flow) setDrawerOpen(true);
    };
    read();
    setReady(true);
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [meta, mode]);
  useEffect(() => {
    if (!ready) return;
    const h = toHash(meta, st, mode);
    const now = window.location.hash.replace(/^#/, '');
    if (h !== now) history.replaceState(null, '', h ? `#${h}` : window.location.pathname + window.location.search);
  }, [st, ready, meta, mode]);
  // the selected economy or flow, for the family strip's context links (components/Family.tsx)
  useEffect(() => {
    const nm = (iso: string) => meta.nodes.find((n) => n.id === iso)?.[lang] ?? iso;
    if (st.flow) {
      const [a, b] = st.flow.split('>');
      setPageContext({ flow: { a, b, aName: nm(a), bName: nm(b) } });
    } else if (st.focus) setPageContext({ focus: { iso: st.focus, name: nm(st.focus) } });
    else setPageContext({});
  }, [st.focus, st.flow, meta, lang]);
  useEffect(() => () => setPageContext({}), []);

  const product = findProduct(meta, st.p) ?? total;
  const lens = st.f === 'M' && !win ? st.lens : null;
  const periods = useMemo(() => periodsFor(meta, product, mode, st.f, st.lens, st.w), [meta, product, mode, st.f, st.lens, st.w]);
  const baseT = effectiveBase(st, mode);
  // the monthly explorer's window in words, its effective lag ((w − 1) / 2 months) and the source line
  const winLabel = win ? t(lang, 'explore.w.window', { w: st.w }) : null;
  const winSource = win ? t(lang, 'explore.w.source', { w: st.w, lag: lagText(lang, st.w) }) : null;

  // -- data ------------------------------------------------------------------------------------------------------
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baseSnap, setBaseSnap] = useState<Snap | null>(null);
  const [seriesRaw, setSeriesRaw] = useState<RawSeries | null>(initialSeries);
  const [chain, setChain] = useState<Chain | null>(null);
  const [nodeFile, setNodeFile] = useState<RawNodesFile | null>(null);
  const [flowFile, setFlowFile] = useState<RawFlowsFile | null>(null);
  const [checks, setChecks] = useState<ChecksFile | null | undefined>(undefined);
  const [checksIndex, setChecksIndex] = useState<ChecksIndex | null>(null);
  const [groupsFile, setGroupsFile] = useState<GroupsFile | null>(null);
  const [divFile, setDivFile] = useState<DivFile | null>(null);
  const opts = useMemo(() => (win ? { win: st.w } : { lens: lens ?? undefined, rule: st.m }), [win, st.w, lens, st.m]);
  const dir = win || st.f === 'M' ? 'W' : 'A';   // months are always the windows (the monthly lenses are retired, K4)

  useEffect(() => {
    if (!ready) return;
    let live = true;
    setLoading(true);
    loadSnapshot(meta, product.id, st.f, st.t, opts).then((x) => {
      if (!live) return;
      setLoading(false);
      if (x) { setSnap(x); setError(null); } else setError(t(lang, 'explore.noSnap', { t: formatPeriod(st.t, lang) }));
    }).catch(() => { if (live) { setLoading(false); setError(t(lang, 'explore.loadFailed')); } });
    // prefetch the next two periods so a tick never waits
    const i = periods.indexOf(st.t);
    if (i >= 0) prefetchSnapshots(meta, product.id, st.f, periods.slice(i + 1, i + 3), opts);
    return () => { live = false; };
  }, [ready, meta, product.id, st.f, st.t, opts, periods, lang]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    loadSnapshot(meta, product.id, st.f, baseT, opts).then((x) => { if (live) setBaseSnap(x); }).catch(() => { if (live) setBaseSnap(null); });
    return () => { live = false; };
  }, [ready, meta, product.id, st.f, baseT, opts]);

  useEffect(() => {
    if (!ready) return;
    if (product.id === 'TOTAL' && st.f === 'A' && st.m === 'mirror' && initialSeries && !win) { setSeriesRaw(initialSeries); return; }
    let live = true;
    loadSeries(meta, product.id, dir).then((x) => { if (live) setSeriesRaw(x); }).catch(() => undefined);
    return () => { live = false; };
  }, [ready, meta, product.id, st.f, st.m, initialSeries, win, dir]);

  useEffect(() => {
    if (!ready || !win || !(product.id === 'TOTAL' || product.kind === 'stage')) { setDivFile(null); return; }
    let live = true;
    loadDivergence(meta, product.id).then((x) => { if (live) setDivFile(x); }).catch(() => undefined);
    return () => { live = false; };
  }, [ready, win, meta, product.id, product.kind]);

  useEffect(() => {
    if (!product.chain) { setChain(null); return; }
    let live = true;
    loadChain(product.chain).then((c) => { if (live) setChain(c); }).catch(() => undefined);
    return () => { live = false; };
  }, [product.chain]);

  useEffect(() => {
    if (!ready || (!st.focus && !st.flow)) return;   // the flow card reads both ends' completeness
    let live = true;
    loadNodeSeries(meta, product.id, dir).then((x) => { if (live) setNodeFile(x); }).catch(() => undefined);
    return () => { live = false; };
  }, [ready, meta, product.id, dir, st.focus, st.flow]);

  useEffect(() => {
    if (!ready || (!st.flow && !st.focus)) return;
    let live = true;
    loadFlowSeries(meta, product.id, dir).then((x) => { if (live) setFlowFile(x); }).catch(() => undefined);
    return () => { live = false; };
  }, [ready, meta, product.id, dir, st.flow, st.focus]);

  useEffect(() => { setNodeFile(null); setFlowFile(null); setChecks(undefined); }, [product.id, st.f]);
  // the monthly explorer's node and flow files hold one block per window length; the drawer reads the 12-month
  // lens's slot (L), so the block of the window on screen goes there
  const drawerNodes = useMemo(() => (nodeFile && nodeFile.p === product.id
    ? (win ? { p: nodeFile.p, f: 'M' as const, L: nodeFile[String(st.w)] as RawNodesFile['L'] } : nodeFile) : null), [nodeFile, product.id, win, st.w]);
  const drawerFlows = useMemo(() => (flowFile && flowFile.p === product.id
    ? (win ? { p: flowFile.p, f: 'M' as const, L: flowFile[String(st.w)] as RawFlowsFile['L'] } : flowFile) : null), [flowFile, product.id, win, st.w]);

  // what is drawn: the estimated flows hidden when est=0; the divergence numbers attached to flagged flows
  const shown = useMemo<Snap | null>(() => {
    if (!snap || !win) return snap;
    const flags = divFile?.t[String(snap.t)] ?? null;
    const k = divFile?.rule.k ?? 3;
    const floor = divFile?.rule.floor ?? 0;
    const edges = snap.edges.filter((e) => st.est || !e.est).map((e) => {
      if (!e.dv) return e;
      const f = flags?.[`${e.s}>${e.t}`];
      return f ? { ...e, div: { r: f[0], med: f[1], mad: f[2], k, floor, events: f[4] ?? [] } } : e;
    });
    return { ...snap, edges };
  }, [snap, win, st.est, divFile, st.w]);

  useEffect(() => {
    if (!ready || st.tab !== 'checks') return;
    let live = true;
    loadChecks(meta, product.id).then((x) => { if (live) setChecks(x); }).catch(() => { if (live) setChecks(null); });
    if (!checksIndex) loadData<ChecksIndex>('checks/index.json').then((x) => { if (live) setChecksIndex(x); }).catch(() => undefined);
    return () => { live = false; };
  }, [ready, meta, product.id, st.tab, checksIndex]);

  // the series ends with the picker (meta.shown): later periods hold too little of world trade to draw
  const shownEnd = meta.shown?.[win ? 'W' : st.f];
  const seriesRows = useMemo(() => (seriesRaw && seriesRaw.p === product.id
    ? decodeSeries(seriesRaw, win ? String(st.w) : st.f === 'A' ? st.m : st.lens).filter((r) => shownEnd == null || r.t <= shownEnd) : []),
  [seriesRaw, product.id, st.f, st.m, st.lens, win, st.w, shownEnd]);
  const ref = useMemo(() => Math.max(0, ...seriesRows.map((r) => r.world)) || null, [seriesRows]);

  // -- what is drawn ---------------------------------------------------------------------------------------------
  const full = snap?.full ?? (win ? st.w === 12 : st.f === 'A' || st.lens === 'L');
  let colorBy: ColorBy = st.c;
  if (colorBy === 'community' && !full) colorBy = 'change';
  if (colorBy === 'stage' && product.kind !== 'stage') colorBy = 'region';
  let sizeBy: SizeBy = st.s;
  if (!full && (sizeBy === 'pagerank' || sizeBy === 'betweenness')) sizeBy = 'total';
  const base: BaseCompare | null = useMemo(() => (baseSnap ? compareBase(baseSnap) : null), [baseSnap]);
  const stageOf = useMemo(() => (chain && colorBy === 'stage' ? stageLeaders(meta, chain, nearestYear(chain, st.f === 'A' ? st.t : Math.floor(st.t / 100))) : null), [chain, colorBy, meta, st.t, st.f]);
  useEffect(() => {
    if (!isGrouping(colorBy) || groupsFile) return;
    let live = true;
    loadGroups().then((g) => { if (live) setGroupsFile(g); }).catch(() => undefined);
    return () => { live = false; };
  }, [colorBy, groupsFile]);
  // membership on the last day of the period shown (or today), so a bloc's colour follows its enlargements and exits
  const groups: GroupColouring | null = useMemo(() => (groupsFile && isGrouping(colorBy)
    ? resolveColouring(groupsFile, colorBy, { blocs: st.blocs, club: st.club, custom: st.custom, date: st.mt ? today() : periodEnd(st.t, st.f) })
    : null), [groupsFile, colorBy, st.blocs, st.club, st.custom, st.mt, st.t, st.f]);
  const config = useMemo<Partial<ViewConfig>>(() => ({
    layout: st.l, sizeBy, scale: st.sc, ref, colorBy, k: st.k, min: st.min, labels: small && st.lab > 10 ? 10 : st.lab,
    focus: st.focus, flow: st.flow, groups, outline: [], base: colorBy === 'change' ? base : null, stageOf,
    stageCount: chain?.levels.length ?? null,
  }), [st.l, sizeBy, st.sc, ref, colorBy, st.k, st.min, st.lab, small, st.focus, st.flow, groups, base, stageOf, chain]);

  // -- playback --------------------------------------------------------------------------------------------------
  const step = useCallback((d: number) => {
    setSt((s) => {
      const i = periods.indexOf(s.t);
      const j = Math.max(0, Math.min(periods.length - 1, i + d));
      return j === i ? s : { ...s, t: periods[j] };
    });
  }, [periods]);
  const jump = useCallback((to: 'first' | 'last') => setSt((s) => ({ ...s, t: to === 'first' ? periods[0] : periods[periods.length - 1] })), [periods]);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && periods.indexOf(st.t) >= periods.length - 1) setSt((s) => ({ ...s, t: periods[0] }));
      return !p;
    });
  }, [periods, st.t]);
  useEffect(() => {
    if (!playing) return;
    const i = periods.indexOf(st.t);
    if (i < 0 || i >= periods.length - 1) { setPlaying(false); return; }
    const ms = (st.f === 'A' ? 1100 : 550) / speed;
    let live = true;
    const started = Date.now();
    const next = periods[i + 1];
    // wait for the next snapshot (prefetched) so the film never shows an empty frame
    loadSnapshot(meta, product.id, st.f, next, opts).catch(() => null).then(() => {
      if (!live) return;
      const wait = Math.max(0, ms - (Date.now() - started));
      timer = window.setTimeout(() => { if (live) setSt((s) => ({ ...s, t: next })); }, wait);
    });
    let timer = 0;
    return () => { live = false; window.clearTimeout(timer); };
  }, [playing, st.t, speed, periods, st.f, meta, product.id, opts]);
  useEffect(() => { setPlaying(false); }, [product.id, st.f, st.lens, st.w]);

  // -- keyboard ----------------------------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === 'Escape') {
        if (railOpen && !wide) { setRailOpen(false); return; }
        if (st.focus || st.flow) { set({ focus: null, flow: null }); return; }
        if (drawerOpen) setDrawerOpen(false);
        return;
      }
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '/') { e.preventDefault(); if (!wide) setRailOpen(true); setTimeout(() => findRef.current?.focus(), 0); return; }
      const onButton = !!el && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab');
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); step(-1); }
      else if (e.key === 'Home' && !onButton) { e.preventDefault(); jump('first'); }
      else if (e.key === 'End' && !onButton) { e.preventDefault(); jump('last'); }
      else if (e.key === ' ' && !onButton) { e.preventDefault(); toggle(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [railOpen, wide, st.focus, st.flow, drawerOpen, set, step, jump, toggle]);

  // -- layout --------------------------------------------------------------------------------------------------------
  useEffect(() => { if (st.focus || st.flow) setDrawerOpen(true); }, [st.focus, st.flow]);
  useEffect(() => { if (st.tab === 'checks') setDrawerOpen(true); }, [st.tab]);
  const insets = useMemo(() => (wide ? { left: 344, right: 16, top: 16, bottom: 120 } : { left: 8, right: 8, top: 52, bottom: small ? 92 : 112 }), [wide, small]);
  useEffect(() => {
    // keep the selection in the visible area between the rail and the drawer
    const v = viewRef.current;
    const iso = st.focus ?? st.flow?.split('>')[0] ?? null;
    if (!v || !wide || !shell.current || !iso) return;
    const W = shell.current.clientWidth, H = shell.current.clientHeight;
    v.ensureVisible(iso, { x0: 344, y0: 16, x1: W - (drawerOpen ? 416 : 16), y1: H - 120 });
  }, [st.focus, st.flow, drawerOpen, wide, snap]);
  useEffect(() => {
    if (!shell.current) return;
    const ro = new ResizeObserver(() => setMapW(shell.current?.clientWidth ?? 1440));
    ro.observe(shell.current);
    return () => ro.disconnect();
  }, []);

  const onRender = useCallback((v: NetView) => {
    setFirstFrame(true);
    setDrawnFlows(v.drawn().edges.length);
    setRenderTick((x) => x + 1);
  }, []);

  // -- legend keys ---------------------------------------------------------------------------------------------------
  const keys: LegendKeys = useMemo(() => {
    if (!snap) return { sizes: [], widths: [], communities: [], chokepoints: [], groups: {} };
    const big = bigRadius(mapW);
    const split = sizeBy === 'split';
    // split nodes: the reference half-discs stand for the largest single side (exports or imports)
    const vals = snap.nodes.map((n) => (split ? Math.max(n.exports, n.imports) : sizeValue(n, sizeBy)));
    const maxV = Math.max(0, ...vals);
    const refV = sizeRef(sizeBy, st.sc, ref, Math.max(0, ...snap.nodes.map((n) => sizeValue(n, sizeBy))));
    const nice = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); const m = x / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
    const value = sizeBy === 'total' || split || sizeBy === 'exports' || sizeBy === 'imports';
    const fmt = (x: number) => (value ? formatUSD(x, lang, { decimals: 0 }) : sizeBy === 'degree' ? formatNumber(x, lang) : x.toPrecision(2));
    const sizes = maxV > 0 ? [nice(maxV), nice(maxV / 5), nice(maxV / 25)].filter((x, i, a) => a.indexOf(x) === i)
      .map((x) => ({ value: x, r: split ? rHalf(x, refV, big) : rNode(x, refV, big), text: fmt(x) })) : [];
    const eRef = st.sc === 'fixed' && ref ? ref : snap.world;
    const maxE = Math.max(0, ...snap.edges.map((e) => e.value));
    const widths = maxE > 0 ? [nice(maxE), nice(maxE / 10), nice(maxE / 100)].filter((x, i, a) => a.indexOf(x) === i).map((x) => ({ value: x, w: wEdge(x, eRef) })) : [];
    const communities = colorBy === 'community' ? snap.comm.slice(0, 3).flatMap((c) => {
      const slot = viewRef.current?.slotMap.get(c.anchor);
      return slot == null ? [] : [{ name: meta.nodes[c.anchor]?.[lang] ?? '', size: c.size, share: c.share, slot }];
    }).sort((a, b) => a.slot - b.slot) : [];
    const chokepoints = snap.nodes.filter((n) => n.x > 0.5).map((n) => n.id);
    return { sizes, widths, communities, chokepoints, groups: groups ? groupStats(snap, groups, meta) : {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, sizeBy, st.sc, ref, mapW, colorBy, lang, meta, drawnFlows, groups]);

  // -- strip ---------------------------------------------------------------------------------------------------------
  const strip: StripMetric = st.strip;
  const stripVals = useMemo(() => {
    const rows = seriesRows;
    switch (strip) {
      case 'momentum': return st.f === 'M' ? momentum(rows) : rows.map((r, i) => (i > 0 && rows[i - 1].world ? r.world / rows[i - 1].world - 1 : null));
      case 'top1': return rows.map((r) => r.top1);
      case 'hhi': return rows.map((r) => r.hhi);
      case 'edges': return rows.map((r) => r.edges);
      case 'reporters': return rows.map((r) => r.reporters);
      case 'est': return rows.map((r) => r.est ?? null);
      default: return rows.map((r) => r.world);
    }
  }, [seriesRows, strip, st.f]);
  // events on the strip: the year (or month) each one began
  const stripEvents = useMemo(() => events.map((e) => {
    const [y, m] = e.start.split('-').map(Number);
    return { t: st.f === 'A' ? y : y * 100 + m, label: `${e.num} · ${e.title[lang]}`, href: `/${lang}/events/${e.id}` };
  }), [events, st.f, lang]);
  const stripFmt = (v: number) => (strip === 'world' ? formatUSD(v, lang) : strip === 'momentum' ? formatPercentChange(v, lang, { decimals: 0 })
    : strip === 'top1' || strip === 'est' ? formatShare(v, lang) : strip === 'hhi' ? formatNumber(v, lang, { decimals: 3 }) : formatNumber(v, lang));

  // -- notices ---------------------------------------------------------------------------------------------------------
  const notices: { key: string; tone: 'info' | 'warning'; title: string; body?: string }[] = [];
  if (missingProduct) notices.push({ key: 'missing', tone: 'warning', title: t(lang, 'explore.productMissing') });
  if (st.t > meta.complete[st.f]) {
    const cov = meta.coverage[st.f]?.[String(st.t)];
    notices.push({ key: 'partial', tone: 'warning', title: t(lang, 'explore.partialTitle'),
      body: cov != null ? t(lang, 'explore.partialBody', { t: formatPeriod(st.t, lang), cov: formatShare(cov, lang) }) : t(lang, 'explore.partialBodyNoCov', { t: formatPeriod(st.t, lang) }) });
  }
  if (win && st.w < 12) notices.push({ key: 'seasonal', tone: 'warning', title: t(lang, 'explore.w.seasonalTitle', { w: st.w }), body: t(lang, 'explore.w.seasonalBody') });
  const estShare = snap?.tot.est ?? null;
  if (win && estShare) {
    const by = snap?.tot.est_by ?? [];
    const parts = [1, 2, 3, 4].filter((c) => (by[c - 1] ?? 0) > 0).map((c) => `${estName(lang, c)} ${formatShare(by[c - 1] ?? 0, lang, { decimals: 1 })}`).join(', ');
    notices.push({ key: 'est', tone: 'info', title: t(lang, 'explore.w.estShare', { v: formatShare(estShare, lang, { decimals: 1 }) }),
      body: `${parts}. ${t(lang, st.est ? 'explore.w.estShown' : 'explore.w.estHidden')}` });
  }
  const begins = st.f === 'A' ? product.A[0] : product.M?.[0] ?? 0;
  if (product.id !== 'TOTAL' && st.f === 'A' && begins > 1995) notices.push({ key: 'begins', tone: 'info', title: t(lang, 'explore.codeBeginsTitle', { y: begins }), body: t(lang, 'explore.codeBeginsBody') });
  const stage = chain && product.stage_key ? chain.stages.find((x) => x.key === product.stage_key) : null;
  if (stage?.caveat) notices.push({ key: 'caveat', tone: stage.residual ? 'warning' : 'info', title: t(lang, stage.residual ? 'explore.residualTitle' : 'explore.caveatTitle'), body: stage.caveat[lang] });
  const open = notices.filter((n) => !closed.includes(n.key));

  // -- table view ------------------------------------------------------------------------------------------------------
  const drawn = viewRef.current?.drawn();
  const tables = st.tbl && shown && drawn ? {
    flows: flowsTable(meta, lang, shown, drawn.edges, colorBy === 'change' ? base : null),
    nodes: nodesTable(meta, lang, shown, drawn.nodes, st.focus),
  } : null;

  const productLabel = lang === 'ko' ? product.ko : product.en;
  // a supplement (Korea's customs months) is named when the months drawn reach it
  const reach = win ? st.w : lens ? (meta.lenses[lens] ?? 1) : 1;
  const supCite = st.f === 'M' ? supplementLine(lang, meta, addMonths(st.t, 1 - reach), st.t) : '';
  const supNote = supCite ? ` ${supCite}` : '';
  const src = (win
    ? `${winSource} ${formatPeriod(st.t, lang)}.${estShare ? ` ${t(lang, 'explore.w.estShare', { v: formatShare(estShare, lang, { decimals: 1 }) })}.` : ''}`
    : `${sourceLine(lang, { freq: st.f, rule: st.m, lens, total: product.id === 'TOTAL' })} ${formatPeriod(st.t, lang)}.`) + supNote;
  const showDrawer = drawerOpen;

  const speedControl = (
    <div className="lr-field gx-speed">
      <span className="lr-label">{t(lang, 'explore.speed')}</span>
      <div className="lr-seg" role="group" aria-label={t(lang, 'explore.speed')}>
        {SPEEDS.map((x) => <button key={x} type="button" aria-pressed={speed === x} onClick={() => setSpeed(x)}>{formatNumber(x, lang, { decimals: 1 })}×</button>)}
      </div>
    </div>
  );
  // in the scrubber: one button that cycles 0.5× → 1× → 2× → 4×
  const speedButton = (
    <button type="button" className="gx-speedbtn" aria-label={`${t(lang, 'explore.speed')} ${formatNumber(speed, lang, { decimals: 1 })}×`}
      title={t(lang, 'explore.speed')} onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
      {formatNumber(speed, lang, { decimals: 1 })}×
    </button>
  );

  return (
    <div ref={shell} className={`gx${wide ? ' is-wide' : ''}${showDrawer ? ' has-drawer' : ''}${railOpen ? ' has-sheet' : ''}`} lang={lang}>
      <a className="skip-link gx-skip" href="#gx-map">{t(lang, 'explore.skipMap')}</a>
      <section id="gx-map" className="gx-map" aria-label={t(lang, 'explore.mapRegion')} tabIndex={-1}>
        <NetViewHost lang={lang} meta={meta} snap={shown} config={config} loading={loading && !!snap} message={!snap && !error ? t(lang, 'explore.loadingNetwork') : error && !snap ? error : null}
          insets={insets} productLabel={productLabel} viewRef={viewRef} onRender={onRender}
          onSelectNode={(id) => set({ focus: id && id === st.focus ? null : id, flow: null })}
          onSelectFlow={(k) => set({ flow: k, focus: null })} />
        {!firstFrame ? <div className="gx-static" aria-hidden={ready}>{staticMap}</div> : null}
      </section>

      <div className="gx-fabs">
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" aria-expanded={railOpen} aria-controls="gx-rail" onClick={() => setRailOpen(!railOpen)}>
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />{t(lang, 'explore.filters')}
        </button>
        <span className="gx-fabs__product">{productLabel} · {formatPeriod(st.t, lang)}</span>
        {!showDrawer ? (
          <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={() => setDrawerOpen(true)}>
            <PanelRightOpen size={16} strokeWidth={1.5} aria-hidden />{t(lang, 'explore.overview')}
          </button>
        ) : null}
      </div>
      {!showDrawer ? (
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm gx-open-drawer" onClick={() => setDrawerOpen(true)}>
          <PanelRightOpen size={16} strokeWidth={1.5} aria-hidden />{t(lang, 'explore.overview')}
        </button>
      ) : null}

      <aside id="gx-rail" className={`lr-panel gx-rail${railOpen ? ' is-open' : ''}`} aria-label={t(lang, 'explore.filtersLabel')}>
        <div className="gx-sheet__bar">
          <span className="lr-card__h">{t(lang, 'explore.filters')}</span>
          <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={() => setRailOpen(false)}>{t(lang, 'explore.close')}</button>
        </div>
        <Rail lang={lang} meta={meta} chains={chains} st={st} set={set} product={product} snap={snap} periods={periods} mode={mode}
          colorBy={colorBy} sizeBy={sizeBy} keys={keys} groups={groups} groupsFile={groupsFile} onFit={() => viewRef.current?.fit()}
          onFind={(iso) => { set({ focus: iso, flow: null }); if (!wide) setRailOpen(false); }} findRef={findRef}
          speed={small ? speedControl : undefined} />
      </aside>

      {open.length && !st.tbl ? (
        <div className="gx-notices" role="region" aria-label={lang === 'ko' ? '알림' : 'Notices'}>
          {open.slice(0, 3).map((n) => (
            <Notice key={n.key} tone={n.tone} title={n.title} closeLabel={t(lang, 'explore.closeNotice')}
              onClose={() => setClosed((c) => [...c, n.key])}>{n.body}</Notice>
          ))}
        </div>
      ) : null}

      {st.tbl ? (
        <section className="lr-panel gx-table" aria-label={t(lang, 'explore.showTable')}>
          <div className="gx-table__head">
            <div>
              <p className="lr-kicker">{productLabel} · {formatPeriod(st.t, lang)}{winLabel ? ` · ${winLabel}` : lens ? ` · ${lensName(lang, lens)}` : ''}</p>
              <h2 className="lr-card__name">{t(lang, 'explore.tableTitle', { product: productLabel, t: formatPeriod(st.t, lang) })}</h2>
              <p className="gx-note">{t(lang, 'explore.tableIntro')}</p>
            </div>
            <div className="gx-row gx-row--buttons">
              {tables ? <>
                <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={() => downloadCSV(`${product.slug}-${st.t}-flows`, tableCSV(tables.flows, src))}>{t(lang, 'explore.csvFlows')}</button>
                <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={() => downloadCSV(`${product.slug}-${st.t}-economies`, tableCSV(tables.nodes, src))}>{t(lang, 'explore.csvNodes')}</button>
              </> : null}
              <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={() => set({ tbl: false })}>{t(lang, 'explore.showMap')}</button>
            </div>
          </div>
          {tables ? <MapTables lang={lang} flows={tables.flows} nodes={tables.nodes} /> : <p className="gx-note">{t(lang, 'explore.loadingNetwork')}</p>}
          <p className="lr-caption">{src}</p>
        </section>
      ) : null}

      {showDrawer ? (
        <aside className="lr-panel gx-drawer" aria-label={st.focus ?? st.flow ?? t(lang, 'explore.overview')}>
          <Drawer lang={lang} meta={meta} st={win ? { ...st, base: baseT } : st} set={set} product={product} snap={shown} baseSnap={baseSnap} base={base}
            series={seriesRows} nodeFile={drawerNodes} flowFile={drawerFlows} windowLabel={winLabel} windowSource={winSource}
            chain={chain} checks={checks} checksIndex={checksIndex} drawnFlows={drawnFlows} slots={viewRef.current?.slotMap ?? new Map()} periods={periods}
            onClose={() => { if (st.focus || st.flow) set({ focus: null, flow: null }); setDrawerOpen(false); }} />
        </aside>
      ) : null}

      <div className="lr-scrubber gx-scrubber" role="group" aria-label={t(lang, 'explore.scrubberLabel')}>
        <div className="lr-scrubber__controls">
          {!small ? <button type="button" className="lr-iconbtn" aria-label={t(lang, 'explore.stepBack')} onClick={() => { setPlaying(false); step(-1); }}><ChevronLeft size={20} strokeWidth={1.5} aria-hidden /></button> : null}
          <button type="button" className="lr-play" aria-label={t(lang, playing ? 'explore.pause' : 'explore.play')} aria-pressed={playing} onClick={toggle}>
            {playing ? <Pause size={20} strokeWidth={1.5} fill="currentColor" aria-hidden /> : <Play size={20} strokeWidth={1.5} fill="currentColor" aria-hidden />}
          </button>
          {!small ? <button type="button" className="lr-iconbtn" aria-label={t(lang, 'explore.stepForward')} onClick={() => { setPlaying(false); step(1); }}><ChevronRight size={20} strokeWidth={1.5} aria-hidden /></button> : null}
        </div>
        <div className="lr-scrubber__period" aria-live="polite">
          {formatPeriod(st.t, lang)}
          <small>{win ? `${winLabel} · ${t(lang, 'explore.w.lag', { lag: lagText(lang, st.w) })}`
            : st.c === 'change' || colorBy === 'change' ? t(lang, 'explore.baseShort', { base: formatPeriod(st.base, lang) }) : t(lang, 'explore.baseShort', { base: formatPeriod(st.base, lang) })}</small>
        </div>
        <div className="lr-strip gx-strip">
          <div className="gx-strip__head">
            <select className="gx-select gx-select--bare" aria-label={t(lang, 'explore.strip')} value={strip}
              onChange={(e) => set({ strip: e.target.value as StripMetric })}>
              {(win ? STRIPS_W : STRIPS).map((x) => <option key={x} value={x}>{t(lang, `explore.strip.${x}`)}</option>)}
            </select>
            {winLabel ? <span className="gx-muted">{winLabel}</span> : lens ? <span className="gx-muted">{lensName(lang, lens)}</span> : null}
          </div>
          <StripChart lang={lang} mark="bar" noTable label={`${t(lang, `explore.strip.${strip}`)}, ${productLabel}`}
            periods={seriesRows.map((r) => r.t)} series={[{ key: strip, label: t(lang, `explore.strip.${strip}`), values: stripVals }]}
            format={stripFmt} current={st.t} base={baseT} complete={meta.complete[st.f]} coverage={meta.coverage[st.f]}
            completeness={seriesRows.map((r) => r.cmp ?? null)} minComplete={SHOWN_MIN}
            events={stripEvents} zero height={52}
            onPick={(x) => { setPlaying(false); set({ t: x }); }} onBase={(x) => set(win ? { base: x, cmp: 'base' } : { base: x })} />
        </div>
        {!small ? speedButton : null}
      </div>
    </div>
  );
}
