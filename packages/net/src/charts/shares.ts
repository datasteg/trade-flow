// Chart kit 2 · Shares: the top five partners' shares (of an importer's imports, or of world exports) as lines in
// fixed slots viz-1 … viz-5, the rest folded into Other in viz-context. Identity by slot, never by rank: the caller
// fixes the order once (e.g. the five largest at the current period) and keeps it while the period moves. The table
// carries the change in percentage points between the base and the current period.
import { line as d3line, scaleLinear, select } from 'd3';
import { formatPeriod, formatPointChange, formatShare, type Lang } from '@larch/ui/format';
import { s } from '../strings';
import { v } from '../theme';
import {
  drawPartialBand, freshSvg, partialLabel, periodTicks, spreadLabels, tickLabel, watchWidth, type ChartTable,
} from './common';

export interface SharesSlot {
  key: string;
  /** Short name or ISO3. */
  label: string;
  /** Shares (fractions) by period; null where unknown. */
  values: (number | null)[];
  focus?: boolean;
}

export interface SharesOptions {
  lang: Lang;
  periods: number[];
  /** At most five, in slot order (viz-1 … viz-5). */
  slots: SharesSlot[];
  /** The rest (default: 1 − the slots, where every slot is known). Null hides it. */
  other?: (number | null)[] | null;
  current?: number | null;
  base?: number | null;
  complete?: number | null;
  coverage?: Record<string, number> | null;
  label: string;
  height?: number;
  onPick?: (t: number) => void;
}

export interface SharesHandle { update(o: SharesOptions): void; destroy(): void }

export function drawShares(host: HTMLElement, opts: SharesOptions): SharesHandle {
  let o = opts, width = 0;
  const stop = watchWidth(host, (w) => { width = w; render(host, o, w); });
  return { update(n) { o = n; if (width) render(host, o, width); }, destroy() { stop(); select(host).selectAll('svg').remove(); } };
}

export function otherShares(o: SharesOptions): (number | null)[] | null {
  if (o.other === null) return null;
  if (o.other) return o.other;
  return o.periods.map((_p, i) => {
    let sum = 0;
    for (const sl of o.slots) { const x = sl.values[i]; if (x == null) return null; sum += x; }
    return Math.max(0, 1 - sum);
  });
}

