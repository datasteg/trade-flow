'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HOST = 'trade-flow.datasteg.com';
const ENDPOINT = 'https://stats.datasteg.com/count';

/** Counts a page view in GoatCounter (the existing stats.datasteg.com site, paths prefixed /tf/) on every pathname
 *  change, not on hash changes (the explorer writes its state there). One image request, no cookies, no script from
 *  another origin. Only on the live host, so dev servers and previews never count. The referrer goes with the first
 *  view only: after an in-app navigation document.referrer still names the page the reader arrived from. */
export function PageCount() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (!pathname || window.location.hostname !== HOST) return;
    const referrer = first.current ? document.referrer : '';
    first.current = false;
    // After the commit, so a client navigation's new <title> is in place.
    const timer = window.setTimeout(() => {
      const q = new URLSearchParams({
        p: `/tf${pathname}`,
        t: document.title,
        r: referrer,
        s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
        b: navigator.webdriver ? '1' : '0',
        rnd: Math.random().toString(36).slice(2, 7),
      });
      new Image().src = `${ENDPOINT}?${q.toString()}`;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
