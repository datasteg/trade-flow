import type { ReactNode } from 'react';
import { Info, TriangleAlert, X } from 'lucide-react';
import type { Lang } from './format';
import { Marker } from './marker';
import { ui } from './strings';
import { cx } from './util';

/** The small uppercase line above a title or panel ("Chain · Batteries and electric cars"); as written in Korean. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('lr-kicker', className)}>{children}</p>;
}

/** The divider between major parts of a page: a hairline broken by one trail marker. At most two per page. */
export function TrailRule() {
  return <div className="lr-trailrule" role="separator"><Marker /></div>;
}

/** The editor's reading, kept apart from the data: "Our reading" / "편집자 해석" and one to three sentences. */
export function Insight({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <aside className="lr-insight" lang={lang}>
      <p className="lr-insight__label">{ui(lang, 'insight.label')}</p>
      <p className="lr-insight__text">{children}</p>
    </aside>
  );
}

export type NoticeTone = 'info' | 'warning' | 'serious';

/** What trade cannot see, said where it matters. info: context (ownership); warning: data limits (partial years,
 *  code splits); serious: large mirror gaps, unit values out of range. With `onClose` it gets a close button, for
 *  notices that float over a chart. */
export function Notice({ tone = 'info', title, children, onClose, closeLabel = 'Close' }: {
  tone?: NoticeTone; title: ReactNode; children?: ReactNode; onClose?: () => void; closeLabel?: string;
}) {
  const Icon = tone === 'info' ? Info : TriangleAlert;
  return (
    <div className={cx('lr-notice', `lr-notice--${tone}`, onClose && 'lr-notice--closable')} role="note">
      <Icon size={20} strokeWidth={1.5} aria-hidden />
      <p className="lr-notice__title" style={{ gridColumn: 2 }}>{title}</p>
      {onClose ? (
        <button type="button" className="lr-iconbtn lr-notice__close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export interface TrailHeadCount { value: ReactNode; label: ReactNode }

/** The canopy band that opens a chain page or the chain index: kicker, the title that states the finding (h1), a
 *  one-sentence dek and three or four counts. One per page, never in the explorer. */
export function TrailHead({ kicker, title, dek, counts = [], children }: {
  kicker?: ReactNode;
  title: ReactNode;
  dek?: ReactNode;
  counts?: TrailHeadCount[];
  children?: ReactNode;
}) {
  return (
    <header className="lr-trailhead">
      <svg className="lr-trailhead__art" viewBox="0 0 360 400" preserveAspectRatio="xMaxYMid slice" aria-hidden>
        <path d="M360,40 A320,320 0 0 0 40,360" /><path d="M360,88 A272,272 0 0 0 88,360" />
        <path d="M360,136 A224,224 0 0 0 136,360" /><path d="M360,184 A176,176 0 0 0 184,360" />
        <path d="M360,232 A128,128 0 0 0 232,360" />
      </svg>
      {kicker ? <p className="lr-kicker">{kicker}</p> : null}
      <h1 className="lr-trailhead__title">{title}</h1>
      {dek ? <p className="lr-trailhead__dek">{dek}</p> : null}
      {counts.length ? (
        <ul className="lr-trailhead__counts">
          {counts.map((c, i) => <li key={i}><b>{c.value}</b>{c.label}</li>)}
        </ul>
      ) : null}
      {children}
    </header>
  );
}
