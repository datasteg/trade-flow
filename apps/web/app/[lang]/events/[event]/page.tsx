import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { netString, SlopeChart } from '@larch/net';
import { Notice, TrailHead, TrailRule, type DataRow } from '@larch/ui';
import { formatDate, formatPercentChange, formatPointChange, formatShare, t, type Lang } from '@/lib/i18n';
import { readData } from '@/lib/data';
import { langOf } from '@/lib/page';
import { articleLd, buildDate, JsonLd, pageMeta } from '@/lib/seo';
import { BarList, type Bar } from '@/components/stories/BarList';
import { LeadStrip, SharesByProduct, type SharesChartData } from '@/components/stories/EventCharts';
import { EventMap } from '@/components/stories/EventMap';
import { Figure } from '@/components/stories/Figure';
import { fs } from '@/components/stories/measures';
import { addMonths, Book, cap, eventDates, joinNames, lensText, mid, monthOf, monthsIn, periodLabel, poss, sourceLine } from '@/components/stories/names';
import type { CasesIndex, EventDoc, EventsIndex, MetaLite, Movers, PartnerShares } from '@/components/stories/types';
import '../../cases/stories.css';

export const dynamicParams = false;

type Params = Promise<{ lang: string; event: string }>;

export async function generateStaticParams() {
  const idx = await readData<EventsIndex>('events/index.json');
  return idx.events.map((e) => ({ event: e.id }));
}

async function load(id: string) {
  const idx = await readData<EventsIndex>('events/index.json');
  if (!idx.events.some((e) => e.id === id)) return null;
  const [doc, meta, cases, chains] = await Promise.all([
    readData<EventDoc>(`events/${id}.json`),
    readData<MetaLite>('meta.json'),
    readData<CasesIndex>('cases/index.json').catch(() => null),
    readData<{ chains: { id: string; en: string; ko: string }[] }>('chains/index.json').catch(() => ({ chains: [] })),
  ]);
  return { idx, doc, meta, cases, chains: chains.chains };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [lang, { event }] = await Promise.all([langOf(params), params]);
  const x = await load(event);
  if (!x) return { title: t(lang, 'common.nav.events') };
  const dates = eventDates(x.doc.start, x.doc.end, x.doc.ongoing, lang, formatDate);
  return pageMeta(lang, {
    path: `/events/${event}`, type: 'article', title: `${x.doc.title[lang]} (${dates})`, description: x.doc.dek[lang],
    published: x.doc.start, modified: await buildDate(),
  });
}

type SeriesFile = { cols: string[]; rows: Record<string, (number | null)[][]> };

/** The lead strip: world trade in the view's product, change on the window ending 12 months earlier (monthly: the
 *  one monthly rule's windows, series/W, 3 months for lens M and 12 for lens L, on the windows' end months)
 * or year on year (annual), from two years before the base to the last period. */
async function leadSeries(doc: EventDoc, book: Book) {
  const v = doc.view;
  const p = book.products.get(v.p);
  if (!p) return null;
  const f = v.f === 'M' && p.M ? 'M' : 'A';
  const raw = await readData<SeriesFile>(`series/${f === 'M' ? 'W' : 'A'}/${p.slug}.json`).catch(() => null);
  if (!raw) return null;
  const lens = v.lens === 'M' ? 'M' : 'L';
  const key = f === 'M' ? (lens === 'M' ? '3' : '12') : 'mirror';
  const rows = raw.rows[key] ?? [];
  const ti = raw.cols.indexOf('t'), wi = raw.cols.indexOf('world');
  const world = new Map(rows.map((r) => [r[ti] as number, r[wi] as number]));
  const lo = f === 'M' ? addMonths(v.base, -24) : v.base - 6;
  // Months whose filers held less than half of 2024 world exports are left off the strip, and so is any period
  // after the explorers' last offered one (meta.shown).
  const cov = book.meta.coverage[f];
  const end = book.meta.shown?.[f] ?? Infinity;
  const periods = rows.map((r) => r[ti] as number).filter((x) => x >= lo && x <= end && (cov[String(x)] ?? 1) >= 0.5);
  const back = (x: number) => (f === 'M' ? x - 100 : x - 1);
  const values = periods.map((x) => {
    const a = world.get(x), b = world.get(back(x));
    return a != null && b ? a / b - 1 : null;
  });
  return { f: f as 'A' | 'M', lens: f === 'M' ? (lens as 'L' | 'M') : null, periods, values };
}

