// GET /feed[?lang=ko]: RSS 2.0 with one item per event and per case, dated by the data build date, newest events
// first. Linked from every page with
// <link rel="alternate" type="application/rss+xml">.
import type { NextRequest } from 'next/server';
import { readData } from '@/lib/data';
import { LOCALE, isLang, t, type Lang } from '@/lib/i18n';
import { buildDate, SITE_NAME, SITE_URL } from '@/lib/seo';

export const dynamic = 'force-dynamic';

interface Bi { en: string; ko: string }
interface EventsIndex { events: { id: string; start: string; title: Bi; dek: Bi }[] }
interface CasesIndex { cases: { id: string; num: number; title: Bi; question: Bi }[] }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('lang');
  const lang: Lang = isLang(q) ? q : 'en';
  const [events, cases, built] = await Promise.all([
    readData<EventsIndex>('events/index.json').catch(() => ({ events: [] }) as EventsIndex),
    readData<CasesIndex>('cases/index.json').catch(() => ({ cases: [] }) as CasesIndex),
    buildDate(),
  ]);
  const pubDate = new Date(`${built}T00:00:00Z`).toUTCString();
  const items = [
    ...[...events.events].sort((a, b) => b.start.localeCompare(a.start)).map((e) => ({
      title: e.title[lang], link: `${SITE_URL}/${lang}/events/${e.id}`, description: e.dek[lang],
      category: t(lang, 'common.nav.events'),
    })),
    ...[...cases.cases].sort((a, b) => b.num - a.num).map((c) => ({
      title: c.title[lang], link: `${SITE_URL}/${lang}/cases/${c.id}`, description: c.question[lang],
      category: t(lang, 'common.nav.cases'),
    })),
  ];
  const self = `${SITE_URL}/feed${lang === 'ko' ? '?lang=ko' : ''}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE_NAME)}</title>
<link>${SITE_URL}/${lang}</link>
<atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
<description>${esc(t(lang, 'common.description'))}</description>
<language>${LOCALE[lang].toLowerCase()}</language>
<lastBuildDate>${pubDate}</lastBuildDate>
<generator>trade-flow</generator>
${items.map((it) => `<item>
<title>${esc(it.title)}</title>
<link>${esc(it.link)}</link>
<guid isPermaLink="true">${esc(it.link)}</guid>
<category>${esc(it.category)}</category>
<pubDate>${pubDate}</pubDate>
<description>${esc(it.description)}</description>
</item>`).join('\n')}
</channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
