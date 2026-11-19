import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import type { Lang } from './format';
import { ui } from './strings';
import { cx, token } from './util';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'canopy';

interface ButtonOwn {
  /** primary: the one action a view is for; secondary: downloads, Fit map, Show as table; quiet: Clear, Cancel;
   *  canopy: the one button on a canopy block. */
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** A Lucide icon (18px, set by larch.css), placed before the label. */
  icon?: ReactNode;
  children?: ReactNode;
}

/** A Larch button; with `href` it renders a link that looks the same. */
export function Button(p: ButtonOwn & ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> | { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)) {
  const { variant = 'secondary', size = 'md', icon, children, className, ...rest } = p;
  const cls = cx('lr-btn', `lr-btn--${variant}`, size === 'sm' && 'lr-btn--sm', className);
  if (rest.href !== undefined) {
    const { style, ...a } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return <a {...a} className={cls} style={{ textDecoration: 'none', ...style }}>{icon}{children}</a>;
  }
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type="button" {...b} className={cls}>{icon}{children}</button>;
}

/** A pill for a country group. `slot` (1–3) keys it to a map group colour (viz-1 … viz-3); `onRemove` adds the ×
 *  button (from a client component). */
export function Tag({ lang, children, slot, label, onRemove }: {
  lang: Lang;
  children: ReactNode;
  slot?: 1 | 2 | 3;
  /** The group's name for the remove button's label, when `children` is not plain text. */
  label?: string;
  onRemove?: MouseEventHandler<HTMLButtonElement>;
}) {
  const name = label ?? (typeof children === 'string' ? children : '');
  return (
    <span className="lr-tag">
      {slot ? <span className="lr-tag__key" style={{ background: token(`viz-${slot}`) }} aria-hidden /> : null}
      {children}
      {onRemove ? <button type="button" aria-label={ui(lang, 'tag.remove', { label: name })} onClick={onRemove}>×</button> : null}
    </span>
  );
}