function at(s: PartnerShares, p: number): number {
  return s.t.indexOf(p);
}

/** A partner-share series too small or erratic to read month by month: its largest partner's share jumps by more
 *  than 12 points a period on average (a flow of a few cargoes, or one seen through a few partners' reports). */
function erratic(s: PartnerShares): boolean {
  const v = (s.series[0]?.share ?? []).filter((x): x is number => x != null);
  if (v.length < 3) return false;
  let sum = 0;
  for (let i = 1; i < v.length; i++) sum += Math.abs(v[i] - v[i - 1]);
  return sum / (v.length - 1) > 0.12;
}

/** Can the shares at t (and at the base) be read as the economy's own? Importers must have filed both periods; an
 *  exporter that has not filed is seen through its partners, which is fine while they have all filed (to the last
 *  complete month) and not after. */
function readableAt(s: PartnerShares, i: number, j: number, complete: number): boolean {
  if (erratic(s)) return false;
  if (s.role === 'importer') return i >= 0 && j >= 0 && s.filed[i] && s.filed[j];
  return i >= 0 && j >= 0 && (s.filed[i] || s.t[i] <= complete);
}

export default async function EventPage({ params }: { params: Params }) {
  const [lang, { event }] = await Promise.all([langOf(params), params]);
  const x = await load(event);
  if (!x) notFound();
  const { idx, doc, meta, cases, chains } = x;
  const book = new Book(meta);
  const built = await buildDate();
  // the customs citation for the page's monthly figures: from two years before the base to the view's period
  const cite = book.citeMonths(lang, [...monthsIn(doc), ...(doc.view.f === 'M' ? [addMonths(doc.view.base, -24)] : [])]);
  const v = doc.view;
  const viewLens = v.f === 'M' ? v.lens : null;
  const P = (p: number) => periodLabel(p, lang, viewLens);
  const product = book.product(v.p, lang);
  const lead = await leadSeries(doc, book);
  const startP = v.f === 'M' ? monthOf(doc.start) : Number(doc.start.slice(0, 4));
  const kindKey = `events.kind.${doc.kind}` as Parameters<typeof t>[1];
  const lensWords = viewLens ? `, ${lensText(viewLens, lang)}` : '';
  const roleW = (r: 'importer' | 'exporter') => t(lang, `events.role.${r}`);

  // -- the named economies' change on a year earlier, at t ---------------------------------------------------------
  const viewSeries = doc.series.filter((s) => s.product === v.p);
  const completeF = v.f === 'M' ? meta.complete.M : meta.complete.A;
  // A change on a year earlier compares like with like (L10): the economy's reporting side at t and 12 months earlier
  // must be the same (its own report at both, or its partners' at both); otherwise no bar and no mention.
  const sameSide = (s: PartnerShares, i: number) => {
    const back = at(s, v.f === 'M' ? addMonths(v.t, -12) : v.t - 1);
    return i >= 0 && (back < 0 || s.filed[back] === s.filed[i]);
  };
  const yoyRows = doc.series.map((s) => {
    const i = at(s, v.t);
    return { s, yoy: i >= 0 && sameSide(s, i) ? s.yoy[i] : null, filed: i >= 0 ? s.filed[i] : false };
  });
  const yoyView = yoyRows.filter((r) => r.s.product === v.p && r.yoy != null);
  const yoyBars: Bar[] = [...yoyView].sort((a, b) => (a.yoy as number) - (b.yoy as number)).map((r) => ({
    id: `${r.s.economy}-${r.s.role}`,
    label: `${book.econ(r.s.economy, lang)} · ${roleW(r.s.role)}`,
    value: r.yoy, text: formatPercentChange(r.yoy, lang, { decimals: Math.abs(r.yoy ?? 0) >= 10 ? 0 : 1 }), muted: !r.filed || erratic(r.s),
  }));
  const item = (r: (typeof yoyRows)[number]) => t(lang, 'events.yoy.item', { econ: book.econ(r.s.economy, lang), role: roleW(r.s.role), v: formatPercentChange(r.yoy, lang, { decimals: 1 }) });
  const sortedYoy = [...yoyView].sort((a, b) => (a.yoy as number) - (b.yoy as number));
  // The reading names only economies that filed the period and whose flows are large enough to read.
  const readYoy = sortedYoy.filter((r) => r.filed && !erratic(r.s));
  const yoyReading = readYoy.length > 1
    ? t(lang, 'events.yoy.reading', { lo: item(readYoy[0]), hi: item(readYoy[readYoy.length - 1]) })
    : readYoy.length ? t(lang, 'events.yoy.readingOne', { item: item(readYoy[0]) }) : '';

  // -- diversion: partner share changes between base and t ---------------------------------------------------------
  const flows = viewSeries.flatMap((s) => {
    const i = at(s, v.t), j = at(s, v.base);
    if (!readableAt(s, i, j, completeF)) return [];
    return s.series.map((sl) => {
      const a = sl.share[j], b = sl.share[i];
      const econ = book.econ(s.economy, lang), partner = book.econ(sl.id, lang);
      const flow = s.role === 'importer' ? `${cap(partner)} → ${econ}` : `${econ} → ${cap(partner)}`;
      return { key: `${s.economy}-${s.role}-${sl.id}`, flow, role: s.role, econ: s.economy, partner: sl.id, a, b, d: a != null && b != null ? b - a : null };
    });
  }).filter((f) => f.d != null);
  const topFlows = [...flows].sort((a, b) => Math.abs(b.d as number) - Math.abs(a.d as number)).slice(0, 10);
  const pp = (d: number | null) => formatPointChange(d, lang, { decimals: 1 });
  const divReading = topFlows[0] ? t(lang, 'events.div.reading', { flow: topFlows[0].flow, d: pp(topFlows[0].d), s0: fs(topFlows[0].a, lang), s1: fs(topFlows[0].b, lang) }) : '';

  // -- movers --------------------------------------------------------------------------------------------------------
  // Two products with the same codes (crude oil as a basket and as a chain stage) are shown once.
  const sameName = (pid: string, i: number, all: string[]) => all.findIndex((q) => book.product(q, lang) === book.product(pid, lang)) === i;
  const movers = doc.measures.filter((m): m is Movers => m.kind === 'movers' && ((m.up?.length ?? 0) + (m.down?.length ?? 0)) > 0)
    .filter((m, i, all) => sameName(m.product, i, all.map((x) => x.product)));
  const viewMovers = movers.find((m) => m.product === v.p) ?? movers[0];

  // -- partner shares, product by product -----------------------------------------------------------------------------
  const products = [...new Set(doc.series.map((s) => s.product))].filter(sameName);
  const skipped = doc.series.filter((s) => products.includes(s.product) && erratic(s));
  const sharesProducts = products.map((pid) => ({
    id: pid,
    label: book.product(pid, lang).replace(/\s*\([^)]*\)\s*$/, ''),
    charts: doc.series.filter((s) => s.product === pid && !erratic(s)).map((s): SharesChartData => {
      const econ = book.econ(s.economy, lang), prodName = mid(book.product(pid, lang), lang);
      const i = at(s, v.t), j = at(s, v.base);
      const sl = s.series[0];
      const reading = sl && i >= 0 && j >= 0
        ? t(lang, 'events.shares.reading', { partner: cap(book.econ(sl.id, lang)), s0: fs(sl.share[j], lang), base: P(v.base), s1: fs(sl.share[i], lang), t: P(v.t), d: pp(sl.share[i] != null && sl.share[j] != null ? (sl.share[i] as number) - (sl.share[j] as number) : null) })
        : sl ? t(lang, 'events.shares.readingNoBase', { partner: cap(book.econ(sl.id, lang)), s1: fs(sl.share[s.t.length - 1], lang), t: P(s.t[s.t.length - 1]) }) : '';
      const notFiled = s.role === 'exporter' && s.filed.some((x) => !x);
      return {
        key: `${s.economy}-${s.role}`,
        title: t(lang, s.role === 'importer' ? 'events.shares.titleImp' : 'events.shares.titleExp', { econ: cap(econ), product: prodName }),
        reading: cap(reading),
        note: notFiled ? t(lang, 'events.shares.partners', { econ }) : null,
        periods: s.t,
        // An importer that had not filed a month: its shares that month are left out.
        slots: s.series.slice(0, 5).map((x) => ({
          key: x.id, label: cap(book.econ(x.id, lang)),
          values: x.share.map((y, k) => (s.role === 'importer' && !s.filed[k] ? null : y)),
        })),
        other: s.other.map((y, k) => (s.role === 'importer' && !s.filed[k] ? null : y)),
        label: t(lang, 'events.shares.label', { econ: poss(econ, lang), product: prodName, role: roleW(s.role), lens: s.lens ? lensText(s.lens, lang) : '' }),
        source: sourceLine(lang, { cite, freq: s.freq, lens: s.lens }),
        csvName: `${doc.id}-${s.economy}-${s.role}-${pid.replace(/[^A-Za-z0-9]+/g, '-')}`,
      };
    }),
  })).filter((p) => p.charts.length);

  // -- timeline, "reported" items ----------------------------------------------------------------------------------
  const lastSource = doc.sources.map((s) => s.date).filter((d): d is string => !!d).sort().pop() ?? '';
  const timeline = doc.timeline.map((it) => ({ ...it, reported: it.reported || (!!lastSource && it.date > lastSource) }));
  const anyReported = timeline.some((it) => it.reported);

  // -- what else changed: other events in the window ---------------------------------------------------------------
  const wStart = v.f === 'M' ? addMonths(v.base, -2) : v.base * 100 + 1;
  const wEnd = v.f === 'M' ? v.t : v.t * 100 + 12;
  const near = v.f === 'M' ? addMonths(v.base, -12) : (v.base - 1) * 100 + 1;
  const overlapping = idx.events.filter((e) => e.id !== doc.id && monthOf(e.start) <= wEnd
    && (monthOf(e.start) >= near || (!!e.end && monthOf(e.end) >= wStart && monthOf(e.end) <= wEnd)));
  const relKey = `events.rel.${doc.id}`;
  const hasRel = relKey === 'events.rel.red-sea-2023' || relKey === 'events.rel.iran-war-2026';

  // -- coverage ------------------------------------------------------------------------------------------------------
  const missing = new Map<string, Set<string>>();
  for (const m of doc.missing) {
    if (!missing.has(m.economy)) missing.set(m.economy, new Set());
    missing.get(m.economy)!.add(roleW(m.role));
  }
  const missingList = [...missing.entries()].map(([e, roles]) => `${book.econ(e, lang)} (${[...roles].join(', ')})`);
  const cov = v.f === 'M' ? meta.coverage.M[String(v.t)] : meta.coverage.A[String(v.t)];
  const reps = v.f === 'M' ? meta.reporters.M[String(v.t)] : meta.reporters.A[String(v.t)];
  // The store's limits matter when the view or the charts of the named economies run past Dec 2024.
  const seriesEnd = Math.max(v.t, ...doc.series.map((x) => x.t[x.t.length - 1] ?? 0));
  const afterStore = v.f === 'M' ? seriesEnd > 202412 : v.t > 2024;

  // -- related ------------------------------------------------------------------------------------------------------
  const relatedCases = (cases?.cases ?? []).filter((c) => c.events.includes(doc.num));
  const chainIds = [...new Set(doc.products.map((p) => book.stageOf(p)?.chain).filter((c): c is string => !!c))];
  const order = idx.events.map((e) => e.id);
  const k = order.indexOf(doc.id);
  const prev = k > 0 ? idx.events[k - 1] : null, next = k < order.length - 1 ? idx.events[k + 1] : null;

  // Asia, n.e.s. (Comtrade partner 490) named among the partners or the movers: say what it is
  const nesIdx = meta.nodes.flatMap((n, i) => (n.nes ? [i] : []));
  const nesIso = new Set(nesIdx.map((i) => meta.nodes[i].id));
  const nesNamed = nesIdx.length && (doc.series.some((s) => s.series.some((x) => nesIso.has(x.id)))
    || movers.some((m) => [...(m.up ?? []), ...(m.down ?? [])].some(([i]) => nesIdx.includes(i))))
    ? `${book.node(nesIdx[0], lang)}: ${netString(lang, 'nesNote')}` : '';

  const leadReading = lead ? (() => {
    const ib = lead.periods.indexOf(v.base), it = lead.periods.indexOf(v.t);
    let r = t(lang, 'events.lead.reading', {
      product: mid(product, lang), lens: lead.lens ? lensText(lead.lens, lang) : t(lang, 'events.note.annual'),
      v0: formatPercentChange(ib >= 0 ? lead.values[ib] : null, lang, { decimals: 1 }), p0: P(v.base),
      v1: formatPercentChange(it >= 0 ? lead.values[it] : null, lang, { decimals: 1 }), p1: P(v.t),
    });
    const after = lead.periods.map((p, i) => [p, lead.values[i]] as const).filter(([p, y]) => p > v.base && y != null && p <= Math.max(v.t, meta.complete[lead.f]));
    const low = after.reduce<readonly [number, number | null] | null>((a, b) => (a == null || (b[1] as number) < (a[1] as number) ? b : a), null);
    if (low && low[0] !== v.t && (low[1] as number) < 0) r += ' ' + t(lang, 'events.lead.low', { v: formatPercentChange(low[1], lang, { decimals: 1 }), p: P(low[0]) });
    return r;
  })() : '';

  return (
    <div className="page page--doc st-page">
      <JsonLd data={articleLd(lang, { headline: doc.title[lang], description: doc.dek[lang], path: `/events/${doc.id}`, modified: built, published: doc.start, section: t(lang, 'common.nav.events') })} />
      <TrailHead kicker={`${t(lang, 'events.num', { n: doc.num })} · ${t(lang, kindKey)}`} title={doc.title[lang]} dek={doc.dek[lang]}
        counts={[
          { value: eventDates(doc.start, doc.end, doc.ongoing, lang, formatDate), label: t(lang, 'events.count.dates') },
          { value: doc.economies.length, label: t(lang, 'events.count.economies') },
          { value: doc.products.length, label: t(lang, 'events.count.products') },
          { value: doc.sources.length, label: t(lang, 'events.count.sources') },
        ]} />

      <section className="st-sec" aria-labelledby="map">
        <h2 id="map">{t(lang, 'events.sec.map')}</h2>
        <p className="st-sec__lede">{t(lang, 'events.map.lede', { product: cap(product), t: P(v.t), base: P(v.base), lens: lensWords })}</p>
        <EventMap lang={lang} product={v.p} freq={v.f} base={v.base} t={v.t} lens={v.f === 'M' ? v.lens : null} outline={doc.economies} />
        <p className="st-watch"><b>{t(lang, 'events.watch')}</b> {doc.watch[lang]}</p>
      </section>

      <section className="st-sec" aria-labelledby="numbers">
        <h2 id="numbers">{t(lang, 'events.sec.numbers')}</h2>
        <p className="st-sec__lede">{t(lang, 'events.numbers.lede', { base: P(v.base), t: P(v.t) })}</p>
        {nesNamed ? <p className="lr-caption">{nesNamed}</p> : null}
        {lead ? (
          <div className="st-fig st-fig--wide">
            <h3 className="st-fig__title">{t(lang, 'events.lead.title', { product: mid(product, lang) })}</h3>
            <p className="st-fig__reading">{cap(leadReading)}</p>
            <LeadStrip lang={lang} periods={lead.periods} values={lead.values} label={leadReading}
              seriesLabel={t(lang, 'events.lead.series')} start={lead.periods.includes(startP) ? startP : null}
              base={v.base} now={v.t} complete={meta.complete[lead.f]} coverage={lead.f === 'M' ? meta.coverage.M : meta.coverage.A}
              source={sourceLine(lang, { cite, freq: lead.f, lens: lead.lens })} eventLabel={doc.num} csvName={`${doc.id}-world`} />
          </div>
        ) : null}
        <div className="st-figs">
          {yoyBars.length ? (
            <Figure lang={lang} id="yoy" title={t(lang, 'events.yoy.title', { product: mid(product, lang), t: P(v.t) })} reading={yoyReading}
              notes={[yoyBars.some((b) => b.muted) ? t(lang, 'events.yoy.mutedNote', { t: P(v.t) }) : null,
                yoyBars.some((b) => Math.abs(b.value ?? 0) > 1) ? t(lang, 'events.yoy.capped') : null,
                v.f === 'A' ? t(lang, 'events.note.annual') : null]}
              source={sourceLine(lang, { cite, freq: v.f, lens: viewLens })}
              table={{
                columns: [
                  { key: 'p', label: t(lang, 'cases.col.product'), sortable: true }, { key: 'e', label: t(lang, 'cases.col.economy'), sortable: true },
                  { key: 'r', label: t(lang, 'events.div.col.role') }, { key: 'v', label: t(lang, 'cases.col.change'), num: true, sortable: true },
                  { key: 'f', label: t(lang, 'cases.col.filed') },
                ],
                rows: yoyRows.map((r, i): DataRow => ({
                  id: String(i),
                  cells: { p: book.product(r.s.product, lang), e: book.econ(r.s.economy, lang), r: roleW(r.s.role), v: formatPercentChange(r.yoy, lang, { decimals: 1 }), f: r.filed ? t(lang, 'cases.yes') : t(lang, 'cases.no') },
                  sort: { v: r.yoy },
                })),
                csv: [[t(lang, 'cases.col.product'), t(lang, 'cases.col.iso'), t(lang, 'events.div.col.role'), t(lang, 'cases.col.period'), t(lang, 'cases.col.changeFrac'), t(lang, 'cases.col.filed')],
                  ...yoyRows.map((r) => [r.s.product, r.s.economy, r.s.role, v.t, r.yoy, r.filed ? 1 : 0])],
                filename: `${doc.id}-change`,
              }}>
              <BarList bars={yoyBars} diverging ariaLabel={yoyReading}
                max={Math.max(1e-9, Math.min(1, Math.max(...yoyBars.map((b) => Math.abs(b.value ?? 0)))))} />
            </Figure>
          ) : null}
          {topFlows.length ? (
            <Figure lang={lang} id="diversion" title={t(lang, 'events.div.title', { base: P(v.base), t: P(v.t) })} reading={divReading}
              notes={[t(lang, 'events.div.note', { base: P(v.base), t: P(v.t) })]}
              source={sourceLine(lang, { cite, freq: v.f, lens: viewLens })}
              table={{
                columns: [
                  { key: 'f', label: t(lang, 'events.div.col.flow'), sortable: true }, { key: 'r', label: t(lang, 'events.div.col.role') },
                  { key: 'a', label: P(v.base), num: true, sortable: true }, { key: 'b', label: P(v.t), num: true, sortable: true },
                  { key: 'd', label: t(lang, 'cases.col.pp'), num: true, sortable: true },
                ],
                rows: flows.map((f): DataRow => ({
                  id: f.key,
                  cells: { f: f.flow, r: roleW(f.role), a: fs(f.a, lang), b: fs(f.b, lang), d: pp(f.d) }, sort: { a: f.a, b: f.b, d: f.d },
                })),
                csv: [[t(lang, 'cases.col.iso'), t(lang, 'events.div.col.role'), t(lang, 'cases.col.supplier'), `${t(lang, 'cases.col.shareFrac')} ${v.base}`, `${t(lang, 'cases.col.shareFrac')} ${v.t}`, t(lang, 'cases.col.ppFrac')],
                  ...flows.map((f) => [f.econ, f.role, f.partner, f.a, f.b, f.d])],
                filename: `${doc.id}-diversion`,
              }}>
              <BarList diverging ariaLabel={divReading}
                bars={topFlows.map((f) => ({ id: f.key, label: f.flow, value: f.d, text: pp(f.d) }))} />
            </Figure>
          ) : null}
        </div>
        {movers.length ? (
          <div className="st-figs">
            {movers.map((m) => {
              const items = [...(m.up ?? []), ...(m.down ?? [])].slice(0, 10).map(([i, d, s]) => ({
                key: book.iso(i), label: book.node(i, lang), a: s - d, b: s,
              }));
              const ml = m.freq === 'M' ? m.lens ?? viewLens : null;
              const pm = (p: number | undefined) => (p == null ? '' : periodLabel(p, lang, ml));
              const up = m.up?.[0], dn = m.down?.[0];
              const reading = [
                up ? t(lang, 'cases.mv.up', { econ: book.node(up[0], lang), d: pp(up[1]) }) : null,
                dn ? t(lang, 'cases.mv.down', { econ: book.node(dn[0], lang), d: pp(dn[1]) }) : null,
              ].filter(Boolean).join(lang === 'ko' ? ', ' : '; ');
              return (
                <div key={m.product} className="st-fig">
                  <h3 className="st-fig__title">{t(lang, 'events.movers.title', { product: mid(book.product(m.product, lang), lang) })}</h3>
                  <p className="st-fig__reading">{cap(t(lang, 'cases.read.movers', { product: mid(book.product(m.product, lang), lang), base: pm(m.base), now: pm(m.t), list: reading }))}</p>
                  <SlopeChart lang={lang} left={pm(m.base)} right={pm(m.t)} items={items} label={reading}
                    source={sourceLine(lang, { cite, freq: m.freq ?? v.f, lens: ml })} csvName={`${doc.id}-movers-${m.product.replace(/[^A-Za-z0-9]+/g, '-')}`} />
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {doc.reading?.items?.length ? (
        <section className="st-sec st-sec--text" aria-labelledby="reading">
          <h2 id="reading">{t(lang, 'events.sec.reading')}</h2>
          <p className="st-sec__lede">{t(lang, 'events.reading.lede')}</p>
          {doc.reading.window ? <p className="lr-prose st-context__window">{doc.reading.window[lang]}</p> : null}
          <ol className="st-context">
            {doc.reading.items.map((it, i) => (
              <li key={i}>
                {it.kind ? <span className="lr-kicker">{t(lang, `events.reading.kind.${it.kind}` as Parameters<typeof t>[1])}</span> : null}
                <p>
                  <b>{it.number[lang]}</b> {it[lang]}
                  {(it.sources ?? []).map((n) => <a key={n} className="st-srcref" href={`#src-${n}`}> [{n}]</a>)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sharesProducts.length ? (
        <section className="st-sec" aria-labelledby="shares">
          <h2 id="shares">{t(lang, 'events.sec.shares')}</h2>
          <p className="st-sec__lede">{t(lang, 'events.shares.lede', { base: P(v.base), t: P(v.t) })}</p>
          {skipped.length ? <p className="lr-caption">{t(lang, 'events.shares.skipped', { list: joinNames(skipped.map((x) => `${book.econ(x.economy, lang)} (${mid(book.product(x.product, lang), lang)} ${roleW(x.role)})`), lang) })}</p> : null}
          <SharesByProduct lang={lang} products={sharesProducts} base={v.base} now={v.t}
            complete={v.f === 'M' ? meta.complete.M : meta.complete.A} coverage={v.f === 'M' ? meta.coverage.M : meta.coverage.A} />
        </section>
      ) : null}

      <TrailRule />

      <section className="st-sec st-sec--text" aria-labelledby="timeline">
        <h2 id="timeline">{t(lang, 'events.sec.timeline')}</h2>
        <ol className="st-timeline">
          {timeline.map((it, i) => (
            <li key={i} className={it.reported ? 'is-reported' : undefined}>
              <time dateTime={it.date}>{formatDate(it.date, lang)}</time>
              <span>
                {it.reported ? <span className="st-reported">{t(lang, 'events.reported')}</span> : null}
                {it[lang] ?? it.en}
                {it.source ? <> <a className="st-srcref" href={`#src-${it.source}`}>[{it.source}]</a></> : null}
              </span>
            </li>
          ))}
        </ol>
        {anyReported ? <p className="lr-caption">{t(lang, 'events.reported.note')}</p> : null}
      </section>

      <section className="st-sec st-sec--text" aria-labelledby="else">
        <h2 id="else">{t(lang, 'events.sec.else')}</h2>
        {hasRel ? <p className="lr-prose">{t(lang, relKey as Parameters<typeof t>[1])}</p> : null}
        {viewMovers?.world_change != null ? (
          <p className="lr-prose">
            {t(lang, 'events.else.world', { product: mid(book.product(viewMovers.product, lang), lang), v: formatPercentChange(viewMovers.world_change, lang, { decimals: 1 }), base: periodLabel(viewMovers.base ?? v.base, lang, viewMovers.lens ?? null), t: periodLabel(viewMovers.t ?? v.t, lang, viewMovers.lens ?? null) })}
            {v.t > completeF && cov != null ? ` ${t(lang, 'events.else.partial', { p: P(v.t), c: formatShare(cov, lang) })}` : ''}
          </p>
        ) : null}
        {overlapping.length ? (
          <div>
            <p className="lr-prose">{t(lang, 'events.else.events')}</p>
            <ul className="st-evrefs">
              {overlapping.map((e) => (
                <li key={e.id}>
                  <span className="st-diamond" aria-hidden>{e.num}</span>
                  <a href={`/${lang}/events/${e.id}`}>{e.title[lang]}</a>
                  <span className="lr-caption"> · {eventDates(e.start, e.end, e.ongoing, lang, formatDate)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="lr-prose">{t(lang, 'events.else.noEvents')}</p>}
        <p className="lr-prose">{t(lang, 'events.else.prices')}</p>
        {doc.reading?.items?.length ? <p className="lr-prose">{t(lang, 'events.else.reading')}</p> : null}
      </section>

      <section className="st-sec st-sec--text" aria-labelledby="coverage">
        <h2 id="coverage">{t(lang, 'events.sec.coverage')}</h2>
        <Notice tone={missing.size || afterStore ? 'warning' : 'info'} title={t(lang, 'events.coverage.title')}>
          {[
            cov != null && reps != null ? t(lang, 'events.coverage.filed', { n: reps, p: P(v.t), c: formatShare(cov, lang) }) : null,
            missingList.length ? t(lang, 'events.coverage.missing', { list: joinNames(missingList, lang), p: P(doc.series[0]?.t[doc.series[0].t.length - 1] ?? v.t) }) : t(lang, 'events.coverage.allFiled'),
            afterStore ? t(lang, 'events.coverage.store') : null,
          ].filter(Boolean).join(' ')}
        </Notice>
      </section>

      <section className="st-sec st-sec--text" aria-labelledby="sources">
        <h2 id="sources">{t(lang, 'events.sec.sources')}</h2>
        <ol className="st-sources">
          {doc.sources.map((s) => (
            <li key={s.n} id={`src-${s.n}`}>
              <a href={s.url} rel="noopener noreferrer" target="_blank" lang="en">{s.title}</a>
              <ExternalLink aria-hidden size={13} strokeWidth={1.5} />
              <span className="lr-caption"> · <span lang="en">{s.publisher}</span> · {s.date ? formatDate(s.date, lang) : t(lang, 'events.source.accessed', { d: s.accessed ? formatDate(s.accessed, lang) : '' })}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="st-sec st-sec--text" aria-labelledby="related">
        <h2 id="related">{t(lang, 'events.sec.related')}</h2>
        {relatedCases.length ? (
          <ul className="st-evrefs">
            {relatedCases.map((c) => (
              <li key={c.id}><span className="lr-kicker">{t(lang, 'cases.card.num', { n: c.num })}</span> <a href={`/${lang}/cases/${c.id}`}>{c.title[lang]}</a></li>
            ))}
          </ul>
        ) : <p className="lr-prose">{t(lang, 'events.related.none')}</p>}
        {chainIds.length ? (
          <ul className="st-evrefs">
            {chainIds.map((c) => (
              <li key={c}><a href={`/${lang}/chains/${c}`}>{t(lang, 'cases.chainLink', { name: chains.find((ch) => ch.id === c)?.[lang] ?? c })}</a></li>
            ))}
          </ul>
        ) : null}
      </section>

      <nav className="st-pager" aria-label={t(lang, 'events.pager')}>
        {prev ? <a href={`/${lang}/events/${prev.id}`}>← {t(lang, 'events.num', { n: prev.num })} · {prev.title[lang]}</a> : <span />}
        <a href={`/${lang}/events`}>{t(lang, 'events.all')}</a>
        {next ? <a href={`/${lang}/events/${next.id}`}>{t(lang, 'events.num', { n: next.num })} · {next.title[lang]} →</a> : <span />}
      </nav>
    </div>
  );
}
