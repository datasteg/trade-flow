import type { ReactNode } from 'react';
import type { Lang } from './format';
import { stageLabel, ui } from './strings';

export interface SignpostDestination {
  /** The product at that stage ("Cathode material"). */
  name: ReactNode;
  /** Where a trail sign gives the walking time: "$14.2/kg · KOR 56%", or the number of exporters. */
  meta?: ReactNode;
  href: string;
}

/** Where the chain goes next, after the yellow signs on Swiss walking trails: "Downstream" points right, "Upstream"
 *  left; one to four destinations, each a link. Never one that goes nowhere; at most two per screen. */
export function Signpost({ lang, direction, stage, destinations, className }: {
  lang: Lang;
  direction: 'up' | 'down';
  /** The stage number(s) the sign points to: 3 -> "S3" / "3단계". */
  stage?: number | number[];
  destinations: SignpostDestination[];
  className?: string;
}) {
  if (!destinations.length) return null;
  const stages = stage == null ? [] : Array.isArray(stage) ? stage : [stage];
  const dir = [ui(lang, direction === 'up' ? 'sign.up' : 'sign.down'), ...(stages.length ? [stages.map((n) => stageLabel(lang, n)).join(', ')] : [])].join(' · ');
  return (
    <div className={['lr-sign', direction === 'up' ? 'lr-sign--up' : '', className ?? ''].filter(Boolean).join(' ')}>
      <p className="lr-sign__dir">{dir}</p>
      {destinations.map((d) => (
        <a key={d.href} className="lr-sign__row" href={d.href}>
          <span className="lr-sign__dest">{d.name}</span>
          {d.meta ? <span className="lr-sign__meta">{d.meta}</span> : null}
        </a>
      ))}
    </div>
  );
}
