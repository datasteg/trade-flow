import type { Metadata } from 'next';
import type { Meta, RawAnnualSnap, RawSeries } from '@larch/net/core';
import { Explorer, type ExplorerEvent } from '@/components/explore/Explorer';
import type { ChainName } from '@/components/explore/ProductPicker';
import { StaticMap } from '@/components/explore/StaticMap';
import { ExploreSummary, productList, topFlows } from '@/components/explore/Summary';
import { readData } from '@/lib/data';
import { firstView } from '@/lib/firstView';
import { formatNumber, formatPeriod, formatUSD, t } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import './explore.css';

// The explorer: years only since 2 Nov 2026; months are on /explore-monthly. The map is a client
// component whose state lives in the URL hash; under it the page renders a summary of the latest complete year
// (world total, the ten largest flows, the product list as links) so the page has content before scripts run.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const meta = await readData<Meta>('meta.json');
  const year = meta.complete.A;
  const snap = await readData<RawAnnualSnap>(`snap/A/TOTAL/${year}.json`).catch(() => null);
  const period = formatPeriod(year, lang);
  return pageMeta(lang, {
    path: '/explore',
    title: t(lang, 'explore.metaTitle', { period }),
    description: snap
      ? t(lang, 'explore.metaDescription', { period, world: formatUSD(snap.world, lang), n: formatNumber(snap.tot.nodes, lang) })
      : t(lang, 'explore.description'),
  });
}

/** The drawing box of the first view: the map area right of the rail and above the scrubber at 1440 × 900. The
 *  client fits the land into the same box, so the picture does not jump when the scripts take over. */
const BOX = { x0: 0, y0: 0, x1: 1080, y1: 708, width: 1080, height: 708 };

/** What the client needs of meta.json: the short names, subregions (the map groups by them) and positions of the economies (not their long names,
 *  regions or groups), the products without their aliases, no reporter counts. It travels in the page payload. */
function slimMeta(m: Meta): Meta {
  return {
    ...m,
    reporters: { A: {}, M: {} },
    nodes: m.nodes.map((n) => ({ id: n.id, en: n.en, ko: n.ko, subregion: n.subregion, lat: n.lat, lon: n.lon, hist: n.hist })),
    products: m.products.map(({ aliases: _a, codes_pre2022: _c, chains: _ch, ...p }) => p),
  } as unknown as Meta;
}

export default async function Explore({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langOf(params);
  const meta = await readData<Meta>('meta.json');
  const year = meta.complete.A;
  const [index, series, view, events, snap] = await Promise.all([
    readData<{ chains: ChainName[] }>('chains/index.json').catch(() => ({ chains: [] as ChainName[] })),
    readData<RawSeries>('series/A/TOTAL.json').catch(() => null),
    firstView(meta, lang, BOX),
    readData<{ events: ExplorerEvent[] }>('events/index.json').then((d) => d.events).catch(() => [] as ExplorerEvent[]),
    readData<RawAnnualSnap>(`snap/A/TOTAL/${year}.json`).catch(() => null),
  ]);
  // the chains' names and ladders (the rungs' names only; the explorer colours and labels stages by them)
  const chains: ChainName[] = index.chains.map((c) => ({ id: c.id, en: c.en, ko: c.ko, levels: (c.levels ?? []).map((l) => ({ en: l.en, ko: l.ko })) }));
  const period = formatPeriod(year, lang);
  const h1 = t(lang, 'explore.h1', { period });
  return (
    <>
      <h1 className="gx-visually-hidden">{h1}</h1>
      <Explorer lang={lang} meta={slimMeta(meta)} chains={chains}
        events={events.map((e) => ({ id: e.id, num: e.num, start: e.start, title: e.title }))} initialSeries={series ? { ...series, rows: { mirror: series.rows.mirror } } : null}
        staticMap={view ? <StaticMap data={view} label={h1} /> : null} />
      {snap ? (
        <ExploreSummary lang={lang} mode="explore" period={period} world={snap.world} economies={snap.tot.nodes} flows={snap.tot.edges}
          top={topFlows(snap.edges, snap.ecols, snap.world, meta, lang)} products={productList(meta, lang, false)}
          source={`${t(lang, 'chains.source')}, ${period}.`} />
      ) : null}
    </>
  );
}