function render(host: HTMLElement, o: SharesOptions, W: number): void {
  const lang = o.lang, ps = o.periods, n = ps.length;
  const H = o.height ?? 180;
  const svg = freshSvg(host, W, H, o.label);
  if (!n) return;
  const slots = o.slots.slice(0, 5);
  const other = otherShares(o);
  const lines = [
    ...slots.map((sl, k) => ({ key: sl.key, label: sl.label, values: sl.values, colour: `viz-${k + 1}` })),
    ...(other ? [{ key: 'other', label: s(lang, 'other'), values: other, colour: 'viz-context' }] : []),
  ];
  const m = { t: 14, r: 92, b: 20, l: 40 };
  const iw = Math.max(10, W - m.l - m.r), ih = Math.max(10, H - m.t - m.b);
  const x = (i: number) => m.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const all = lines.flatMap((l) => l.values.filter((y): y is number => y != null));
  const y = scaleLinear().domain([0, Math.max(0.05, ...all)]).range([m.t + ih, m.t]).nice();
  const g = svg.append('g');
  if (o.complete != null && ps[n - 1] > o.complete) {
    const first = ps.findIndex((p) => p > o.complete!);
    const x0 = first > 0 ? (x(first - 1) + x(first)) / 2 : m.l;
    const cov = o.current != null && o.current > o.complete ? o.coverage?.[String(o.current)] : null;
    drawPartialBand(g, x0, m.l + iw, 0, m.t + ih, partialLabel(lang, cov));
  }
  for (const tv of y.ticks(3)) {
    g.append('line').attr('class', tv === 0 ? 'ln-zero' : 'ln-grid').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', y(tv)).attr('y2', y(tv));
    g.append('text').attr('class', 'lr-strip__tick').attr('x', m.l - 6).attr('y', y(tv)).attr('dy', '0.32em').attr('text-anchor', 'end').text(formatShare(tv, lang));
  }
  const ticks = periodTicks(ps, iw);
  for (const p of ticks.length > 1 ? ticks : [ps[0], ps[n - 1]]) {
    const i = ps.indexOf(p);
    g.append('text').attr('class', 'lr-strip__tick').attr('x', x(i)).attr('y', H - 3).attr('text-anchor', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle').text(tickLabel(p, lang));
  }
  const ci = o.current != null ? ps.indexOf(o.current) : -1;
  if (ci >= 0) g.append('line').attr('class', 'ln-now').attr('x1', x(ci)).attr('x2', x(ci)).attr('y1', m.t).attr('y2', m.t + ih);
  const bi = o.base != null ? ps.indexOf(o.base) : -1;
  if (bi >= 0) {
    g.append('circle').attr('class', 'lr-strip__base').attr('cx', x(bi)).attr('cy', m.t + ih).attr('r', 4);
  }
  const path = d3line<readonly [number, number | null]>().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1] as number));
  // Other first, so the slots draw over it
  for (const l of [...lines].reverse()) {
    g.append('path').attr('class', 'ln-line').style('stroke', v(l.colour)).attr('d', path(l.values.map((val, i) => [i, val] as const)) ?? '');
  }
  const at = ci >= 0 ? ci : n - 1;
  const ends = lines.map((l) => {
    let i = at;
    while (i >= 0 && l.values[i] == null) i--;
    return i < 0 ? null : { l, i, val: l.values[i] as number, y: y(l.values[i] as number) };
  }).filter((e): e is NonNullable<typeof e> => !!e);
  for (const e of ends) g.append('circle').attr('class', 'ln-enddot').attr('cx', x(e.i)).attr('cy', e.y).attr('r', 3.5).style('fill', v(e.l.colour));
  for (const e of spreadLabels(ends.map((e) => ({ ...e })), 13, m.t, m.t + ih)) {
    g.append('text').attr('class', 'ln-endlabel').attr('x', m.l + iw + 8).attr('y', e.y).attr('dy', '0.32em').text(`${e.l.label} ${formatShare(e.val, lang)}`);
  }
  if (o.onPick) {
    svg.style('cursor', 'pointer').on('click', (ev: MouseEvent) => {
      const rect = (svg.node() as SVGSVGElement).getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      o.onPick?.(ps[i]);
    });
  }
}

/** The table: each partner's share at the base and now, and the change in percentage points. */
export function sharesTable(o: SharesOptions): ChartTable {
  const lang = o.lang;
  const ci = o.current != null ? o.periods.indexOf(o.current) : o.periods.length - 1;
  const bi = o.base != null ? o.periods.indexOf(o.base) : -1;
  const other = otherShares(o);
  const rows = [...o.slots.slice(0, 5).map((sl) => ({ key: sl.key, label: sl.label, values: sl.values, focus: sl.focus })),
    ...(other ? [{ key: 'other', label: s(lang, 'other'), values: other, focus: false }] : [])];
  const bl = bi >= 0 ? formatPeriod(o.periods[bi], lang) : s(lang, 'base');
  const cl = ci >= 0 ? formatPeriod(o.periods[ci], lang) : '';
  return {
    columns: [
      { key: 'who', label: s(lang, 'economy') },
      { key: 'b', label: `${s(lang, 'share')}, ${bl}`, num: true },
      { key: 'c', label: `${s(lang, 'share')}, ${cl}`, num: true },
      { key: 'd', label: s(lang, 'changePp'), num: true },
    ],
    rows: rows.map((r) => {
      const b = bi >= 0 ? r.values[bi] : null, c = ci >= 0 ? r.values[ci] : null;
      const d = b != null && c != null ? c - b : null;
      return {
        id: r.key, focus: r.focus,
        cells: { who: r.label, b: formatShare(b, lang, { decimals: 1 }), c: formatShare(c, lang, { decimals: 1 }), d: formatPointChange(d, lang, { decimals: 1 }) },
        raw: { who: r.key, b, c, d },
      };
    }),
  };
}
