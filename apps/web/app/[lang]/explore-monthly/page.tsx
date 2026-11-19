import type { Metadata } from 'next';
import type { Meta, RawSnapCore } from '@larch/net/core';
import { Explorer, type ExplorerEvent } from '@/components/explore/Explorer';
import type { ChainName } from '@/components/explore/ProductPicker';
import { ExploreSummary, productList, topFlows } from '@/components/explore/Summary';
import { readData } from '@/lib/data';
import { formatPeriod, t } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import '../explore/explore.css';

// The monthly explorer ("Monthly" in the nav; the one monthly entry point since 2 Nov 2026): the explorer
// on rolling 3-, 6- and 12-month windows of the monthly Comtrade layer, with estimated flows (IMF DOTS splice,
// benchmarked to annual files) drawn dashed and divergence flags in the table and tooltips. The data come from
// scripts/build_windows.py (snap/W, series/W, div/). Under the map, the shown month's 12-month window in words.

/** snap/W/<slug>/<YYYY>.w12.json */
interface RawWindowFile { ncols: string[]; ecols: string[]; snaps: RawSnapCore[] }

/** The last shown month of the windows and its 12-month window of all goods. */
async function shownWindow(meta: Meta): Promise<{ t: number; snap: RawSnapCore; ecols: string[] } | null> {
  const shown = meta.shown?.W ?? meta.complete.M;
  const file = await readData<RawWindowFile>(`snap/W/TOTAL/${Math.floor(shown / 100)}.w12.json`).catch(() => null);
  if (!file?.snaps.length) return null;
  const snap = file.snaps.find((s) => s.t === shown) ?? file.snaps.filter((s) => s.t <= shown).at(-1) ?? file.snaps[file.snaps.length - 1];
  return { t: snap.t, snap, ecols: file.ecols };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const meta = await readData<Meta>('meta.json');
  const month = formatPeriod(meta.shown?.W ?? meta.complete.M, lang);
  return pageMeta(lang, { path: '/explore-monthly', title: t(lang, 'explore.w.metaTitle', { month }), description: t(lang, 'explore.w.metaDescription', { month }) });
}

/** What the client needs of meta.json, as the explorer's slimMeta, and only the products that have windows. */
function slimMeta(m: Meta): Meta {
  return {
    ...m,
    reporters: { A: {}, M: {} },
    nodes: m.nodes.map((n) => ({ id: n.id, en: n.en, ko: n.ko, subregion: n.subregion, lat: n.lat, lon: n.lon, hist: n.hist })),
    products: m.products.filter((p) => p.W).map(({ aliases: _a, codes_pre2022: _c, chains: _ch, ...p }) => p),
  } as unknown as Meta;
}

export default async function ExploreMonthly({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langOf(params);
  const meta = await readData<Meta>('meta.json');
  const [index, events, win] = await Promise.all([
    readData<{ chains: ChainName[] }>('chains/index.json').catch(() => ({ chains: [] as ChainName[] })),
    readData<{ events: ExplorerEvent[] }>('events/index.json').then((d) => d.events).catch(() => [] as ExplorerEvent[]),
    shownWindow(meta),
  ]);
  const chains: ChainName[] = index.chains.map((c) => ({ id: c.id, en: c.en, ko: c.ko, levels: (c.levels ?? []).map((l) => ({ en: l.en, ko: l.ko })) }));
  return (
    <>
      <h1 className="gx-visually-hidden">{t(lang, 'explore.w.h1')}</h1>
      <Explorer lang={lang} meta={slimMeta(meta)} chains={chains} mode="windows"
        events={events.map((e) => ({ id: e.id, num: e.num, start: e.start, title: e.title }))} initialSeries={null} staticMap={null} />
      {win ? (
        <ExploreSummary lang={lang} mode="windows" period={formatPeriod(win.t, lang)} world={win.snap.world} economies={win.snap.tot.nodes} flows={win.snap.tot.edges}
          top={topFlows(win.snap.edges, win.ecols, win.snap.world, meta, lang)} products={productList(meta, lang, true)}
          source={t(lang, 'explore.w.source', { w: 12, lag: lang === 'ko' ? '5.5개월' : '5.5 months' })} />
      ) : null}
    </>
  );
}
