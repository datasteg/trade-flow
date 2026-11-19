'use client';
// The home page's network block, painted: the world trade network of the last complete year as an Impressionist
// picture, after Monet's water lilies. Each economy is a cluster of paint dabs (size: exports plus imports; colour:
// region), each of the largest flows a soft brushstroke, and the clusters sit where their trade ties pull them, not
// where they are on a map. It paints itself in on load, then shimmers; glints of light run along the strokes from
// exporter to importer. Hover (or tap) a cluster for its name and trade; idle, a notable flow is lit with a caption.
// The knobs are in tune.ts, the data in data.ts (server), the drawing in engine.ts.
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { PaintingData } from './data';
import { GROUPS, Painting, type PaintLabel } from './engine';

export function HeroNetworkPainting({ data, label }: { data: PaintingData; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ground = useRef<HTMLCanvasElement>(null);
  const layers = useRef<(HTMLCanvasElement | null)[]>([]);
  const engine = useRef<Painting | null>(null);
  const tap = useRef<{ type: string; before: number | null }>({ type: 'mouse', before: null });
  // the last label and caption stay rendered while they fade out
  const [tip, setTip] = useState<{ l: PaintLabel | null; on: boolean }>({ l: null, on: false });
  const [cap, setCap] = useState<{ text: string; on: boolean }>({ text: '', on: false });

  useEffect(() => {
    const el = box.current, cv = canvas.current, gr = ground.current, ls = layers.current.filter((x): x is HTMLCanvasElement => !!x);
    if (!el || !cv || !gr || ls.length !== GROUPS) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const p = new Painting({ ground: gr, layers: ls, live: cv }, data, {
      reduced: reduced.matches,
      onLabel: (l) => setTip((prev) => (l ? { l, on: true } : { ...prev, on: false })),
      onCaption: (text) => setCap((prev) => (text ? { text, on: true } : { ...prev, on: false })),
    });
    engine.current = p;
    const size = () => p.resize(el.clientWidth, el.clientHeight);
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => p.setVisible(e.isIntersecting));
    io.observe(el);
    const page = () => p.setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', page);
    // the theme: the toggle flips <html data-theme>; the system setting applies when there is no choice
    const retheme = () => p.theme();
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', retheme);
    return () => {
      ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', page);
      scheme.removeEventListener('change', retheme);
      p.destroy();
      engine.current = null;
    };
  }, [data]);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') engine.current?.pointer(...at(e));
  };
  const onDown = (e: PointerEvent) => {
    tap.current = { type: e.pointerType, before: engine.current?.focused ?? null };
    if (e.pointerType !== 'mouse') engine.current?.pointer(...at(e));
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') engine.current?.leave();
  };
  // The block is a link to the explorer. A tap on a cluster shows its label first; a second tap (or a tap elsewhere)
  // follows the link.
  const onClick = (e: MouseEvent) => {
    const p = engine.current;
    if (!p || tap.current.type === 'mouse') return;
    const h = p.hit(...at(e));
    if (h != null && h !== tap.current.before) e.preventDefault();
  };

  return (
    <div ref={box} className="hp" onPointerMove={onMove} onPointerDown={onDown} onPointerLeave={onLeave} onClick={onClick}>
      <canvas ref={ground} className="hp-ground" aria-hidden />
      {Array.from({ length: GROUPS }, (_, k) => <canvas key={k} ref={(c) => { layers.current[k] = c; }} className="hp-layer" aria-hidden />)}
      <canvas ref={canvas} className="hp-canvas" role="img" aria-label={label} />
      <span className={tip.on ? 'hp-tip is-on' : 'hp-tip'} style={tip.l ? tipPlace(tip.l, box.current) : undefined}>
        {tip.l ? <><b>{tip.l.name}</b><span>{tip.l.trade}</span></> : null}
      </span>
      <span className={cap.on ? 'hp-cap is-on' : 'hp-cap'}>{cap.text}</span>
    </div>
  );
}

/** The label above its cluster (below it near the top edge), kept inside the block. */
function tipPlace(l: PaintLabel, el: HTMLDivElement | null) {
  const w = el?.clientWidth ?? 0;
  const below = l.y - l.r * 0.8 < 56;
  return {
    left: w ? Math.max(84, Math.min(w - 84, l.x)) : l.x,
    top: below ? l.y + l.r * 0.8 + 6 : l.y - l.r * 0.8 - 6,
    transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  };
}
