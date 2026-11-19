/** Joins class names, skipping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** A Larch colour token as a CSS value: token("viz-1") -> "var(--viz-1)". Components take token names, never colours. */
export function token(name: string): string {
  return `var(--${name})`;
}

/** The localStorage key of the reader's theme and the cookie of their language, shared by every datasteg site. */
export const THEME_KEY = 'datasteg-theme';
export const LANG_COOKIE = 'datasteg-lang';

/** Runs in <head> before the first paint: ?theme=dark|light (for screenshots), else the saved choice, else the system
 *  setting. Sets <html data-theme>. Every storage access sits in try/catch (private windows, blocked storage). */
export const THEME_SCRIPT = `(function(){var t;try{t=new URLSearchParams(location.search).get('theme')}catch(e){}if(t!=='light'&&t!=='dark'){try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}}if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)})();`;
