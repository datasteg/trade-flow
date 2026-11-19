import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Info } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import type { Status } from './data';

const ICON = { pass: CircleCheck, watch: CircleAlert, fail: CircleX, info: Info, 'not run': CircleDashed } as const;
const CLASS: Record<Status, string> = { pass: 'pass', watch: 'watch', fail: 'fail', info: 'info', 'not run': 'notrun' };

/** A check's status as an icon and a word ("Pass" / "통과"), in the status colour; the word always carries it. */
export function StatusWord({ lang, status, children }: { lang: Lang; status: Status; children?: ReactNode }) {
  const Icon = ICON[status] ?? CircleDashed;
  return (
    <span className={`ck-status ck-status--${CLASS[status] ?? 'notrun'}`}>
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      <span className="ck-status__word">{t(lang, `method.status.${status}`)}</span>
      {children ? <span className="ck-status__note">{children}</span> : null}
    </span>
  );
}

/** Just the icon, for column headers that name the status in words beside it. */
export function StatusIcon({ status }: { status: Status }) {
  const Icon = ICON[status] ?? CircleDashed;
  return <span className={`ck-status ck-status--${CLASS[status] ?? 'notrun'}`}><Icon size={16} strokeWidth={1.75} aria-hidden /></span>;
}
