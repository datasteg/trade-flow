'use client';
// "↔ two-way" beside an economy in a stage's top-five tables: the economy both imports and exports the stage
// (Grubel–Lloyd index ≥ 0.3, each side ≥ 2% of world trade). Hover, focus or tap shows its exports, imports, net,
// the index and the unit value of each side. Facts only; the reasons are in the page's explainer.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatUSD, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import { fmtUV } from './model';
import type { TwoWayRow } from './types';

export function TwoWayBadge({ lang, row, world, name }: { lang: Lang; row: TwoWayRow; world: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  // fixed to the viewport, so the table's scrolling wrapper does not clip it; placed below the badge, or above it
  // near the bottom of the window, and closed when the page scrolls
  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const below = r.bottom + 220 < window.innerHeight;
    setAt({ position: 'fixed', left: Math.max(8, Math.min(r.left, window.innerWidth - 296)), ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true, once: true });
    return () => window.removeEventListener('scroll', close);
  }, [open]);
  const x = row.x * world, m = row.m * world, net = x - m;
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  return (
    <span className="ch-tw" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button ref={btn} type="button" className="ch-tw__badge" aria-describedby={id} aria-expanded={open}
        aria-label={`${t(lang, 'chains.tw.badge')}: ${t(lang, 'chains.tw.badgeLabel', { name })}`}
        onClick={() => setOpen(!open)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
        {t(lang, 'chains.tw.badge')}
      </button>
      <span id={id} role="tooltip" className="lr-tip ch-tw__tip" hidden={!open} style={at}>
        <span className="lr-tip__title">{name}</span>
        <dl>
          <dt>{t(lang, 'chains.tw.tip.x')}</dt><dd>{formatUSD(x, lang)}</dd>
          <dt>{t(lang, 'chains.tw.tip.m')}</dt><dd>{formatUSD(m, lang)}</dd>
          <dt>{t(lang, 'chains.tw.tip.net')}</dt><dd>{sign}{formatUSD(Math.abs(net), lang)}</dd>
          <dt>{t(lang, 'chains.tw.tip.gl')}</dt><dd>{row.gl.toFixed(2)}</dd>
          {row.ux != null || row.um != null ? <><dt>{t(lang, 'chains.tw.tip.uv')}</dt><dd>{fmtUV(row.um, lang)} / {fmtUV(row.ux, lang)}</dd></> : null}
        </dl>
      </span>
    </span>
  );
}
