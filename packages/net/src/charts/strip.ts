// Chart kit 1 · Strip: one metric over all periods (a level, a year-on-year change, a share, an HHI). Under every
// map as bars (the TimeScrubber), in cards as lines (a trajectory; two lines of the same metric at most, e.g. the
// importer's and the exporter's report). One axis; the base as a hollow marker (draggable), the current period
// marked, partial periods under viz-band with "partial · 62% filed", events as diamonds, the last value labelled.
// With completeness, a line stops after its last period that holds enough of the
// economy's usual trade, periods under the threshold inside the series are drawn dotted, and the end labels read
// the selected period.
import { drag, pointer, scaleLinear, scaleLog, line as d3line, select } from 'd3';
import { formatPeriod, type Lang } from '@larch/ui/format';
import { s } from '../strings';
import { v } from '../theme';
import {
  drawDiamond, drawPartialBand, freshSvg, partialLabel, periodTicks, spreadLabels, tickLabel, watchWidth,
  type ChartTable, type Margin,
} from './common';

export interface StripSeries {
  key: string;
  /** In the page language ("Exports", "Japan's report"). */
  label: string;
  /** A colour token for lines (default viz-focus; second series viz-context). Bars always use viz-context /
   *  viz-focus. */
  colour?: string;
  values: (number | null)[];
}

/** An event on the strip: its period, a label (also the diamond's tooltip) and, optionally, its page. */
export interface StripEvent { t: number; label: string; href?: string }

export interface StripOptions {
  lang: Lang;
  /** Periods, YYYY or YYYYMM, ascending. */
  periods: number[];
  /** One series (two at most, same unit). */
  series: StripSeries[];
  /** Bars (the scrubber strip) or lines (cards). Default line. */
  mark?: 'bar' | 'line';
  current?: number | null;
  base?: number | null;
  /** The last complete period: later periods sit under the partial band. */
  complete?: number | null;
  /** meta.coverage[f]: the band reads "partial · 62% filed" for the current period when it is partial. */
  coverage?: Record<string, number> | null;
  /** Diamonds on the axis (at most three are labelled). */
  events?: StripEvent[];
  /** Value format for labels, tooltips and the table ("$115.4bn", "60%"). */
  format: (v: number) => string;
  /** Format for the table cells (default: format), when the labels round harder than the table should. */
  tableFormat?: (v: number) => string;
  /** Tick format for the y axis (default: format). */
  tickFormat?: (v: number) => string;
  /** Log scale for levels over long spans. */
  log?: boolean;
  /** Include zero in the y domain (default: true for bars, false for lines). */
  zero?: boolean;
  /** Height in px (default 52 for bars, 140 for lines). */
  height?: number;
  /** What the chart shows, for its aria-label ("World trade, all goods, 12-month sum"). */
  label: string;
  /** The first period the code exists: earlier periods read "code begins 2017". */
  codeBegins?: number | null;
  /** Click a period (bars and lines). */
  onPick?: (t: number) => void;
  /** Drag the base marker. */
  onBase?: (t: number) => void;
  /** Label the last value (default true for lines). */
  labelLast?: boolean;
  /** Per period, the share of the usual trade present (nodes/<f> `c`, series `cmp`); null = not measured. */
  completeness?: (number | null)[];
  /** Under this share a period is incomplete (default 0.9). */
  minComplete?: number;
  /** Where the source of the series changes (Korea: Comtrade ↔ the customs service): a tick under the axis. */
  seams?: StripSeam[];
  /** From this period on the values are preliminary (a source's latest months, which it may still revise): the
   *  line is dashed there and the label (e.g. "KCS, preliminary") sits over it; the table marks those periods. */
  prelim?: { from: number; label: string } | null;
}

export interface StripSeam { t: number; label: string }

export const MIN_COMPLETE = 0.9;
/** World completeness the last offered period needs (meta.shown; build_snapshots.SHOWN_MIN). */
export const SHOWN_MIN = 0.85;

