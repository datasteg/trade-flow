// Search-engine furniture shared by every route: per-page canonical and hreflang
// built from the route path, OpenGraph and Twitter cards, the feed link, JSON-LD objects and the build date.
// Server only (buildDate reads the data folder); pageMeta is pure and used by every generateMetadata.
import type { Metadata } from 'next';
import { readData } from './data';
import { LOCALE, type Lang } from './i18n';

export const SITE_URL = 'https://trade-flow.datasteg.com';
export const SITE_NAME = 'trade-flow';
/** The publisher named in JSON-LD and OpenGraph: the service, never a person. */
export const PUBLISHER = 'datasteg';
export const PUBLISHER_URL = 'https://datasteg.com';

/** The RSS feed of the reader's language (app/feed/route.ts). */
export function feedPath(lang: Lang): string {
  return lang === 'ko' ? '/feed?lang=ko' : '/feed';
}

export interface PageMetaOptions {
  /** The path after the language segment, without a query: '' for the home page, '/chains/batteries' … */
  path: string;
  title: string;
  /** The title stands alone (no " — trade-flow" template). */
  absolute?: boolean;
  description: string;
  type?: 'website' | 'article';
  /** ISO dates for an article. */
  published?: string;
  modified?: string;
}

/** The metadata of one page: canonical without query, its own path in both languages (x-default the English page,
 *  never /, which redirects by cookie), the feed, OpenGraph and Twitter. Merged with the layout's site-wide fields. */
export function pageMeta(lang: Lang, o: PageMetaOptions): Metadata {
  const canonical = `/${lang}${o.path}`;
  const ogTitle = o.absolute ? o.title : `${o.title} — ${SITE_NAME}`;
  const other: Lang = lang === 'ko' ? 'en' : 'ko';
  return {
    title: o.absolute ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: {
      canonical,
      languages: { en: `/en${o.path}`, ko: `/ko${o.path}`, 'x-default': `/en${o.path}` },
      types: { 'application/rss+xml': feedPath(lang) },
    },
    openGraph: {
      title: ogTitle,
      description: o.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: LOCALE[lang].replace('-', '_'),
      alternateLocale: LOCALE[other].replace('-', '_'),
      type: o.type ?? 'website',
      ...(o.type === 'article'
        ? { publishedTime: o.published ?? o.modified, modifiedTime: o.modified, authors: [PUBLISHER_URL] }
        : {}),
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description: o.description },
  };
}

/** The day the data files were built (meta.json), as an ISO date; the image's build time when meta is not built. */
export async function buildDate(): Promise<string> {
  try {
    const m = await readData<{ built_at?: string }>('meta.json');
    if (m.built_at) return m.built_at.slice(0, 10);
  } catch { /* no data folder */ }
  try {
    const b = await readData<{ built_at?: string }>('build.json');
    if (b.built_at) return b.built_at.slice(0, 10);
  } catch { /* no build file */ }
  return (process.env.BUILD_TIME ?? new Date().toISOString()).slice(0, 10);
}

// JSON-LD (schema.org). The publisher is always datasteg.
const ORG = { '@type': 'Organization', name: PUBLISHER, url: PUBLISHER_URL };

export function webSiteLd(lang: Lang, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${SITE_URL}/${lang}`,
    inLanguage: LOCALE[lang],
    description,
    publisher: ORG,
  };
}

export function datasetLd(lang: Lang, o: {
  name: string; description: string; path: string; modified: string; keywords?: string[]; temporalCoverage?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: o.name,
    description: o.description,
    url: `${SITE_URL}/${lang}${o.path}`,
    inLanguage: LOCALE[lang],
    dateModified: o.modified,
    keywords: o.keywords,
    temporalCoverage: o.temporalCoverage,
    // The method page's licence section: derived records only, no bulk download.
    license: `${SITE_URL}/${lang}/method#licence`,
    isBasedOn: 'https://comtradeplus.un.org',
    creator: ORG,
    publisher: ORG,
    isAccessibleForFree: true,
  };
}

export function articleLd(lang: Lang, o: { headline: string; description: string; path: string; modified: string; published?: string; section?: string }) {
  const url = `${SITE_URL}/${lang}${o.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: o.headline,
    description: o.description,
    url,
    mainEntityOfPage: url,
    inLanguage: LOCALE[lang],
    datePublished: o.published ?? o.modified,
    dateModified: o.modified,
    articleSection: o.section,
    image: `${url}/opengraph-image`,
    author: ORG,
    publisher: ORG,
  };
}

/** A JSON-LD block. `<` is escaped so no data can close the script. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
