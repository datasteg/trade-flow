// A line chart drawn on the server (no script): lines in an SVG stretched to the width of the page, everything that
// is text in HTML, so a 390px phone and a 1440px screen read the same 12px labels. The y axis is in pixels (the
// height is fixed), the x axis in percent. Design book, Charts & tables: lines 2px round, slots viz-1 … viz-5 in a
// fixed order, Other in viz-context, one axis, the last value labelled, at most a few annotations.
import type { ReactNode } from 'react';
import { periodValue } from './names';

export interface LineSeries {
  id: string;
  label: string;
  values: (number | null)[];
  /** A colour token: "viz-1" … "viz-5", "viz-context", "viz-focus". */
  colour: string;
  /** Mark the line label with the trail marker (a focus economy). */
  focus?: boolean;
}

export interface ChartEvent { t: number; label: string; title?: string; selected?: boolean; href?: string; row?: number }

export interface LineChartProps {
  t: number[];
  series: LineSeries[];
  /** Formats a y value for ticks and end labels. */
  format: (v: number) => string;
  /** Tick labels for the x axis: which periods and how they read. */
  ticks: { t: number; label: string }[];
  ariaLabel: string;
  height?: number;
  /** Include zero in the y range (shares, levels). */
  zero?: boolean;
  /** Fixed y range (e.g. [0, 1] for shares). */
  domain?: [number, number];
  /** A shaded band from this period to the end, with its label (partial months). */
  band?: { from: number; label: ReactNode };
  /** Diamonds along the top for events (numbered), at most a few annotations otherwise. */
  events?: ChartEvent[];
  /** The base and the current period, as vertical markers. */
  marks?: { t: number; label: string }[];
  /** Direct labels at the line ends (up to four series), else a legend under the chart. */
  legend?: 'end' | 'below';
}

const PAD_TOP = 10;
const PAD_BOTTOM = 26;
const LABEL_GAP = 17;

/** Three to six round ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) hi = lo + (Math.abs(lo) || 1);
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Spreads label positions so no two are closer than `gap`, inside [lo, hi]. */
export function declutter(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(ys.length);
  let prev = -Infinity;
  for (const [y, i] of order) {
    const v = Math.max(y, prev + gap, lo);
    out[i] = v;
    prev = v;
  }
  // Pushed past the bottom: shift the stack back up.
  let over = Math.max(0, (order.length ? out[order[order.length - 1][1]] : 0) - hi);
  for (let k = order.length - 1; k >= 0 && over > 0; k--) {
    const i = order[k][1];
    out[i] -= over;
    const next = k > 0 ? out[order[k - 1][1]] : -Infinity;
    over = Math.max(0, next + gap - out[i]);
  }
  return out;
}