/** The index of the last period a line is drawn to: after it, every period is under the threshold. */
export function lastComplete(o: Pick<StripOptions, 'periods' | 'completeness' | 'minComplete'>): number {
  const c = o.completeness, min = o.minComplete ?? MIN_COMPLETE;
  if (!c) return o.periods.length - 1;
  for (let i = o.periods.length - 1; i >= 0; i--) if (c[i] == null || (c[i] as number) >= min) return i;
  return -1;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export interface StripHandle {
  update(o: StripOptions): void;
  destroy(): void;
}

export function drawStrip(host: HTMLElement, opts: StripOptions): StripHandle {
  let o = opts;
  let width = 0;
  const draw = (w: number) => { width = w; render(host, o, w); };
  const stop = watchWidth(host, draw);
  return {
    update(next) { o = next; if (width) render(host, o, width); },
    destroy() { stop(); select(host).selectAll('svg.ln-chart__svg').remove(); },
  };
}

function render(host: HTMLElement, o: StripOptions, W: number): void {
  const bars = o.mark === 'bar';
  const H = o.height ?? (bars ? 52 : 140);
  const lang = o.lang;
  const ps = o.periods;
  const svg = freshSvg(host, W, H, o.label);
  if (!ps.length) return;
  const lastLabelW = bars || o.labelLast === false ? 0 : Math.min(190, 12 + Math.max(...o.series.map((x) => labelLen(x, o))));
  const m: Margin = bars ? { t: 14, r: 4, b: 16, l: 4 } : { t: 16, r: 8 + lastLabelW, b: 20, l: 46 };
  const iw = Math.max(10, W - m.l - m.r), ih = Math.max(10, H - m.t - m.b);
  const n = ps.length;
  const step = n > 1 ? iw / (n - 1) : iw;
  const bw = bars ? Math.max(1, Math.min(18, iw / n - (n > 60 ? 0.5 : 2))) : 0;
  const x = (i: number) => (bars ? m.l + (n > 1 ? (i * (iw - bw)) / (n - 1) + bw / 2 : iw / 2) : m.l + (n > 1 ? i * step : iw / 2));
  const idx = new Map(ps.map((p, i) => [p, i]));

  const cut = lastComplete(o);
  const minC = o.minComplete ?? MIN_COMPLETE;
  const low = (i: number) => o.completeness?.[i] != null && (o.completeness[i] as number) < minC;
  // the y domain leaves out the periods after the cut, so a falling tail does not squash the line
  const vals = o.series.flatMap((sr) => sr.values.filter((y, i): y is number => y != null && Number.isFinite(y) && (bars || i <= cut)));
  const zero = o.zero ?? bars;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!vals.length) { lo = 0; hi = 1; }
  if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) { hi = lo + (Math.abs(lo) || 1); }
  const useLog = !!o.log && lo > 0;
  const y = useLog ? scaleLog().domain([lo, hi]).range([m.t + ih, m.t]).nice() : scaleLinear().domain([lo, hi]).range([m.t + ih, m.t]).nice();

  const g = svg.append('g');
  // partial band
  if (o.complete != null && ps[n - 1] > o.complete) {
    const first = ps.findIndex((p) => p > o.complete!);
    if (first >= 0) {
      const x0 = first > 0 ? (x(first - 1) + x(first)) / 2 : m.l;
      const cov = o.current != null && o.current > o.complete ? o.coverage?.[String(o.current)] : null;
      drawPartialBand(g, x0, bars ? W - m.r : m.l + iw + 4, 0, m.t + ih, partialLabel(lang, cov));
    }
  }
  // code begins
  if (o.codeBegins != null && ps[0] < o.codeBegins) {
    const i = ps.findIndex((p) => p >= o.codeBegins!);
    if (i > 0) g.append('text').attr('class', 'lr-strip__label').attr('x', x(0)).attr('y', m.t + ih - 4).text(s(lang, 'codeBegins', { t: String(o.codeBegins) }));
  }

  if (!bars) {
    // gridlines and y ticks
    const ticks = (y as any).ticks(3) as number[];
    for (const tv of ticks) {
      g.append('line').attr('class', tv === 0 ? 'ln-zero' : 'ln-grid').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', y(tv)).attr('y2', y(tv));
      g.append('text').attr('class', 'lr-strip__tick').attr('x', m.l - 6).attr('y', y(tv)).attr('dy', '0.32em').attr('text-anchor', 'end')
        .text((o.tickFormat ?? o.format)(tv));
    }
  } else {
    g.append('line').attr('class', 'lr-strip__axis').attr('x1', m.l).attr('x2', W - m.r).attr('y1', m.t + ih).attr('y2', m.t + ih);
  }

  // x ticks
  const ticks = periodTicks(ps, iw, bars ? 56 : 64);
  const tickSet = ticks.length > 1 ? ticks : [ps[0], ps[n - 1]];
  for (const p of tickSet) {
    const i = idx.get(p)!;
    const tx = x(i);
    if (tx > W - m.r - 20 && i !== n - 1) continue;
    g.append('text').attr('class', 'lr-strip__tick').attr('x', tx).attr('y', H - 3)
      .attr('text-anchor', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle').text(tickLabel(p, lang));
  }

  const cur = o.current != null ? idx.get(o.current) : undefined;
  if (bars) {
    const sr = o.series[0];
    const base = y(Math.max(lo, 0));
    g.selectAll('rect.lr-strip__bar').data(sr.values.map((d, i) => (i > cut ? null : d))).join('rect')
      .attr('class', (_d, i) => (i === cur ? 'lr-strip__bar lr-strip__bar--t' : 'lr-strip__bar'))
      .style('opacity', (_d, i) => (low(i) ? 0.4 : null))
      .attr('x', (_d, i) => x(i) - bw / 2).attr('width', bw)
      .attr('y', (d) => (d == null ? base : Math.min(y(d), base)))
      .attr('height', (d) => (d == null ? 0 : Math.max(d === 0 ? 0 : 1, Math.abs(base - y(d)))))
      .append('title').text((d, i) => `${formatPeriod(ps[i], lang)}: ${d == null ? '–' : o.format(d)}`);
  } else {
    const ok = (d: readonly [number, number | null]) => d[1] != null && Number.isFinite(d[1]) && d[0] <= cut;
    const pi = o.prelim ? ps.findIndex((p) => p >= o.prelim!.from) : -1;
    const firm = (i: number) => pi < 0 || i < pi;
    const anyLow = o.series.some((sr) => sr.values.some((val, i) => val != null && i <= cut && low(i)));
    o.series.forEach((sr, k) => {
      const colour = sr.colour ?? (k === 0 ? 'viz-focus' : 'viz-context');
      const pts = sr.values.map((val, i) => [i, val] as const);
      // incomplete periods inside the series: a dotted line under the solid one, which skips them
      if (anyLow) {
        const thin = d3line<readonly [number, number | null]>().defined(ok).x((d) => x(d[0])).y((d) => y(d[1] as number));
        g.append('path').attr('class', 'ln-line ln-line--thin').style('stroke', v(colour)).attr('d', thin(pts) ?? '');
      }
      const path = d3line<readonly [number, number | null]>().defined((d) => ok(d) && !low(d[0]) && firm(d[0]))
        .x((d) => x(d[0])).y((d) => y(d[1] as number));
      g.append('path').attr('class', 'ln-line').style('stroke', v(colour)).attr('d', path(pts) ?? '');
      // the preliminary tail, dashed, joined to the last firm period
      if (pi >= 0) {
        const tail = d3line<readonly [number, number | null]>().defined((d) => ok(d) && d[0] >= pi - 1)
          .x((d) => x(d[0])).y((d) => y(d[1] as number));
        g.append('path').attr('class', 'ln-line ln-line--prelim').style('stroke', v(colour)).attr('d', tail(pts) ?? '');
      }
    });
    if (pi > 0 && pi <= cut) {
      g.append('text').attr('class', 'lr-strip__label ln-prelim-label').attr('x', x(pi)).attr('y', m.t - 4)
        .attr('text-anchor', 'end').text(o.prelim!.label);
    }
    // end dots and labels: at the selected period when it is drawn, else at the last period drawn
    const ends = o.series.map((sr, k) => {
      const i = anchorIndex(sr, o, cut);
      return i < 0 ? null : { i, val: sr.values[i] as number, y: y(sr.values[i] as number), colour: sr.colour ?? (k === 0 ? 'viz-focus' : 'viz-context'), label: sr.label };
    }).filter((e): e is NonNullable<typeof e> => !!e);
    for (const e of ends) g.append('circle').attr('class', 'ln-enddot').attr('cx', x(e.i)).attr('cy', e.y).attr('r', 4).style('fill', v(e.colour));
    if (o.labelLast !== false) {
      const spread = spreadLabels(ends.map((e) => ({ ...e })), 14, m.t, m.t + ih);
      for (const e of spread) {
        g.append('text').attr('class', 'ln-endlabel').attr('x', m.l + iw + 8).attr('y', e.y).attr('dy', '0.32em')
          .text(endText(o.series.find((sr) => sr.label === e.label)!, e.i, o));
      }
    }
  }

  // current period
  if (cur != null) {
    if (bars) {
      g.append('rect').attr('class', 'lr-strip__t').attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8)
        .attr('transform', `translate(${x(cur)},${m.t + ih}) rotate(45)`);
    } else {
      g.append('line').attr('class', 'ln-now').attr('x1', x(cur)).attr('x2', x(cur)).attr('y1', m.t).attr('y2', m.t + ih);
    }
  }
  // where the source changes: a short tick under the axis between the two periods
  for (const sm of o.seams ?? []) {
    const i = idx.get(sm.t);
    if (i == null || i === 0) continue;
    const sx = bars ? x(i) - bw / 2 - 1 : (x(i - 1) + x(i)) / 2;
    const seam = g.append('line').attr('class', 'ln-seam').attr('x1', sx).attr('x2', sx).attr('y1', m.t + ih - 6).attr('y2', m.t + ih + 4);
    seam.append('title').text(sm.label);
  }
  // events
  const evs = (o.events ?? []).filter((e) => idx.has(e.t));
  evs.forEach((e, k) => {
    const ex = x(idx.get(e.t)!);
    const d = drawDiamond(g, ex, m.t + ih, 6);
    d.append('title').text(e.label);
    if (e.href) d.style('cursor', 'pointer').on('click', (ev: MouseEvent) => { ev.stopPropagation(); window.location.assign(e.href!); });
    if (k < 3 && !bars) g.append('text').attr('class', 'lr-strip__label').attr('x', ex + 5).attr('y', m.t + 10).text(e.label);
  });
  // base marker
  const bi = o.base != null ? idx.get(o.base) : undefined;
  if (bi != null) {
    const bg = g.append('g').attr('class', 'ln-basemark').attr('transform', `translate(${x(bi)},${m.t + ih})`);
    bg.append('circle').attr('class', 'lr-strip__base').attr('r', 5);
    // the word "base" only where there is room for it (the period readout repeats the base)
    if (iw >= 360 || !bars) bg.append('text').attr('class', 'lr-strip__label').attr('y', -8).attr('text-anchor', 'middle').text(s(lang, 'base'));
    bg.append('title').text(`${s(lang, 'base')}: ${formatPeriod(o.base!, lang)}`);
    if (o.onBase) {
      bg.style('cursor', 'ew-resize');
      const nearest = (px: number) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
        return best;
      };
      let at = bi;
      bg.call(drag<SVGGElement, unknown>()
        .on('drag', (ev) => { at = nearest(ev.x); bg.attr('transform', `translate(${x(at)},${m.t + ih})`); })
        .on('end', () => { if (ps[at] !== o.base) o.onBase?.(ps[at]); }) as never);
    }
  }
  // click to jump, with a hover readout
  if (o.onPick) {
    const hit = svg.append('rect').attr('class', 'ln-hitarea').attr('x', m.l - 4).attr('y', 0).attr('width', iw + 8).attr('height', m.t + ih)
      .style('cursor', 'pointer');
    hit.lower();
    svg.select('g').raise();
    const nearest = (ev: MouseEvent) => {
      const [px] = pointer(ev, svg.node());
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    svg.on('click', (ev: MouseEvent) => {
      if ((ev.target as Element).closest('.ln-basemark')) return;
      o.onPick?.(ps[nearest(ev)]);
    });
    svg.style('cursor', 'pointer');
  }
}

