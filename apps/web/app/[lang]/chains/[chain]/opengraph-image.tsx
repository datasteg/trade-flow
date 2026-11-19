import { EDITORIAL, titleWithYear } from '@/components/chains/editorial';
import type { ChainIndexFile } from '@/components/chains/types';
import { readData } from '@/lib/data';
import { isLang, LANGS, t, type Lang } from '@/lib/i18n';
import { ogImage, OG_SIZE, OG_TYPE } from '@/lib/og';

// One card per chain and language: the chain's name as the kicker, the editor's finding with the year it was
// checked against, the source line as the foot. Static for the chains in chains/index.json.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = 'trade-flow chain';

export async function generateStaticParams() {
  const index = await readData<ChainIndexFile>('chains/index.json');
  return LANGS.flatMap((lang) => index.chains.map((c) => ({ lang, chain: c.id })));
}

export default async function Image({ params }: { params: Promise<{ lang: string; chain: string }> }) {
  const { lang: raw, chain: id } = await params;
  const lang: Lang = isLang(raw) ? raw : 'en';
  const index = await readData<ChainIndexFile>('chains/index.json');
  const c = index.chains.find((x) => x.id === id);
  const ed = EDITORIAL[id];
  return ogImage({
    lang,
    kicker: `${t(lang, 'chains.kicker')} · ${c ? (lang === 'ko' ? c.ko : c.en) : id}`,
    title: ed ? titleWithYear(ed, lang) : (c ? (lang === 'ko' ? c.ko : c.en) : id),
    foot: t(lang, 'chains.source'),
  });
}
