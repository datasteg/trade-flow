import { NextResponse, type NextRequest } from 'next/server';

const LANGS = ['en', 'ko'];
const COOKIE = 'datasteg-lang';

/** Korean if the browser lists Korean at all, whatever its rank ("en-US,en;q=0.9,ko;q=0.8" -> ko); otherwise English. */
function fromAcceptLanguage(header: string): string {
  const listed = header.split(',').map((part) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
    return { lang: tag.split('-')[0], q: Number.isFinite(q) ? q : 0 };
  }).filter((x) => x.q > 0).map((x) => x.lang);
  return listed.includes('ko') ? 'ko' : 'en';
}

/** Every page lives under /en/ or /ko/. A path without one is redirected: the reader's saved
 *  choice (cookie) first, then Korean for a browser that lists Korean, then English. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split('/')[1];
  if (LANGS.includes(first)) {
    // HTML pages (not /data, not /health): five minutes fresh at any cache, a day stale while it refreshes; the
    // data change at most weekly, with the image.
    const res = NextResponse.next();
    res.headers.set('cache-control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res;
  }
  const saved = req.cookies.get(COOKIE)?.value;
  const accept = req.headers.get('accept-language') ?? '';
  const lang = saved && LANGS.includes(saved) ? saved : fromAcceptLanguage(accept);
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Not for the health check, the feed, the data files (/data/…), the internal views (/svc/…, api/docs/SVC-CONTRACT.md),
  // Next's own files, or files with an extension (robots.txt, sitemap.xml, world-110m.json, icons).
  matcher: ['/((?!health|feed|data/|svc/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