function lastIndex(vals: (number | null)[]): number {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null && Number.isFinite(vals[i] as number)) return i;
  return -1;
}

/** The period an end label reads: the selected one when it is drawn, else the last period drawn. */
function anchorIndex(sr: StripSeries, o: StripOptions, cut: number): number {
  const cur = o.current != null ? o.periods.indexOf(o.current) : -1;
  if (cur >= 0 && cur <= cut && sr.values[cur] != null && Number.isFinite(sr.values[cur] as number)) return cur;
  return lastIndex(sr.values.slice(0, cut + 1));
}

/** "Exports $791bn", with the period when the label does not read the selected period. */
function endText(sr: StripSeries, i: number, o: StripOptions): string {
  const val = o.format(sr.values[i] as number);
  const txt = o.series.length > 1 ? `${sr.label} ${val}` : val;
  return o.current != null && o.periods[i] !== o.current ? `${txt} · ${formatPeriod(o.periods[i], o.lang)}` : txt;
}

function labelLen(sr: StripSeries, o: StripOptions): number {
  const i = anchorIndex(sr, o, lastComplete(o));
  const txt = i < 0 ? '' : endText(sr, i, o);
  let w = 0;
  for (const ch of txt) w += /[ㄱ-힣]/.test(ch) ? 11 : 6.4;
  return w;
}

