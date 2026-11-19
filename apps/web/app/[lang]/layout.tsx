import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
// Order matters: tokens, the Larch components, the site's own furniture, then the datasteg type (www's fonts,
// family/fonts.ts), which points Larch's font tokens at Newsreader, Libre Franklin and JetBrains Mono.
import '@larch/design/tokens.css';
import '@larch/design/larch.css';
import '@larch/ui/family.css';
import '../site.css';
import '@/lib/ds-fonts';
import { DatastegBar } from '@/components/DatastegBar';
import { Footer, THEME_SCRIPT } from '@larch/ui';
import { FamilyStripClient, type FamilyEvent } from '@/components/Family';
import { PageCount } from '@/components/PageCount';
import { SiteMasthead } from '@/components/SiteMasthead';
import { readData } from '@/lib/data';
import { isLang, LANGS, t, type Lang } from '@/lib/i18n';
import { JsonLd, SITE_URL, webSiteLd } from '@/lib/seo';

export const dynamicParams = false;
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** Site-wide metadata. Each page adds its own title, description, canonical and hreflang through lib/seo pageMeta. */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l: Lang = isLang(lang) ? lang : 'en';
  const google = process.env.GOOGLE_SITE_VERIFICATION;
  const naver = process.env.NAVER_SITE_VERIFICATION;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t(l, 'common.siteName'), template: `%s — ${t(l, 'common.siteName')}` },
    description: t(l, 'common.description'),
    applicationName: t(l, 'common.siteName'),
    // Open to search engines since the refurbish of 2 Nov 2026 (robots.ts allows everything but /data and /health).
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    ...(google || naver ? { verification: { ...(google ? { google } : {}), ...(naver ? { other: { 'naver-site-verification': naver } } : {}) } } : {}),
    openGraph: { locale: l === 'ko' ? 'ko_KR' : 'en_GB', siteName: t(l, 'common.siteName'), type: 'website' },
  };
}

/** The events with a shock replay on global-network (events/index.json `replay`, written by build_stories.py from
 *  global-network's surface), for the family strip's event links. */
async function familyEvents(): Promise<FamilyEvent[]> {
  try {
    const idx = await readData<{ events: { id: string; title: { en: string; ko: string }; replay?: boolean }[] }>('events/index.json');
    return idx.events.map((e) => ({ id: e.id, en: e.title.en, ko: e.title.ko, replay: e.replay === true }));
  } catch {
    return [];
  }
}

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const events = await familyEvents();
  return (
    // data-theme is set by THEME_SCRIPT before the first paint (saved choice, else the system setting).
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <JsonLd data={webSiteLd(lang, t(lang, 'common.description'))} />
      </head>
      <body className="lr">
        <a className="skip-link" href="#main">{t(lang, 'common.skip')}</a>
        <DatastegBar lang={lang} site="trade-flow" />
        <SiteMasthead lang={lang} events={events} />
        <main id="main" tabIndex={-1}>{children}</main>
        <FamilyStripClient lang={lang} events={events} />
        <Footer
          lang={lang}
          links={[
            { label: t(lang, 'common.footer.method'), href: `/${lang}/method` },
            { label: t(lang, 'common.footer.articles'), href: `https://articles.datasteg.com/${lang}` },
          ]}
          source={t(lang, 'common.footer.source')}
          note={`trade-flow.datasteg.com · ${process.env.APP_VERSION}`}
        />
        <PageCount />
      </body>
    </html>
  );
}
