import type { Meta } from '@larch/net/core';
import { readData } from '@/lib/data';
import { formatPeriod, isLang, LANGS, t, type Lang } from '@/lib/i18n';
import { ogImage, OG_SIZE, OG_TYPE } from '@/lib/og';

// The site's card (home and every page without one of its own): the finding of the home page and the latest
// complete year. Static, one per language.
export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = 'trade-flow: the world trade network, product by product';

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang: Lang = isLang(raw) ? raw : 'en';
  const year = await readData<Meta>('meta.json').then((m) => m.complete.A).catch(() => null);
  return ogImage({
    lang,
    kicker: t(lang, 'home.hero.kicker'),
    title: t(lang, 'home.meta.title'),
    foot: year ? t(lang, 'home.hero.title', { year: formatPeriod(year, lang) }) : t(lang, 'common.description'),
  });
}
