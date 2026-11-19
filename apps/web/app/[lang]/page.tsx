import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import type { Meta } from '@larch/net/core';
import { ChainBlocks } from '@/components/home/ChainBlocks';
import { chainBlocks, readSnap } from '@/components/home/data';
import { HeroNetworkPainting } from '@/components/home/painting/HeroNetworkPainting';
import { paintingData } from '@/components/home/painting/data';
import { readData } from '@/lib/data';
import { formatNumber, formatUSD, t, type Lang } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import './home.css';

// The home page shows two things. The world trade network of the last complete year is one block that opens the
// explorer: the network painted, after Monet's water lilies (components/home/painting): economies as clusters of
// dabs, the largest flows as brushstrokes, placed by trade ties rather than geography, with a canopy plate for the
// title, three counts and the one button. The ten chains are blocks that open their pages. No banner and no
// narration: the explorer and the chain pages carry the words. Static: the data files are read at build time.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  return pageMeta(lang, { path: '', absolute: true, title: `${t(lang, 'home.meta.title')} — ${t(lang, 'common.siteName')}`, description: t(lang, 'home.dek') });
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const lang: Lang = await langOf(params);
  const meta = await readData<Meta>('meta.json');
  const year = meta.complete.A;
  const [snap, blocks, painting] = await Promise.all([readSnap(year), chainBlocks(lang), paintingData(meta, lang)]);
  const facts = t(lang, 'home.hero.facts', {
    world: formatUSD(snap.world, lang), n: formatNumber(snap.tot.nodes, lang), flows: formatNumber(snap.tot.edges, lang),
  });

  return (
    <div className="page hm">
      <a className="hm-hero" href={`/${lang}/explore`}>
        <div className={painting ? 'hm-hero__art' : 'hm-hero__art hm-hero__art--empty'}>
          {painting ? <HeroNetworkPainting data={painting} label={t(lang, 'home.hero.alt', { year })} /> : null}
        </div>
        <div className="hm-hero__plate">
          <p className="lr-kicker">{t(lang, 'home.hero.kicker')}</p>
          <h1 className="hm-hero__title">{t(lang, 'home.hero.title', { year })}</h1>
          <p className="hm-hero__facts">{facts}</p>
          <span className="lr-btn lr-btn--canopy hm-hero__cta">{t(lang, 'home.hero.open')} <ArrowRight aria-hidden /></span>
        </div>
      </a>

      {blocks.length ? (
        <section className="hm-sec" aria-labelledby="hm-chains">
          <div className="hm-sechead">
            <h2 id="hm-chains" className="hm-h2">{t(lang, 'home.chains.h')}</h2>
            <a href={`/${lang}/chains`}>{t(lang, 'home.chains.all')}</a>
          </div>
          <ChainBlocks lang={lang} blocks={blocks} />
        </section>
      ) : null}

      <p className="lr-caption hm-source">{t(lang, 'home.source', { year })}</p>
    </div>
  );
}
