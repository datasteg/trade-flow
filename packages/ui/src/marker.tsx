import { cx } from './util';

/** The trail marker: a 45° larch square with a spruce edge (the focus economy's mark in tables, the wordmark, TrailRule). */
export function Marker({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return <span className={cx('lr-marker', size === 'sm' && 'lr-marker--sm')} aria-hidden />;
}
