// A scatter of changes (x and y both in percentage points, zero lines drawn), server-rendered like LineChart: the
// x axis in percent of the width, the y axis in pixels. Dots in viz-1 sized by a third value; the focus economy marked; the
// labelled points are the ones the reading is about (largest movements), decluttered on a nominal 640px width.
import { niceTicks } from './LineChart';

export interface ScatterPoint { id: string; label: string; x: number; y: number; size?: number; focus?: boolean; labelled?: boolean }

export function Scatter({ points, xLabel, yLabel, format, ariaLabel, height = 300 }: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const PT = 12, PB = 34, W0 = 640;
  const plotH = height - PT - PB;
  const ext = (vs: number[]) => {
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    const pad = (hi - lo || 0.01) * 0.08;
    return [lo - pad, hi + pad] as const;
  };
  const [xl, xh] = ext(points.map((p) => p.x));
  const [yl, yh] = ext(points.map((p) => p.y));
  const xt = niceTicks(xl, xh, 4), yt = niceTicks(yl, yh, 4);
  const lx = Math.min(xl, xt[0] ?? xl), hx = Math.max(xh, xt[xt.length - 1] ?? xh);
  const ly = Math.min(yl, yt[0] ?? yl), hy = Math.max(yh, yt[yt.length - 1] ?? yh);
  const xp = (v: number) => ((v - lx) / (hx - lx)) * 100;
  const yp = (v: number) => PT + (1 - (v - ly) / (hy - ly)) * plotH;
  const smax = Math.max(1e-9, ...points.map((p) => p.size ?? 0));
  const r = (p: ScatterPoint) => (p.size != null ? 3 + 7 * Math.sqrt(p.size / smax) : 4);

  // Labels: largest first, skipped when they would overlap one already placed.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labels = points.filter((p) => p.labelled).map((p) => {
    const px = (xp(p.x) / 100) * W0, py = yp(p.y);
    const w = p.label.length * 6.6 + 8;
    const right = xp(p.x) < 70;
    const box = { x0: right ? px + r(p) + 2 : px - r(p) - 2 - w, x1: right ? px + r(p) + 2 + w : px - r(p) - 2, y0: py - 8, y1: py + 8 };
    if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) return null;
    placed.push(box);
    return { p, right };
  }).filter((x): x is { p: ScatterPoint; right: boolean } => x != null);

  return (
    <div className="st-scatter">
      <div className="st-line__frame st-scatter__frame" style={{ height }} role="img" aria-label={ariaLabel}>
        {yt.map((v) => <span key={`y${v}`} className="st-line__ytick" style={{ top: yp(v) }}>{format(v)}</span>)}
        <div className="st-line__plot">
          <svg className="st-line__svg" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
            {yt.map((v) => <line key={`g${v}`} x1={0} x2={100} y1={yp(v)} y2={yp(v)} className={v === 0 ? 'st-axis' : 'st-grid'} vectorEffect="non-scaling-stroke" />)}
            <line x1={xp(0)} x2={xp(0)} y1={PT} y2={PT + plotH} className="st-axis" vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map((p) => (
            <span key={p.id} className={`st-scatter__dot${p.focus ? ' is-focus' : ''}${p.labelled ? ' is-on' : ''}`} aria-hidden
              style={{ left: `${xp(p.x)}%`, top: yp(p.y), width: 2 * r(p), height: 2 * r(p) }} />
          ))}
          {labels.map(({ p, right }) => (
            <span key={`l${p.id}`} className={`st-scatter__label${right ? '' : ' is-left'}`}
              style={{ left: `${xp(p.x)}%`, top: yp(p.y), ['--r' as string]: `${r(p) + 3}px` }}>{p.label}</span>
          ))}
          {xt.map((v) => {
            const left = xp(v);
            return <span key={`x${v}`} className={`st-line__xtick st-line__xtick--${left < 4 ? 'start' : left > 96 ? 'end' : 'mid'}`} style={{ left: `${left}%`, top: PT + plotH + 6 }}>{format(v)}</span>;
          })}
        </div>
      </div>
      <p className="st-scatter__axes"><span>→ {xLabel}</span><span>↑ {yLabel}</span></p>
    </div>
  );
}