export function LineChart(p: LineChartProps) {
  const H = p.height ?? 220;
  const rows = Math.max(0, ...(p.events ?? []).map((e) => e.row ?? 0));
  const PT = (p.events?.length || p.marks?.length) ? 30 + 22 * rows : PAD_TOP;
  const plotH = H - PT - PAD_BOTTOM;
  const xs = p.t.map(periodValue);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const xp = (v: number) => (x1 === x0 ? 50 : ((v - x0) / (x1 - x0)) * 100);
  const all = p.series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
  let lo = p.domain ? p.domain[0] : Math.min(...all), hi = p.domain ? p.domain[1] : Math.max(...all);
  if (!all.length) { lo = 0; hi = 1; }
  if (p.zero && !p.domain) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  let ticks = niceTicks(lo, hi, 4);
  if (!p.domain && ticks.length > 1) {
    // Extend the range to the round ticks around the data, so no line runs above the top gridline.
    const step = ticks[1] - ticks[0];
    if (ticks[ticks.length - 1] < hi - 1e-12) ticks = [...ticks, ticks[ticks.length - 1] + step];
    if (ticks[0] > lo + 1e-12) ticks = [ticks[0] - step, ...ticks];
    lo = ticks[0]; hi = ticks[ticks.length - 1];
  }
  const yp = (v: number) => PT + (hi === lo ? plotH / 2 : (1 - (v - lo) / (hi - lo)) * plotH);
  // Direct labels at the line ends for up to four short names; otherwise a legend under the chart.
  const legend = p.legend ?? (p.series.length <= 4 && p.series.every((x) => x.label.length <= 14) ? 'end' : 'below');

  const paths = p.series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xp(xs[i]).toFixed(3)},${yp(v).toFixed(2)}`;
      pen = true;
    });
    const lastI = s.values.map((v, i) => (v == null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
    return { s, d, lastI, single: d.split('M').length - 1 };
  });

  const ends = paths.filter((q) => q.lastI >= 0);
  const labelY = declutter(ends.map((q) => yp(q.s.values[q.lastI] as number)), LABEL_GAP, PT + 2, PT + plotH - 2);

  return (
    <div className={`st-line${legend === 'end' ? ' st-line--end' : ''}`}>
      <div className="st-line__frame" style={{ height: H }} role="img" aria-label={p.ariaLabel}>
        {ticks.map((v) => (
          <span key={`y${v}`} className="st-line__ytick" style={{ top: yp(v) }}>{p.format(v)}</span>
        ))}
        <div className="st-line__plot">
          {p.band ? (() => {
            const from = periodValue(p.band.from);
            if (from > x1) return null;
            const left = Math.max(0, xp(from));
            return (
              <div className="st-line__band" style={{ left: `${left}%`, top: PT, height: plotH }}>
                <span>{p.band.label}</span>
              </div>
            );
          })() : null}
          <svg className="st-line__svg" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
            {ticks.map((v) => (
              <line key={`g${v}`} x1={0} x2={100} y1={yp(v)} y2={yp(v)}
                className={v === 0 && lo < 0 ? 'st-axis' : 'st-grid'} vectorEffect="non-scaling-stroke" />
            ))}
            {(p.marks ?? []).map((m) => (
              <line key={`m${m.t}`} x1={xp(periodValue(m.t))} x2={xp(periodValue(m.t))} y1={PT} y2={PT + plotH}
                className="st-mark" vectorEffect="non-scaling-stroke" />
            ))}
            {paths.map((q) => (
              <path key={q.s.id} d={q.d} className="st-line__path" style={{ stroke: `var(--${q.s.colour})` }}
                vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {paths.map((q) => {
            // Isolated points (a line broken on both sides) and the last value get a dot.
            const dots: number[] = [];
            q.s.values.forEach((v, i) => {
              if (v == null) return;
              const prev = i > 0 ? q.s.values[i - 1] : null, next = i < q.s.values.length - 1 ? q.s.values[i + 1] : null;
              if (i === q.lastI || (prev == null && next == null)) dots.push(i);
            });
            return dots.map((i) => (
              <span key={`${q.s.id}-${i}`} className="st-dot" aria-hidden
                style={{ left: `${xp(xs[i])}%`, top: yp(q.s.values[i] as number), background: `var(--${q.s.colour})` }} />
            ));
          })}
          {(p.marks ?? []).map((m) => (
            <span key={`ml${m.t}`} className="st-line__marklabel" style={{ left: `${xp(periodValue(m.t))}%`, top: PT - 22 }}>{m.label}</span>
          ))}
          {(p.events ?? []).map((e) => {
            const v = periodValue(e.t);
            if (v < x0 || v > x1) return null;
            return (
              e.href ? (
                <a key={`e${e.label}`} href={e.href} className={`st-event${e.selected ? ' is-selected' : ''}`} style={{ left: `${xp(v)}%`, top: 2 + 22 * (e.row ?? 0) }} title={e.title} aria-label={e.title}>
                  <i aria-hidden />
                  <b aria-hidden>{e.label}</b>
                </a>
              ) : (
                <span key={`e${e.label}`} className={`st-event${e.selected ? ' is-selected' : ''}`} style={{ left: `${xp(v)}%`, top: 2 + 22 * (e.row ?? 0) }} title={e.title}>
                  <i aria-hidden />
                  <b>{e.label}</b>
                </span>
              )
            );
          })}
          {p.ticks.map((tk, k) => {
            const v = periodValue(tk.t);
            if (v < x0 - 1e-9 || v > x1 + 1e-9) return null;
            const left = xp(v);
            const align = left < 4 ? 'start' : left > 96 ? 'end' : 'mid';
            // Every other tick drops out in a narrow chart (a container query in stories.css).
            const minor = p.ticks.length > 4 && k % 2 === 1;
            return <span key={`x${tk.t}`} className={`st-line__xtick st-line__xtick--${align}${minor ? ' is-minor' : ''}`} style={{ left: `${left}%`, top: PT + plotH + 6 }}>{tk.label}</span>;
          })}
        </div>
        {legend === 'end' ? (
          <div className="st-line__ends" aria-hidden>
            {ends.map((q, k) => (
              <span key={q.s.id} className="st-line__end" style={{ top: labelY[k] }}>
                <i style={{ background: `var(--${q.s.colour})` }} />
                <span className="st-line__endname">{q.s.focus ? <span className="lr-marker lr-marker--sm" /> : null}{q.s.label}</span>
                <b>{p.format(q.s.values[q.lastI] as number)}</b>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {legend === 'below' ? (
        <ul className="st-keys" aria-hidden>
          {ends.map((q) => (
            <li key={q.s.id}>
              <i style={{ background: `var(--${q.s.colour})` }} />
              {q.s.focus ? <span className="lr-marker lr-marker--sm" /> : null}
              {q.s.label} <b>{p.format(q.s.values[q.lastI] as number)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Ticks for an axis of periods: every year (annual); for months, every k-th month on short spans and the
 *  Januaries (or the first month of each year) on long ones, thinned to at most `max`. */
export function periodTicks(t: number[], max: number, label: (p: number) => string): { t: number; label: string }[] {
  if (!t.length) return [];
  const monthly = t[0] > 9999;
  let cand: number[];
  if (!monthly || t.length <= 24) cand = [...t];
  else cand = t.filter((p, i) => i > 0 && Math.floor(p / 100) !== Math.floor(t[i - 1] / 100));
  if (!cand.length) cand = [t[0]];
  const step = Math.max(1, Math.ceil(cand.length / max));
  const out = cand.filter((_, i) => i % step === 0);
  // Name the last period of an annual axis when it fits.
  if (!monthly && out[out.length - 1] !== cand[cand.length - 1] && cand.length > 1 && step > 1) {
    const lastI = cand.indexOf(out[out.length - 1]);
    if (cand.length - 1 - lastI >= Math.ceil(step / 2)) out.push(cand[cand.length - 1]);
  }
  return out.map((p) => ({ t: p, label: label(p) }));
}
