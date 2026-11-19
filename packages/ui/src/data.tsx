import type { ReactNode } from 'react';
import { formatHS, formatShare, type Lang } from './format';
import { ui } from './strings';
import { cx, token } from './util';

/* StatTile ------------------------------------------------------------------------------------------------------- */

/** The grid StatTiles sit in (no borders, no fills). */
export function StatTiles({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cx('lr-stats', className)}>{children}</ul>;
}

export interface DeltaProps {
  /** Formatted with its sign: "−3.7%", "+12 pp". */
  text: ReactNode;
  dir: 'up' | 'down' | 'flat';
  /** Is it good for the reader? Trade values are usually neutral. */
  tone?: 'good' | 'bad' | 'neutral';
}

/** ▲ / ▼ and the change, in the tone's colour. The arrow is decorative: the signed figure says the direction. */
export function Delta({ text, dir, tone = 'neutral' }: DeltaProps) {
  const arrow = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : null;
  return (
    <span className={`lr-delta lr-delta--${tone}`}>
      {arrow ? <span aria-hidden>{arrow}</span> : null}
      {text}
    </span>
  );
}

/** A small line of the last 10–24 periods (viz-focus) with an end dot. Decorative: the tile states the number. */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null && Number.isFinite(p[1]));
  if (pts.length < 2) return null;
  const W = 120, H = 28, pad = 3;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * W : 0);
  const y = (v: number) => (hi === lo ? H / 2 : pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad));
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg className="lr-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} />
      <circle cx={x(li)} cy={y(lv)} r={3} />
    </svg>
  );
}

/** One number now, with what it is compared to: label ("World trade, 2024"), the formatted value, an optional Delta,
 *  context line and Sparkline. `hero` for the one number a view leads with (at most one per view). */
export function StatTile({ label, value, hero, delta, meta, spark }: {
  label: ReactNode;
  value: ReactNode;
  hero?: boolean;
  delta?: DeltaProps;
  meta?: ReactNode;
  spark?: (number | null)[];
}) {
  return (
    <li className="lr-stat">
      <span className="lr-stat__label">{label}</span>
      <span className={cx('lr-stat__value', hero && 'lr-stat__value--hero')}>{value}</span>
      {spark ? <Sparkline values={spark} /> : null}
      {delta || meta ? (
        <span className="lr-stat__meta">
          {delta ? <Delta {...delta} /> : null}
          {delta && meta ? ' ' : null}
          {meta}
        </span>
      ) : null}
    </li>
  );
}

/* HSCode --------------------------------------------------------------------------------------------------------- */

/** A Harmonized System code chip: "8507.60", "2846", "85". `title` is the product description (tooltip); `chapter`
 *  shows the chapter in ink-muted before a heading or subheading; `version` tags an HS edition ("H6"); `residual`
 *  marks "n.e.c." and "other" codes. Never write a code without its product name nearby. */
export function HSCode({ lang, code, title, chapter, version, residual }: {
  lang: Lang;
  code: string | number;
  title?: string;
  chapter?: boolean;
  version?: string;
  residual?: boolean;
}) {
  const text = formatHS(code);
  const tip = residual ? (title ? `${title}. ${ui(lang, 'hs.residual')}` : ui(lang, 'hs.residual')) : title;
  return (
    <span className={cx('lr-hs', residual && 'lr-hs--residual')} title={tip}>
      {chapter && text.length > 2 ? <span className="lr-hs__ch">{text.slice(0, 2)}</span> : null}
      {text}
      {version ? <> <span className="lr-hs__ver">{version}</span></> : null}
    </span>
  );
}

/* ShareBar ------------------------------------------------------------------------------------------------------- */

export interface Share { label: string; share: number }

/** How a stage's exports split among its top five exporters: one bar, slots viz-1 … viz-5 by position, Others in
 *  viz-context; keys below repeat ISO3 and share. `compact` is the 8px bar without keys used inside a waypoint. */
export function ShareBar({ lang, title, shares, others, compact }: {
  lang: Lang;
  title?: ReactNode;
  /** Largest first, at most five; shares are fractions of world exports. */
  shares: Share[];
  /** The rest (default: 1 minus the listed shares). */
  others?: number;
  compact?: boolean;
}) {
  const top = shares.slice(0, 5);
  const rest = Math.max(0, others ?? 1 - top.reduce((s, x) => s + x.share, 0));
  const segs = [
    ...top.map((s, i) => ({ label: s.label, share: s.share, colour: token(`viz-${i + 1}`) })),
    ...(rest > 0.0005 ? [{ label: ui(lang, 'share.others'), share: rest, colour: token('viz-context') }] : []),
  ];
  const aria = segs.map((s) => `${s.label} ${formatShare(s.share, lang)}`).join(', ');
  return (
    <div className="lr-sharebar">
      {title ? <p className="lr-label">{title}</p> : null}
      <div className="lr-sharebar__bar" role="img" aria-label={aria} style={compact ? { height: 8 } : undefined}>
        {segs.map((s) => <span key={s.label} className="lr-sharebar__seg" style={{ width: `${(s.share * 100).toFixed(2)}%`, background: s.colour }} />)}
      </div>
      {compact ? null : (
        <ul className="lr-sharebar__keys">
          {segs.map((s) => <li key={s.label}><i style={{ background: s.colour }} />{s.label} <b>{formatShare(s.share, lang)}</b></li>)}
        </ul>
      )}
    </div>
  );
}

/* Legend primitives ---------------------------------------------------------------------------------------------- */

/** The map key's frame; compose it from LegendTitle, LegendRow / LegendItem, LegendRamp and LegendNote. */
export function Legend({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('lr-legend', className)}>{children}</div>;
}

export function LegendTitle({ children }: { children: ReactNode }) {
  return <p className="lr-legend__title">{children}</p>;
}

export function LegendRow({ children }: { children: ReactNode }) {
  return <div className="lr-legend__row">{children}</div>;
}

/** One key: a dot (nodes, groups) or a line (flows) in a Larch colour token ("viz-1", "flow-out", "edge"). */
export function LegendItem({ swatch = 'dot', colour, lineWidth, children }: {
  swatch?: 'dot' | 'line';
  /** A colour token name, e.g. "viz-2". */
  colour: string;
  /** Line keys only: the flow width in px. */
  lineWidth?: number;
  children: ReactNode;
}) {
  const style = { background: token(colour), ...(swatch === 'line' && lineWidth ? { height: lineWidth } : {}) };
  return (
    <span className="lr-legend__item">
      <span className={swatch === 'line' ? 'lr-legend__line' : 'lr-legend__dot'} style={style} aria-hidden />
      {children}
    </span>
  );
}

/** A stepped ramp (div-*, seq-*, stage-*) with labels under it, e.g. "−50%", "±10%", "+100%". */
export function LegendRamp({ colours, labels }: { colours: string[]; labels: ReactNode[] }) {
  return (
    <div>
      <div className="lr-legend__ramp" aria-hidden>
        {colours.map((c) => <span key={c} style={{ background: token(c) }} />)}
      </div>
      <div className="lr-legend__ramp-labels" style={{ width: colours.length * 24 - 2 }}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

export function LegendNote({ children }: { children: ReactNode }) {
  return <p className="lr-legend__note">{children}</p>;
}
