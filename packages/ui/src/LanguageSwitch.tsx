'use client';
import type { Lang } from './format';
import { ui } from './strings';
import { LANG_COOKIE } from './util';

const PREFIX = /^\/(en|ko)(?=\/|$)/;

/** The same page in language `to`: only the /en or /ko segment changes; the query and the hash (product, period,
 *  focus) are kept. Read at click time, so a hash written by the explorer after render is carried over. */
export function swapLanguage(to: Lang, loc: { pathname: string; search: string; hash: string }): string {
  const path = PREFIX.test(loc.pathname) ? loc.pathname.replace(PREFIX, `/${to}`) : `/${to}${loc.pathname === '/' ? '' : loc.pathname}`;
  return path + loc.search + loc.hash;
}

/** 한 / EN, two buttons with aria-pressed (Masthead). Remembers the choice in the datasteg-lang cookie, which the
 *  proxy reads for paths without a language. `navigate` lets a Next.js app switch without a reload (router.push with
 *  scroll: false keeps the scroll position); without it the browser loads the new URL. */
export function LanguageSwitch({ lang, navigate, cookie = LANG_COOKIE }: { lang: Lang; navigate?: (url: string) => void; cookie?: string }) {
  function go(to: Lang) {
    if (to === lang) return;
    try { document.cookie = `${cookie}=${to}; path=/; max-age=31536000; samesite=lax`; } catch { /* cookies blocked: the switch still works */ }
    const url = swapLanguage(to, window.location);
    if (navigate) navigate(url);
    else window.location.assign(url);
  }
  return (
    <div className="lr-lang" role="group" aria-label={ui(lang, 'lang.label')}>
      <button type="button" lang="ko" aria-label="한국어" aria-pressed={lang === 'ko'} onClick={() => go('ko')}>한</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={lang === 'en'} onClick={() => go('en')}>EN</button>
    </div>
  );
}
