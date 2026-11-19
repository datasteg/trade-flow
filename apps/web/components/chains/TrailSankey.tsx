'use client';
// The Trail: a Sankey across the stage gates. One column of economies per gate (the makers of each
// rung of the chain's ladder, then the buyers), one product per rung between two columns, ribbons for its largest
// flows with width = share of that stage's world trade. Widths compare within a stage, never across stages, so no
// value step is ever drawn. Feedstocks run in a lane above: grey at full width, the chain's use share solid on top,
// and a dashed line where they join the trail.
import { useMemo, useState } from 'react';
import { DataTable, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import { ChartFrame } from './ChartFrame';
import { fmtShare, mainLine, pct, rungs, stageTag, stageVar } from './model';
import type { ChainModel, StageModel, StageYear, YearSlice } from './types';

const W = 1000;
/** The first and the last column; the others divide the span by the ladder's length. */
const X0 = 60, X1 = 910;
const NODE_W = 10;
const K_MAIN = 130; // px per 100% of a stage's world trade
const GAP = 8;
const MIN_ROW = 15; // a node takes at least one label line
const MIN_FLOW = 0.02;
const MAX_FLOWS = 5;

type Flow = [number, number, number];

/** x of column c (0 … n) for a ladder of n rungs. */
function colX(c: number, n: number): number {
  return Math.round(X0 + (c * (X1 - X0)) / n);
}

function pickFlows(y: StageYear | null): Flow[] {
  if (!y) return [];
  const f = [...y.flows].sort((a, b) => b[2] - a[2]);
  const big = f.filter((x) => x[2] >= MIN_FLOW).slice(0, MAX_FLOWS);
  return big.length >= 3 ? big : f.slice(0, Math.min(3, f.length));
}

interface LNode { id: number; col: number; y: number; h: number; inOff: number; outOff: number }
interface LFlow { band: number; s: number; t: number; share: number; w: number; y0: number; y1: number; key: string; lane?: number; use?: number | null }

interface Layout { nodes: LNode[]; flows: LFlow[]; height: number; laneTop: number; mainTop: number; lanes: { key: string; band: number; y: number; h: number }[] }

function layout(bands: (Flow[] | null)[], feedLanes: { key: string; stage: number; flows: Flow[]; use: number | null }[], n: number): Layout {
  const HEAD = 52;
  let cursor = HEAD;
  const nodes: LNode[] = [];
  const flows: LFlow[] = [];
  const lanes: Layout['lanes'] = [];

  // Feedstock lanes: their own small columns at the band's two gates, stacked above the main area.
  const laneTop = cursor;
  feedLanes.forEach((fl, li) => {
    const band = fl.stage - 1;
    const top = cursor + 14; // room for the lane label
    const placeCol = (col: number, ids: Map<number, number>) => {
      let yy = top;
      const out = new Map<number, LNode>();
      [...ids.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, v]) => {
        const h = Math.max(1.5, v * K_MAIN);
        const nd: LNode = { id, col, y: yy, h, inOff: 0, outOff: 0 };
        nodes.push(nd);
        out.set(id, nd);
        yy += Math.max(h, MIN_ROW) + GAP;
      });
      return { out, bottom: yy };
    };
    const ex = new Map<number, number>(), im = new Map<number, number>();
    for (const [s, tt, w] of fl.flows) { ex.set(s, (ex.get(s) ?? 0) + w); im.set(tt, (im.get(tt) ?? 0) + w); }
    const a = placeCol(band, ex), b = placeCol(band + 1, im);
    for (const [s, tt, w] of fl.flows) {
      const ns = a.out.get(s)!, nt = b.out.get(tt)!;
      const pw = Math.max(1, w * K_MAIN);
      flows.push({ band, s, t: tt, share: w, w: pw, y0: ns.y + ns.outOff + pw / 2, y1: nt.y + nt.inOff + pw / 2, key: fl.key, lane: li, use: fl.use });
      ns.outOff += pw; nt.inOff += pw;
    }
    const bottom = Math.max(a.bottom, b.bottom);
    lanes.push({ key: fl.key, band, y: cursor, h: bottom - cursor });
    cursor = bottom + 10;
  });
  const mainTop = feedLanes.length ? cursor + 14 : cursor;

  // Main columns: an economy's height is the larger of what it receives (rung k) and sends on (rung k + 1).
  const cols: Map<number, { inV: number; outV: number }>[] = Array.from({ length: n + 1 }, () => new Map());
  bands.forEach((fs, b) => {
    for (const [s, tt, w] of fs ?? []) {
      const e = cols[b].get(s) ?? { inV: 0, outV: 0 }; e.outV += w; cols[b].set(s, e);
      const i = cols[b + 1].get(tt) ?? { inV: 0, outV: 0 }; i.inV += w; cols[b + 1].set(tt, i);
    }
  });
  const at: Map<number, LNode>[] = Array.from({ length: n + 1 }, () => new Map());
  let bottom = mainTop;
  cols.forEach((m, c) => {
    let yy = mainTop;
    [...m.entries()].sort((a, b) => Math.max(b[1].inV, b[1].outV) - Math.max(a[1].inV, a[1].outV)).forEach(([id, v]) => {
      const h = Math.max(1.5, Math.max(v.inV, v.outV) * K_MAIN);
      const nd: LNode = { id, col: c, y: yy, h, inOff: 0, outOff: 0 };
      nodes.push(nd);
      at[c].set(id, nd);
      yy += Math.max(h, MIN_ROW) + GAP;
    });
    bottom = Math.max(bottom, yy);
  });
  bands.forEach((fs, b) => {
    // Outgoing ribbons in the order of their targets, incoming in the order of their sources: fewer crossings.
    const list = [...(fs ?? [])];
    list.sort((p, q) => at[b + 1].get(p[1])!.y - at[b + 1].get(q[1])!.y);
    const placed = list.map(([s, tt, w]) => {
      const ns = at[b].get(s)!;
      const pw = Math.max(1, w * K_MAIN);
      const y0 = ns.y + ns.outOff + pw / 2;
      ns.outOff += pw;
      return { s, tt, w, pw, y0 };
    });
    placed.sort((p, q) => at[b].get(p.s)!.y - at[b].get(q.s)!.y || p.y0 - q.y0);
    for (const p of placed) {
      const nt = at[b + 1].get(p.tt)!;
      const y1 = nt.y + nt.inOff + p.pw / 2;
      nt.inOff += p.pw;
      flows.push({ band: b, s: p.s, t: p.tt, share: p.w, w: p.pw, y0: p.y0, y1, key: '' });
    }
  });
  return { nodes, flows, height: bottom + 8, laneTop, mainTop, lanes };
}

