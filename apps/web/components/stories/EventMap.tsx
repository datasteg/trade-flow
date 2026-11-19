'use client';
// The event's network before and after: the default view opens on the period after the event in
// change colouring against the base, with the economies the event names outlined. "Before" shows the base period
// itself; "Play the event" steps through the months (or years) from the base to the current period.
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { lensWindow, NetworkMap, stepWindow } from '@larch/net';
import { t, type Lang } from '@/lib/i18n';
import { periodLabel } from './names';
import type { Freq, Lens } from './types';

/** The next period: a year, or the next end month of the lens's window (the windows' grid: no window ends in
 *  January, nor in April for 3 months). */
function addPeriod(p: number, f: Freq, lens: Lens | null): number {
  return f === 'A' ? p + 1 : stepWindow(p, lensWindow(lens));
}

export function EventMap({ lang, product, freq, base, t: now, lens, outline, height = 'clamp(280px, 58vw, 540px)' }: {
  lang: Lang;
  product: string;
  freq: Freq;
  base: number;
  t: number;
  lens: Lens | null;
  outline: string[];
  height?: number | string;
}) {
  const [mode, setMode] = useState<'after' | 'before' | 'play'>('after');
  const [period, setPeriod] = useState(now);
  const timer = useRef<number | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }
  function show(m: 'after' | 'before') {
    stop();
    setMode(m);
    setPeriod(m === 'after' ? now : base);
  }
  function play() {
    if (mode === 'play') { stop(); setMode('after'); setPeriod(now); return; }
    stop();
    setMode('play');
    let p = addPeriod(base, freq, lens);
    setPeriod(p);
    timer.current = window.setInterval(() => {
      if (p >= now) { stop(); setMode('after'); return; }
      p = addPeriod(p, freq, lens);
      setPeriod(p);
    }, freq === 'A' ? 1100 : reduced ? 900 : 550);
  }

  const showingBase = mode === 'before';
  return (
    <div className="st-map">
      <div className="st-map__bar">
        <div className="lr-seg" role="group" aria-label={t(lang, 'events.map.view')}>
          <button type="button" aria-pressed={mode === 'before'} onClick={() => show('before')}>{t(lang, 'events.map.before', { p: periodLabel(base, lang) })}</button>
          <button type="button" aria-pressed={mode === 'after'} onClick={() => show('after')}>{t(lang, 'events.map.after', { p: periodLabel(now, lang) })}</button>
        </div>
        <button type="button" className="lr-btn lr-btn--primary lr-btn--sm" onClick={play} aria-pressed={mode === 'play'}>
          {mode === 'play' ? <Pause aria-hidden strokeWidth={1.5} /> : <Play aria-hidden strokeWidth={1.5} />}
          {mode === 'play' ? t(lang, 'events.map.stop') : t(lang, 'events.map.play')}
        </button>
        <span className="st-map__period" aria-live="polite">
          {showingBase ? t(lang, 'events.map.showingBase', { p: periodLabel(base, lang) })
            : t(lang, 'events.map.showing', { p: periodLabel(period, lang), base: periodLabel(base, lang) })}
        </span>
      </div>
      <NetworkMap lang={lang} product={product} freq={freq} period={period} lens={lens ?? undefined}
        base={base} colorBy="change" outline={outline} height={height} />
    </div>
  );
}
