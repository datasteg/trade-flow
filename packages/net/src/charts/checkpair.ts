// Chart kit 6 · Check pair: two short lines indexed to a common base (= 100) on one axis — Comtrade against customs,
// value against volume, unit value against a world price. Never a dual axis. The gap is in the table; the status is a
// word with an icon (drawn by the React wrapper), never a colour alone.
import { line as d3line, scaleLinear, select } from 'd3';
import { formatNumber, formatPeriod, type Lang } from '@larch/ui/format';
import { s } from '../strings';
import { v } from '../theme';
import { freshSvg, periodTicks, spreadLabels, tickLabel, watchWidth, type ChartTable } from './common';
import type { CheckStatus } from '../types';

export interface CheckPairOptions {
  lang: Lang;
  periods: number[];
  /** The base period's label ("2019"): both lines are 100 there. */
  base: string;
  a: { label: string; values: (number | null)[] };
  b: { label: string; values: (number | null)[] };
  status?: CheckStatus;
  label: string;
  height?: number;
}

export interface CheckPairHandle { update(o: CheckPairOptions): void; destroy(): void }

export function drawCheckPair(host: HTMLElement, opts: CheckPairOptions): CheckPairHandle {
  let o = opts, width = 0;
  const stop = watchWidth(host, (w) => { width = w; render(host, o, w); });
  return { update(n) { o = n; if (width) render(host, o, width); }, destroy() { stop(); select(host).selectAll('svg').remove(); } };
}

function render(host: HTMLElement, o: CheckPairOptions, W: number): void {
  const lang = o.lang, ps = o.periods, n = ps.length;
  const H = o.height ?? 150;
  const svg = freshSvg(host, W, H, o.label);
  if (!n) return;
  const m = { t: 12, r: 70, b: 20, l: 40 };
  const iw = Math.max(10, W - m.l - m.r), ih = Math.max(10, H - m.t - m.b);
  const x = (i: number) => m.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const vals = [...o.a.values, ...o.b.values].filter((y): y is number => y != null && Number.isFinite(y));
  const y = scaleLinear().domain([Math.min(100, ...vals), Math.max(100, ...vals)]).range([m.t + ih, m.t]).nice();
  const g = svg.append('g');
  for (const tv of y.ticks(3)) {
    g.append('line').attr('class', tv === 100 ? 'ln-zero' : 'ln-grid').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', y(tv)).attr('y2', y(tv));
    g.append('text').attr('class', 'lr-strip__tick').attr('x', m.l - 6).attr('y', y(tv)).attr('dy', '0.32em').attr('text-anchor', 'end').text(formatNumber(tv, lang));
  }
  const ticks = periodTicks(ps, iw);
  for (const p of ticks.length > 1 ? ticks : [ps[0], ps[n - 1]]) {
    const i = ps.indexOf(p);
    g.append('text').attr('class', 'lr-strip__tick').attr('x', x(i)).attr('y', H - 3).attr('text-anchor', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle').text(tickLabel(p, lang));
  }
  const path = d3line<readonly [number, number | null]>().defined((d) => d[1] != null && Number.isFinite(d[1])).x((d) => x(d[0])).y((d) => y(d[1] as number));
  const lines = [{ ...o.a, colour: 'viz-1' }, { ...o.b, colour: 'viz-2' }];
  for (const l of lines) g.append('path').attr('class', 'ln-line').style('stroke', v(l.colour)).attr('d', path(l.values.map((val, i) => [i, val] as const)) ?? '');
  const ends = lines.map((l) => {
    let i = n - 1;
    while (i >= 0 && l.values[i] == null) i--;
    return i < 0 ? null : { l, i, y: y(l.values[i] as number), val: l.values[i] as number };
  }).filter((e): e is NonNullable<typeof e> => !!e);
  for (const e of ends) g.append('circle').attr('class', 'ln-enddot').attr('cx', x(e.i)).attr('cy', e.y).attr('r', 3.5).style('fill', v(e.l.colour));
  for (const e of spreadLabels(ends.map((e) => ({ ...e })), 13, m.t, m.t + ih)) {
    g.append('text').attr('class', 'ln-endlabel').attr('x', x(e.i) + 7).attr('y', e.y).attr('dy', '0.32em').text(formatNumber(e.val, lang));
  }
}

/** The table: both indexes and the gap (a − b, index points) by period. */
export function checkPairTable(o: CheckPairOptions): ChartTable {
  const lang = o.lang;
  return {
    columns: [
      { key: 't', label: s(lang, 'period') },
      { key: 'a', label: `${o.a.label} (${s(lang, 'index', { base: o.base })})`, num: true },
      { key: 'b', label: `${o.b.label} (${s(lang, 'index', { base: o.base })})`, num: true },
      { key: 'g', label: s(lang, 'gap'), num: true },
    ],
    rows: o.periods.map((p, i) => {
      const a = o.a.values[i], b = o.b.values[i];
      const gap = a != null && b != null ? Math.round((a - b) * 10) / 10 : null;
      return {
        id: String(p),
        cells: { t: formatPeriod(p, lang), a: formatNumber(a, lang, { decimals: 1 }), b: formatNumber(b, lang, { decimals: 1 }), g: formatNumber(gap, lang, { decimals: 1, signed: true }) },
        raw: { t: p, a: a ?? null, b: b ?? null, g: gap },
      };
    }),
  };
}
