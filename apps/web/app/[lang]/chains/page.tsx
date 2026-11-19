import type { Metadata } from 'next';
import { TrailHead } from '@larch/ui';
import { EDITORIAL, indexTitle, titleWithYear } from '@/components/chains/editorial';
import { MiniTrail } from '@/components/chains/MiniTrail';
import { fmtHHI, fmtShare, fmtUSD, mostTwoWay, roleOf, sliceOf, twoWayTop5 } from '@/components/chains/model';
import type { ChainFile, ChainIndexFile, MetaFile } from '@/components/chains/types';
import { readData } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import './chains.css';

// The chain index: the ten chains as trail cards, each with its size, its chokepoint in the latest complete year and
// its most two-way stage.

async function load() {
  const [index, meta] = await Promise.all([readData<ChainIndexFile>('chains/index.json'), readData<MetaFile>('meta.json')]);
  const chains = await Promise.all(index.chains.map((c) => readData<ChainFile>(`chains/${c.id}.json`)));
  return { index, meta, chains };
}

function summary(lang: Lang, chain: ChainFile, meta: MetaFile, year: number) {
  const slice = sliceOf(chain, year);
  const name = (k: string) => {
    const s = chain.stages.find((x) => x.key === k)!;
    return lang === 'ko' ? s.ko : s.en;
  };
  const main = chain.stages.filter((s) => roleOf(s) === null && slice[s.key]);
  const largest = main.reduce<typeof main[number] | null>((a, s) => (!a || slice[s.key]!.world > slice[a.key]!.world ? s : a), null);
  const ck = chain.chokepoint[String(year)] ?? null;
  const cy = ck ? slice[ck] : null;
  const tw = mostTwoWay(chain.stages, slice);
  const top = cy?.top_exporters[0];
  return {
    slice,
    largest: largest ? { name: name(largest.key), world: slice[largest.key]!.world, stage: largest.stage } : null,
    choke: ck && cy ? { key: ck, name: name(ck), stage: chain.stages.find((s) => s.key === ck)!.stage, hhi: cy.hhi, top: top ? meta.nodes[top[0]].id : null, share: top?.[1] ?? null } : null,
    twoWay: tw ? { ...tw, name: name(tw.key), economy: lang === 'ko' ? meta.nodes[tw.i].ko : meta.nodes[tw.i].en } : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const { meta } = await load();
  return pageMeta(lang, {
    path: '/chains',
    title: `${t(lang, 'common.nav.chains')}, ${meta.complete.A}`,
    description: `${t(lang, 'chains.index.dek')} ${t(lang, 'chains.index.note', { year: meta.complete.A })}`,
  });
}

export default async function Chains({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langOf(params);
  const { index, meta, chains } = await load();
  const year = meta.complete.A;
  const rows = chains.map((c) => ({ chain: c, ...summary(lang, c, meta, year) }));
  const chinaChokes = rows.filter((r) => r.choke?.top === 'CHN').length;
  const withChoke = rows.filter((r) => r.choke).length;
  const stages = index.chains.reduce((n, c) => n + c.stages, 0);
  const rungCounts = chains.map((c) => c.levels.length);
  const twoWayStages = new Set<string>();
  for (const c of chains) for (const s of c.stages) if (twoWayTop5(s.years[String(year)]).length) twoWayStages.add(s.product);

  return (
    <div className="ch-page">
      <div className="ch-head">
        <TrailHead
          kicker={t(lang, 'chains.index.kicker')}
          title={indexTitle(lang, chinaChokes, chains.length)}
          dek={t(lang, 'chains.index.dek')}
          counts={[
            { value: String(chains.length), label: t(lang, 'chains.index.count.chains') },
            { value: String(stages), label: t(lang, 'chains.index.count.stages', { min: Math.min(...rungCounts), max: Math.max(...rungCounts) }) },
            { value: String(withChoke), label: t(lang, 'chains.index.count.choke', { year }) },
            { value: String(twoWayStages.size), label: t(lang, 'chains.index.count.twoWay') },
          ]}
        />
      </div>
      <div className="page page--doc ch-doc">
        <ul className="ch-cards">
          {rows.map(({ chain, largest, choke, twoWay }) => {
            const name = lang === 'ko' ? chain.ko : chain.en;
            const ed = EDITORIAL[chain.id];
            const present = chain.levels.map((_, i) => chain.stages.some((s) => s.stage === i + 1 && roleOf(s) === null));
            return (
              <li key={chain.id} className="ch-card">
                <MiniTrail lang={lang} present={present} choke={choke?.stage ?? null} />
                <p className="lr-kicker">{t(lang, 'chains.card.stages', { n: chain.stages.length })}</p>
                <h2 className="ch-card__name"><a href={`/${lang}/chains/${chain.id}`}>{name}</a></h2>
                {ed ? <p className="ch-card__finding">{titleWithYear(ed, lang)}</p> : null}
                <dl className="ch-card__facts">
                  {largest ? (
                    <div>
                      <dt>{t(lang, 'chains.card.largest')}</dt>
                      <dd><b>{fmtUSD(largest.world, lang)}</b> · {largest.name}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t(lang, 'chains.card.choke')}, {lang === 'ko' ? `${year}년` : year}</dt>
                    <dd className={choke ? 'ch-card__choke' : undefined}>
                      {choke ? <><b>{choke.name}</b> · {choke.top} {fmtShare(choke.share, lang)} · HHI {fmtHHI(choke.hhi)}</> : t(lang, 'chains.card.none')}
                    </dd>
                  </div>
                  {twoWay ? (
                    <div>
                      <dt>{t(lang, 'chains.card.twoWay')}</dt>
                      <dd>{t(lang, 'chains.card.twoWayValue', { product: twoWay.name, name: twoWay.economy, gl: twoWay.gl.toFixed(2) })}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ul>
        <p className="lr-caption ch-cards__note">{t(lang, 'chains.index.note', { year })} {t(lang, 'chains.source')}.</p>
      </div>
    </div>
  );
}
