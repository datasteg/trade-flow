'use client';
// The focus economy (?focus=ISO3) at every stage of a chain, from the stage snapshots the Stage map draws
// (snap/A/<stage>/<year>.json, the numbers behind its tooltip): exports, imports, net, ranks, unit values and its three
// largest suppliers and buyers. Loaded for the shown year once an economy is focused; the loader caches the files,
// so the map's own fetch of the same snapshot is free.
import { useEffect, useState } from 'react';
import { loadMeta, loadSnapshot, type NetNode, type Snap } from '@larch/net/core';
import type { StageModel, YearSlice } from './types';

/** A partner and its share of the focus economy's imports (suppliers) or exports (buyers). */
export interface Partner { i: number; share: number }

/** The focus economy at one stage; `n` null when it neither exported nor imported the stage that year. */
export interface FocusStage {
  n: NetNode | null;
  world: number;
  sup: Partner[];
  buy: Partner[];
  /** Its rank by net imports among the net importers (1 = largest); null when it is a net exporter. */
  netImpRank: number | null;
}

export type FocusSnaps = { year: number; status: 'loading' | 'ready' | 'error'; at: Record<string, FocusStage | null> };

/** The focus economy in one snapshot. */
export function focusAt(snap: Snap, i: number): FocusStage {
  const n = snap.byIndex.get(i) ?? null;
  const has = !!n && (n.exports > 0 || n.imports > 0);
  const top = (side: 's' | 't', total: number) => snap.edges
    .filter((e) => e[side] === i && e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((e) => ({ i: side === 's' ? e.t : e.s, share: total > 0 ? e.value / total : 0 }));
  return {
    n: has ? n : null,
    world: snap.world,
    sup: has ? top('t', n!.imports) : [],
    buy: has ? top('s', n!.exports) : [],
    netImpRank: has && n!.net < 0 ? 1 + snap.nodes.filter((o) => o.net < n!.net).length : null,
  };
}

/** Every stage with data in `year`, for the focus economy `i` (null: nothing loaded). */
export function useFocusSnaps(stages: StageModel[], slice: YearSlice, year: number, i: number | null): FocusSnaps | null {
  const [state, setState] = useState<FocusSnaps | null>(null);
  useEffect(() => {
    if (i == null) { setState(null); return; }
    let live = true;
    const keys = stages.filter((s) => slice[s.key]);
    setState({ year, status: 'loading', at: {} });
    loadMeta().then((meta) => Promise.all(keys.map((s) => loadSnapshot(meta, s.product, 'A', year).then((snap) => [s.key, snap ? focusAt(snap, i) : null] as const))))
      .then((rows) => { if (live) setState({ year, status: 'ready', at: Object.fromEntries(rows) }); })
      .catch(() => { if (live) setState({ year, status: 'error', at: {} }); });
    return () => { live = false; };
  }, [stages, slice, year, i]);
  return state;
}
