// Chart kit 3 · Slope: rank or share at the base and now, one line per economy, ten at most. The movers (the
// largest changes, or those the caller flags) in viz-focus, the rest in viz-context; the focus economy carries the trail marker.
import { scaleLinear, select } from 'd3';
import { formatPointChange, formatShare, type Lang } from '@larch/ui/format';
import { s } from '../strings';
import { freshSvg, spreadLabels, watchWidth, type ChartTable } from './common';

export interface SlopeItem {
  key: string;
  label: string;
  /** At the base and now: shares (fractions) or ranks, by `mode`. Null when absent then. */
  a: number | null;
  b: number | null;
  mover?: boolean;
  focus?: boolean;
}

export interface SlopeOptions {
  lang: Lang;
  /** Column heads: the base and the current period ("2017", "2024"). */
  left: string;
  right: string;
  items: SlopeItem[];
  /** share: y = share (fractions); rank: y = rank, 1 at the top. */
  mode?: 'share' | 'rank';
  /** How many of the largest changes count as movers when no item is flagged (default 3). */
  movers?: number;
  label: string;
  height?: number;
}

export interface SlopeHandle { update(o: SlopeOptions): void; destroy(): void }

export function drawSlope(host: HTMLElement, opts: SlopeOptions): SlopeHandle {
  let o = opts, width = 0;
  const stop = watchWidth(host, (w) => { width = w; render(host, o, w); });
  return { update(n) { o = n; if (width) render(host, o, width); }, destroy() { stop(); select(host).selectAll('svg').remove(); } };
}

/** Which items are movers: those flagged, else the `movers` largest absolute changes. */
export function slopeMovers(o: SlopeOptions): Set<string> {
  const flagged = o.items.filter((it) => it.mover).map((it) => it.key);
  if (flagged.length) return new Set(flagged);
  const k = o.movers ?? 3;
  return new Set(o.items.filter((it) => it.a != null && it.b != null)
    .sort((p, q) => Math.abs((q.b as number) - (q.a as number)) - Math.abs((p.b as number) - (p.a as number)))
    .slice(0, k).map((it) => it.key));
}

function render(host: HTMLElement, o: SlopeOptions, W: number): void {
  const lang = o.lang;
  const items = o.items.slice(0, 10);
  const rank = o.mode === 'rank';
  const H = o.height ?? Math.max(150, 26 * items.length + 40);
  const svg = freshSvg(host, W, H, o.label);
  if (!items.length) return;
  const m = { t: 22, b: 8, l: 6, r: 6 };
  const labW = Math.min(110, Math.max(70, W * 0.3));
  const xa = m.l + labW, xb = W - m.r - labW;
  const vals = items.flatMap((it) => [it.a, it.b]).filter((x): x is number => x != null);
  const y = rank
    ? scaleLinear().domain([1, Math.max(10, ...vals)]).range([m.t + 6, H - m.b - 6])
    : scaleLinear().domain([0, Math.max(...vals, 0.01)]).range([H - m.b - 6, m.t + 6]).nice();
  const movers = slopeMovers(o);
  const fmt = (x: number) => (rank ? `#${x}` : formatShare(x, lang, { decimals: x < 0.1 ? 1 : 0 }));
  const g = svg.append('g');
  g.append('text').attr('class', 'lr-strip__tick ln-slope__head').attr('x', xa).attr('y', 12).attr('text-anchor', 'middle').text(o.left);
  g.append('text').attr('class', 'lr-strip__tick ln-slope__head').attr('x', xb).attr('y', 12).attr('text-anchor', 'middle').text(o.right);
  g.append('line').attr('class', 'ln-grid').attr('x1', xa).attr('x2', xa).attr('y1', m.t).attr('y2', H - m.b);
  g.append('line').attr('class', 'ln-grid').attr('x1', xb).attr('x2', xb).attr('y1', m.t).attr('y2', H - m.b);
  const ordered = [...items].sort((p, q) => Number(movers.has(p.key)) - Number(movers.has(q.key)));
  for (const it of ordered) {
    const mv = movers.has(it.key);
    const cls = mv ? 'ln-slope ln-slope--mover' : 'ln-slope';
    if (it.a != null && it.b != null) g.append('line').attr('class', cls).attr('x1', xa).attr('x2', xb).attr('y1', y(it.a)).attr('y2', y(it.b));
    for (const [xx, val] of [[xa, it.a], [xb, it.b]] as const) {
      if (val == null) continue;
      if (it.focus) {
        g.append('rect').attr('class', 'ln-focusmark').attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8).attr('transform', `translate(${xx},${y(val)}) rotate(45)`);
      } else {
        g.append('circle').attr('class', mv ? 'ln-slope__dot ln-slope__dot--mover' : 'ln-slope__dot').attr('cx', xx).attr('cy', y(val)).attr('r', 3.5);
      }
    }
  }
  const left = spreadLabels(items.filter((it) => it.a != null).map((it) => ({ it, y: y(it.a as number) })), 13, m.t, H - m.b);
  for (const l of left) {
    g.append('text').attr('class', movers.has(l.it.key) ? 'ln-endlabel ln-endlabel--strong' : 'ln-endlabel').attr('x', xa - 8).attr('y', l.y).attr('dy', '0.32em')
      .attr('text-anchor', 'end').text(`${l.it.label} ${fmt(l.it.a as number)}`);
  }
  const right = spreadLabels(items.filter((it) => it.b != null).map((it) => ({ it, y: y(it.b as number) })), 13, m.t, H - m.b);
  for (const r of right) {
    g.append('text').attr('class', movers.has(r.it.key) ? 'ln-endlabel ln-endlabel--strong' : 'ln-endlabel').attr('x', xb + 8).attr('y', r.y).attr('dy', '0.32em')
      .text(`${fmt(r.it.b as number)} ${r.it.label}`);
  }
}

export function slopeTable(o: SlopeOptions): ChartTable {
  const lang = o.lang, rank = o.mode === 'rank';
  const movers = slopeMovers(o);
  return {
    columns: [
      { key: 'who', label: s(lang, 'economy') },
      { key: 'a', label: `${rank ? s(lang, 'rank') : s(lang, 'share')}, ${o.left}`, num: true },
      { key: 'b', label: `${rank ? s(lang, 'rank') : s(lang, 'share')}, ${o.right}`, num: true },
      { key: 'd', label: rank ? s(lang, 'change') : s(lang, 'changePp'), num: true },
      { key: 'm', label: s(lang, 'moved') },
    ],
    rows: o.items.slice(0, 10).map((it) => {
      const d = it.a != null && it.b != null ? it.b - it.a : null;
      const fmt = (x: number | null) => (x == null ? '–' : rank ? `#${x}` : formatShare(x, lang, { decimals: 1 }));
      return {
        id: it.key, focus: it.focus,
        cells: {
          who: it.label, a: fmt(it.a), b: fmt(it.b),
          d: d == null ? '–' : rank ? (d === 0 ? '0' : `${d < 0 ? '+' : '−'}${Math.abs(d)}`) : formatPointChange(d, lang, { decimals: 1 }),
          m: movers.has(it.key) ? '●' : '',
        },
        raw: { who: it.key, a: it.a, b: it.b, d: rank && d != null ? -d : d, m: movers.has(it.key) ? 1 : 0 },
      };
    }),
  };
}
