import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Insight, TrailHead, TrailRule, formatDate } from '@larch/ui';
import { ChainBody } from '@/components/chains/ChainBody';
import { EDITORIAL, Facts, titleWithYear } from '@/components/chains/editorial';
import { BASE_YEAR, buildModel, fmtHHI, fmtUSD, mostTwoWay, seriesOf, sliceOf, type KcsGaps } from '@/components/chains/model';
import type { ChainFile, ChainIndexFile, MetaFile } from '@/components/chains/types';
import { readData } from '@/lib/data';
import { t } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { buildDate, datasetLd, JsonLd, pageMeta } from '@/lib/seo';
import '../chains.css';

// One chain: TrailHead (the finding), the year and focus selectors, the ChainTrail, the Stage map and the Trail, one
// section per stage, the focus economy's place (?focus=ISO3 only), the editor's reading and the method. Static for
// the ten chains in chains/index.json.
export const dynamicParams = false;

type Params = Promise<{ lang: string; chain: string }>;

export async function generateStaticParams() {
  const index = await readData<ChainIndexFile>('chains/index.json');
  return index.chains.map((c) => ({ chain: c.id }));
}

async function load(id: string) {
  const index = await readData<ChainIndexFile>('chains/index.json');
  if (!index.chains.some((c) => c.id === id)) return null;
  const [chain, meta, gaps] = await Promise.all([readData<ChainFile>(`chains/${id}.json`), readData<MetaFile>('meta.json'),
    readData<KcsGaps>('checks/kcs_gaps.json').catch(() => null)]);
  return { index, chain, meta, gaps };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [lang, { chain: id }] = await Promise.all([langOf(params), params]);
  const data = await load(id);
  const ed = EDITORIAL[id];
  if (!data || !ed) return {};
  const f = new Facts(data.chain, data.meta.nodes, lang, data.meta.complete.A);
  const name = lang === 'ko' ? data.chain.ko : data.chain.en;
  return pageMeta(lang, { path: `/chains/${id}`, title: `${name} · ${titleWithYear(ed, lang)}`, description: ed.dek[lang](f) });
}

export default async function ChainPage({ params }: { params: Params }) {
  const [lang, { chain: id }] = await Promise.all([langOf(params), params]);
  const data = await load(id);
  const ed = EDITORIAL[id];
  if (!data || !ed) notFound();
  const { index, chain, meta, gaps } = data;
  const year = meta.complete.A;
  const model = buildModel(chain, meta, index, lang, gaps);
  const slice = sliceOf(chain, year);
  const f = new Facts(chain, meta.nodes, lang, year);
  const built = await buildDate();

  const withData = model.stages.filter((s) => slice[s.key]);
  const largest = withData.filter((s) => s.role === null).reduce<typeof withData[number] | null>((a, s) => (!a || slice[s.key]!.world > slice[a.key]!.world ? s : a), null);
  const ck = chain.chokepoint[String(year)];
  const choke = ck ? model.stages.find((s) => s.key === ck) : null;
  const chokeY = choke ? slice[choke.key] : null;
  const tw = mostTwoWay(model.stages, slice);
  const twStage = tw ? model.stages.find((s) => s.key === tw.key) : null;

  const counts = [
    { value: String(model.stages.length), label: t(lang, 'chains.head.count.stages') },
    ...(largest ? [{ value: fmtUSD(slice[largest.key]!.world, lang), label: `${t(lang, 'chains.head.count.largest', { year })}: ${largest.name}` }] : []),
    choke && chokeY
      ? { value: `HHI ${fmtHHI(chokeY.hhi)}`, label: `${t(lang, 'chains.head.count.choke', { year })}: ${choke.name}` }
      : { value: t(lang, 'chains.head.none'), label: t(lang, 'chains.head.count.noChoke', { year }) },
    ...(tw && twStage ? [{ value: `${model.nodes[tw.i]?.[1] ?? ''} · GL ${tw.gl.toFixed(2)}`, label: `${t(lang, 'chains.head.count.twoWay', { year })}: ${twStage.name}` }] : []),
  ];

  return (
    <div className="ch-page" lang={lang}>
      <div className="ch-head">
        <TrailHead
          kicker={`${t(lang, 'chains.kicker')} · ${model.name}`}
          title={titleWithYear(ed, lang)}
          dek={ed.dek[lang](f)}
          counts={counts}
        />
      </div>
      <JsonLd data={datasetLd(lang, {
        name: `${model.name} (${year})`, description: ed.dek[lang](f), path: `/chains/${id}`, modified: built,
        keywords: model.stages.map((s) => s.name), temporalCoverage: `${Math.min(...chain.years)}/${Math.max(...chain.years)}`,
      })} />
      <div className="page page--doc ch-doc">
        <ChainBody model={model} initialYear={year} initialSlice={slice} baseSlice={sliceOf(chain, BASE_YEAR)} series={seriesOf(chain, model.shownMonth ?? undefined)} />
        <TrailRule />
        <Insight lang={lang}>{ed.insight[lang](f)}</Insight>
        <section className="ch-method" aria-labelledby="method-h">
          <h2 className="lr-h2" id="method-h">{t(lang, 'chains.method.h')}</h2>
          <div className="lr-prose" lang={lang}>
            <p>{t(lang, 'chains.method.p1')}</p>
            <p>{t(lang, 'chains.method.p2')} <a href={`/${lang}/method`}>{t(lang, 'chains.method.link')}</a></p>
          </div>
          <p className="lr-caption">
            {t(lang, 'chains.source')}. {meta.built_at ? t(lang, 'chains.updated', { date: formatDate(meta.built_at, lang) }) : ''}
          </p>
        </section>
      </div>
    </div>
  );
}

