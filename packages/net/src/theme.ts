// Tokens read at run time (design book 07-Implementation, "Theming in D3"), and a hook for theme changes. SVG marks
// take var(--token) and follow the theme by themselves; the canvas flow layer and the numeric tokens (opacities)
// are read here and redrawn when the theme changes.

export function tokenValue(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(`--${name}`).trim();
}

export interface Larch {
  [token: string]: string;
}

/** The colour of a token now, e.g. larchColour("viz-1") (for canvas only; SVG uses var(--viz-1)). */
export function larchColour(name: string): string {
  return tokenValue(name) || 'currentColor';
}

/** Numeric tokens the views need. */
export function larchNumbers(): { edgeOpacity: number; edgeDim: number; refetch: number } {
  const n = (k: string, d: number) => {
    const v = parseFloat(tokenValue(k));
    return Number.isFinite(v) ? v : d;
  };
  return { edgeOpacity: n('opacity-edge', 0.55), edgeDim: n('opacity-edge-dim', 0.12), refetch: n('opacity-refetch', 0.5) };
}

/** Calls `cb` when <html data-theme> or the system colour scheme changes. Returns the unsubscribe function. */
export function onThemeChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener('change', cb);
  return () => {
    mo.disconnect();
    mq?.removeEventListener('change', cb);
  };
}

/** var(--token) for a token name. */
export const v = (token: string): string => `var(--${token})`;
