// Horizontal bars in HTML (server-rendered, any width): "compare economies" bars in one colour (viz-1, sorted), or
// diverging bars around zero for changes (div-pos-2 grew, div-neg-2 fell). A focus row carries the trail marker.
import type { ReactNode } from 'react';

export interface Bar {
  id: string;
  label: ReactNode;
  value: number | null;
  /** The value as printed beside the bar. */
  text: string;
  focus?: boolean;
  /** Muted (e.g. a group total, or a row that did not file). */
  muted?: boolean;
  /** A second, lighter value under the bar (e.g. the base period), same scale. */
  ghost?: number | null;
}

export function BarList({ bars, diverging, max, ariaLabel, colour = 'viz-1' }: {
  bars: Bar[];
  diverging?: boolean;
  /** The value of a full-width bar (default: the largest |value|). */
  max?: number;
  ariaLabel: string;
  colour?: string;
}) {
  const m = max ?? Math.max(1e-12, ...bars.map((b) => Math.abs(b.value ?? 0)), ...bars.map((b) => Math.abs(b.ghost ?? 0)));
  return (
    <ul className={`st-bars${diverging ? ' st-bars--div' : ''}`} role="img" aria-label={ariaLabel}>
      {bars.map((b) => {
        const v = b.value ?? 0;
        const w = Math.min(100, (Math.abs(v) / m) * 100);
        const bg = diverging ? (v < 0 ? 'var(--div-neg-2)' : 'var(--div-pos-2)') : `var(--${colour})`;
        return (
          <li key={b.id} className={`${b.focus ? 'is-focus' : ''}${b.muted ? ' is-muted' : ''}`}>
            <span className="st-bars__label">{b.focus ? <span className="lr-marker lr-marker--sm" aria-hidden /> : null}{b.label}</span>
            <span className="st-bars__track">
              {diverging ? <span className="st-bars__zero" /> : null}
              {!diverging && b.ghost != null ? (
                <span className="st-bars__ghost" style={{ width: `${Math.min(100, (Math.abs(b.ghost) / m) * 100)}%` }} />
              ) : null}
              {b.value != null ? (
                <span className={`st-bars__bar${diverging && v < 0 ? ' is-neg' : ''}`}
                  style={diverging ? { width: `${w / 2}%`, background: bg } : { width: `${w}%`, background: bg }} />
              ) : null}
            </span>
            <span className="st-bars__value">{b.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