function ribbon(b: number, y0: number, y1: number, n: number): string {
  const x0 = colX(b, n) + NODE_W, x1 = colX(b + 1, n), mx = (x0 + x1) / 2;
  return `M${x0},${y0.toFixed(1)}C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1},${y1.toFixed(1)}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export function TrailSankey({ lang, chainName, chainId, levels, stages, slice, year, choke, nodes }: {
  lang: Lang;
  chainName: string;
  chainId: string;
  levels: ChainModel['levels'];
  stages: StageModel[];
  slice: YearSlice;
  year: number;
  choke: string | null;
  nodes: [string, string][];
}) {
  const n = levels.length;
  const R = rungs(n);
  const defaults = useMemo(() => mainLine(stages, slice, choke, n), [stages, slice, choke, n]);
  const [chosen, setChosen] = useState<Record<number, string | null>>({});
  const pick = (k: number) => {
    const c = chosen[k];
    return c !== undefined && (c === null || slice[c]) ? c : defaults[k];
  };
  const options = (k: number) => stages.filter((s) => s.stage === k && s.role !== 'feedstock' && slice[s.key]);
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const bands = R.map((k) => {
    const key = pick(k);
    return key ? pickFlows(slice[key]) : null;
  });
  const feeds = stages
    .filter((s) => s.role === 'feedstock' && slice[s.key])
    .map((s) => ({ key: s.key, stage: s.stage, flows: pickFlows(slice[s.key]).slice(0, 3), use: s.use?.share ?? null }));
  const L = layout(bands, feeds, n);
  const iso = (i: number) => nodes[i]?.[0] ?? '?';
  const nameOf = (k: string) => byKey.get(k)?.name ?? k;
  // Labels fit the column spacing: about 6 px per Latin letter and 11 px per Hangul syllable at 11px.
  const colW = (X1 - X0) / n;
  const maxCh = Math.max(8, Math.floor(colW / (lang === 'ko' ? 11.5 : 6.3)));
  const heads = Array.from({ length: n + 1 }, (_, c) => (c < n ? levels[c].who : t(lang, 'chains.sankey.buyers')));

  const flowRows = [
    ...feeds.flatMap((f) => f.flows.map((x) => ({ stage: byKey.get(f.key)!.stage, key: f.key, f: x }))),
    ...R.flatMap((k, b) => (bands[b] ?? []).map((x) => ({ stage: k, key: pick(k)!, f: x }))),
  ];
  const ariaFlows = flowRows.slice(0, 12).map((r) => `${nameOf(r.key)} ${iso(r.f[0])}→${iso(r.f[1])} ${fmtShare(r.f[2], lang)}`).join('; ');

  const table = (
    <DataTable
      columns={[
        { key: 'st', label: t(lang, 'chains.sankey.col.stage') },
        { key: 'p', label: t(lang, 'chains.map.product') },
        { key: 'x', label: t(lang, 'chains.map.col.exporter') },
        { key: 'm', label: t(lang, 'chains.map.col.importer') },
        { key: 'w', label: t(lang, 'chains.map.col.share'), num: true, sortable: true },
      ]}
      rows={flowRows.map((r, i) => ({
        id: `${i}`,
        cells: { st: stageTag(lang, r.stage), p: nameOf(r.key), x: <span className="lr-iso">{iso(r.f[0])}</span>, m: <span className="lr-iso">{iso(r.f[1])}</span>, w: pct(r.f[2])?.toFixed(1) },
        sort: { w: r.f[2] },
      }))}
    />
  );

  return (
    <ChartFrame
      lang={lang}
      wide
      caption={<>{t(lang, 'chains.sankey.caption', { year })}{feeds.length ? ` ${t(lang, 'chains.sankey.captionFeed')}` : ''} {t(lang, 'chains.source')}.</>}
      csv={{
        name: `${chainId}-trail-${year}.csv`,
        header: [t(lang, 'chains.sankey.col.stage'), t(lang, 'chains.map.product'), t(lang, 'chains.map.col.exporter'), t(lang, 'chains.map.col.importer'), t(lang, 'chains.map.col.share')],
        rows: flowRows.map((r) => [stageTag(lang, r.stage), nameOf(r.key), iso(r.f[0]), iso(r.f[1]), pct(r.f[2])]),
      }}
      table={table}
    >
      <div className="ch-picks">
        {R.map((k) => {
          const opts = options(k);
          if (opts.length < 2) return null;
          const id = `pick-${chainId}-${k}`;
          return (
            <label key={k} className="lr-field ch-pick" htmlFor={id}>
              <span className="lr-label">{t(lang, 'chains.sankey.pick', { stage: stageTag(lang, k) })}</span>
              <select id={id} className="ch-select" value={pick(k) ?? ''} onChange={(e) => setChosen((c) => ({ ...c, [k]: e.target.value || null }))}>
                {opts.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <div className="ch-sankey" role="region" aria-label={t(lang, 'chains.sankey.scroll')} tabIndex={0}>
        <svg viewBox={`0 0 ${W} ${L.height}`} role="img" aria-label={t(lang, 'chains.sankey.aria', { chain: chainName, year, flows: ariaFlows })}
          style={{ minWidth: Math.max(760, 130 * (n + 1)) }}>
          {heads.map((h, c) => <text key={c} className="tr-col" x={colX(c, n)} y={16}><title>{h}</title>{truncate(h, maxCh)}</text>)}
          {R.map((k, b) => {
            const key = pick(k);
            const mid = (colX(b, n) + NODE_W + colX(b + 1, n)) / 2;
            const here = stages.filter((s) => s.stage === k);
            const why = here.length === 0 ? 'chains.sankey.none' : here.every((s) => s.role === 'feedstock') ? 'chains.sankey.feedOnly' : 'chains.sankey.empty';
            const label = key ? `${stageTag(lang, k)} · ${nameOf(key)}` : `${stageTag(lang, k)} · ${t(lang, why, { year })}`;
            return (
              <g key={k}>
                <text className="tr-stage" x={mid} y={36} textAnchor="middle" style={{ ['--stage' as string]: stageVar(k, n) }}>
                  <title>{label}</title>
                  {truncate(label, maxCh)}
                </text>
                {!key ? <line className="ch-sankey__gap" x1={colX(b, n) + NODE_W + 8} x2={colX(b + 1, n) - 8} y1={L.mainTop + 20} y2={L.mainTop + 20} /> : null}
              </g>
            );
          })}
          {L.lanes.map((ln) => {
            const s = byKey.get(ln.key)!;
            const u = s.use;
            const useText = u?.share != null ? t(lang, 'chains.use.badgeNoYear', { share: fmtShare(u.share, lang), source: u.short ?? '' }) : t(lang, 'chains.use.unknown');
            const label = t(lang, 'chains.sankey.feedLabel', { product: s.name, use: useText });
            return (
              <g key={ln.key}>
                <text className="ch-sankey__lane" x={colX(ln.band, n)} y={ln.y + 10}><title>{label}</title>{truncate(label, Math.max(24, 2 * maxCh))}</text>
                {L.lanes.some((o) => o.band === ln.band && o.y > ln.y) ? null : (
                  <line className="ch-sankey__join" x1={colX(ln.band + 1, n) + NODE_W / 2} x2={colX(ln.band + 1, n) + NODE_W / 2} y1={ln.y + ln.h - 4} y2={L.mainTop - 4} />
                )}
              </g>
            );
          })}
          {L.flows.map((f, i) => {
            const st = f.lane != null ? byKey.get(f.key)!.stage : f.band + 1;
            const prod = f.lane != null ? nameOf(f.key) : nameOf(pick(f.band + 1)!);
            const tip = t(lang, 'chains.sankey.flowTip', { product: prod, flow: `${iso(f.s)}→${iso(f.t)}`, share: fmtShare(f.share, lang) });
            if (f.lane != null) {
              const inner = f.use != null ? f.w * f.use : 0;
              const shift = (f.w - inner) / 2;
              return (
                <g key={i}>
                  <path className="tr-flow ch-flow--feed" d={ribbon(f.band, f.y0, f.y1, n)} strokeWidth={f.w}><title>{tip}</title></path>
                  {inner > 0.4 ? <path className="tr-flow ch-flow--use" style={{ stroke: stageVar(st, n) }} d={ribbon(f.band, f.y0 - shift, f.y1 - shift, n)} strokeWidth={inner}><title>{tip}</title></path> : null}
                </g>
              );
            }
            return <path key={i} className="tr-flow" style={{ stroke: stageVar(st, n) }} d={ribbon(f.band, f.y0, f.y1, n)} strokeWidth={f.w}><title>{tip}</title></path>;
          })}
          {L.nodes.map((nd, i) => {
            const ty = nd.y + Math.min(nd.h / 2, 7) + 4.5;
            return (
              <g key={i}>
                <rect className="tr-node" x={colX(nd.col, n)} y={nd.y} width={NODE_W} height={nd.h}><title>{nodes[nd.id]?.[1]}</title></rect>
                <text className="tr-label" x={colX(nd.col, n) + NODE_W + 4} y={ty}>{iso(nd.id)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