/** The Strip's table: period and each series, with the partial periods marked. */
export function stripTable(o: StripOptions): ChartTable {
  const lang = o.lang;
  return {
    columns: [{ key: 't', label: s(lang, 'period') }, ...o.series.map((sr) => ({ key: sr.key, label: sr.label, num: true })),
      ...(o.completeness ? [{ key: 'cmp', label: s(lang, 'completeness'), num: true }] : []),
      ...(o.prelim ? [{ key: 'pre', label: o.prelim.label }] : [])],
    rows: o.periods.map((p, i) => {
      const c = o.completeness?.[i] ?? null;
      const flag = c != null && c < (o.minComplete ?? MIN_COMPLETE) ? ` (${s(lang, 'incomplete', { v: pct(c) })})`
        : o.complete != null && p > o.complete ? ` (${s(lang, 'partial')})` : '';
      const cells: Record<string, string> = { t: formatPeriod(p, lang) + flag };
      const raw: Record<string, string | number | null> = { t: p };
      for (const sr of o.series) {
        const val = sr.values[i];
        cells[sr.key] = val == null ? '–' : (o.tableFormat ?? o.format)(val);
        raw[sr.key] = val ?? null;
      }
      if (o.completeness) { cells.cmp = c == null ? '–' : pct(c); raw.cmp = c; }
      if (o.prelim) { const pre = p >= o.prelim.from; cells.pre = pre ? '✓' : ''; raw.pre = pre ? 1 : 0; }
      return { id: String(p), cells, raw };
    }),
  };
}
