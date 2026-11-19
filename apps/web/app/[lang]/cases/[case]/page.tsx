import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Notice, TrailHead, TrailRule } from '@larch/ui';
import { netString } from '@larch/net/core';
import { t, type Lang } from '@/lib/i18n';
import { readData } from '@/lib/data';
import { langOf } from '@/lib/page';
import { articleLd, buildDate, JsonLd, pageMeta } from '@/lib/seo';
import { FocusOnly } from '@/components/FocusOnly';
import { MeasureFigure, readerNote } from '@/components/stories/measures';
import { Book, monthsIn, periodLabel, sourceLine } from '@/components/stories/names';
import { PaperCard, ReadingItem } from '@/components/stories/PaperCard';
import { Scenario, type ScenarioOption, type ScenarioProps, type ScenarioUse } from '@/components/stories/Scenario';
import { passDown, runCut } from '@/components/stories/scenario';
import { StatTile, StatTiles } from '@larch/ui';
import { formatShare } from '@/lib/i18n';
import type { CaseDoc, CasesIndex, ChainLite, EconSpec, EventsIndex, MetaLite, ScenarioTable } from '@/components/stories/types';
import '../stories.css';

export const dynamicParams = false;

type Params = Promise<{ lang: string; case: string }>;

export async function generateStaticParams() {
  const idx = await readData<CasesIndex>('cases/index.json');
  return idx.cases.map((c) => ({ case: c.id }));
}

async function load(id: string) {
  const idx = await readData<CasesIndex>('cases/index.json');
  if (!idx.cases.some((c) => c.id === id)) return null;
  const [doc, meta, events, chains] = await Promise.all([
    readData<CaseDoc>(`cases/${id}.json`),
    readData<MetaLite>('meta.json'),
    readData<EventsIndex>('events/index.json').catch(() => null),
    readData<{ chains: { id: string; en: string; ko: string }[] }>('chains/index.json').catch(() => ({ chains: [] })),
  ]);
  return { idx, doc, meta, events, chains: chains.chains };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [lang, { case: id }] = await Promise.all([langOf(params), params]);
  const x = await load(id);
  if (!x) return { title: t(lang, 'common.nav.cases') };
  return pageMeta(lang, { path: `/cases/${id}`, type: 'article', title: x.doc.title[lang], description: x.doc.question[lang], modified: await buildDate() });
}

/** "Natural gas" from "Nitrogen fertilisers (urea, ammonium nitrate)": short enough for a segmented button. */
function shortName(s: string): string {
  return s.length > 22 ? s.replace(/\s*\([^)]*\)\s*$/, '') : s;
}

function key(spec: EconSpec): string {
  return Array.isArray(spec) ? spec.join('+') : spec;
}

async function scenarioProps(doc: CaseDoc, book: Book, lang: Lang): Promise<ScenarioProps | null> {
  const sd = doc.scenario_data;
  if (!sd || sd.error || !sd.base || sd.spec.kind === 'none') return null;
  const spec = sd.spec;
  const base = sd.base;
  const opt = (s: EconSpec): ScenarioOption => ({ key: key(s), label: book.econ(s, lang), members: book.members(s) });
  const suppliers: ScenarioOption[] = [opt(spec.supplier as EconSpec), ...(spec.alternatives ?? []).map(opt)];
  if (spec.kind !== 'close_route') {
    // The largest exporters of the product as further choices.
    for (const [i] of base.exporters.slice(0, 8)) {
      const iso = book.iso(i);
      if (!suppliers.some((s) => s.members.length === 1 && s.members[0] === i) && suppliers.length < 9) suppliers.push(opt(iso));
    }
  }
  const tableOf = (tb: ScenarioTable, isBase: boolean) => ({ id: tb.product, label: shortName(book.product(tb.product, lang)), table: tb, base: isBase });
  const products = [tableOf(base, true), ...(sd.also_cut ?? []).map((x) => tableOf(x, false)), ...(sd.other_products ?? []).map((x) => tableOf(x, false))];

  // Use shares come from the chain file of the cut stage, keyed by the chain of the stage below.
  const stage = book.stageOf(base.product);
  let chain: ChainLite | null = null;
  if (stage) chain = await readData<ChainLite>(`chains/${stage.chain}.json`).catch(() => null);
  const st = chain?.stages.find((s) => s.key === stage?.key);
  const down = (sd.down ?? []).map((d) => {
    const ds = book.stageOf(d.product);
    const u = ds && st?.use_share ? st.use_share[ds.chain] : undefined;
    const use: ScenarioUse | null = u ? { share: u.share, what: u.what?.[lang], source: u.source, year: u.year ?? null, url: u.url ?? null } : null;
    return { id: d.product, label: book.product(d.product, lang), table: d, use, feedstock: st?.role === 'feedstock' };
  });

  return {
    lang,
    caseId: doc.id,
    kind: spec.kind as ScenarioProps['kind'],
    names: book.nameList(lang),
    suppliers,
    cut: spec.cut ?? 1,
    route: spec.route ? (lang === 'ko' && spec.route === 'Strait of Hormuz' ? '호르무즈 해협' : spec.route) : undefined,
    bypass: spec.bypass?.length ? opt(spec.bypass) : null,
    importer: spec.importer ? book.members(spec.importer)[0] ?? null : null,
    importerSet: spec.importers ? { label: book.econ(spec.importers, lang), members: book.members(spec.importers) } : null,
    products,
    down,
    period: periodLabel(base.t, lang, base.lens),
    source: sourceLine(lang, { cite: book.citeMonths(lang, monthsIn(base)), freq: base.freq, lens: base.lens, extra: t(lang, 'cases.scen.sourceExtra', { p: periodLabel(base.t, lang, base.lens) }) }),
    intro: spec[lang] ?? spec.en,
    note: lang === 'en' ? readerNote(spec.note) : null,
  };
}

/** Korea in the scenario at its default settings: the share of Korea's imports of each product at risk, and the
 *  share of world exports of the stage below that is put at risk through Korea. */
function koreaTiles(sc: ScenarioProps, lang: Lang) {
  const kor = sc.names.kor;
  const shocked = sc.suppliers[0]?.members ?? [];
  const only = sc.kind === 'tariff' && sc.importer != null ? [sc.importer] : sc.importerSet?.members ?? null;
  const bloc = (sc.kind === 'cut_supplier' || sc.kind === 'cut_output') && shocked.length > 1 ? shocked : null;
  const exclude = sc.kind === 'close_route' ? shocked : bloc;
  const out: { label: string; value: string; meta: string }[] = [];
  const pct = (v: number) => formatShare(v, lang, { decimals: v < 0.01 && v > 0 ? 2 : 1 });
  if (sc.kind === 'tariff') {
    // Korea as one of the suppliers that would fill the gap.
    const r = runCut(sc.products[0].table, shocked, sc.cut, { only })[0];
    const f = r?.fill.find((x) => x.i === kor);
    if (r && f) out.push({ label: t(lang, 'cases.kor.tariffLabel', { importer: sc.names.names[r.i] }), value: pct(f.share + f.take), meta: t(lang, 'cases.kor.tariffMeta', { now: pct(f.share), cut: Math.round(sc.cut * 100) }) });
    return out;
  }
  for (const pr of sc.products) {
    const r = runCut(pr.table, shocked, sc.cut, { only, exclude }).find((x) => x.i === kor);
    out.push(r
      ? { label: t(lang, 'cases.kor.riskLabel', { product: pr.label }), value: pct(r.risk), meta: t(lang, 'cases.kor.riskMeta', { cut: Math.round(sc.cut * 100), p: sc.period }) }
      : { label: t(lang, 'cases.kor.riskLabel', { product: pr.label }), value: '–', meta: t(lang, 'cases.kor.absent') });
  }
  const base = sc.products.find((x) => x.base);
  if (base) {
    const exp = new Map(runCut(base.table, shocked, sc.cut, { only, exclude }).map((r) => [r.i, r.risk]));
    for (const d of sc.down) {
      if (d.use && d.use.share == null) continue;
      const res = passDown(d.table, exp, d.use?.share ?? 1, sc.kind === 'close_route' ? { members: shocked, cut: sc.cut } : null, bloc);
      const k = res.rows.find((x) => x.j === kor);
      if (k?.passed != null) out.push({ label: t(lang, 'cases.kor.downLabel', { product: d.label }), value: pct(k.passed), meta: t(lang, 'cases.kor.downMeta', { x: pct(k.x) }) });
    }
  }
  return out.slice(0, 6);
}

export default async function CasePage({ params }: { params: Params }) {
  const [lang, { case: id }] = await Promise.all([langOf(params), params]);
  const x = await load(id);
  if (!x) notFound();
  const { idx, doc, meta, events, chains: chainList } = x;
  const book = new Book(meta);
  const ctx = { lang, book, id: doc.id, completeM: meta.complete.M, cite: book.citeMonths(lang, monthsIn(doc)) };
  const evs = doc.events.map((num) => ({ num, ev: events?.events.find((e) => e.num === num) ?? null }));
  const reading = idx.further_reading.filter((r) => r.case === doc.id);
  const scen = await scenarioProps(doc, book, lang);
  // Asia, n.e.s. (Comtrade partner 490) as the scenario's supplier or among its exporters: say what it is
  const nesI = meta.nodes.findIndex((n) => n.nes);
  const nesScen = nesI >= 0 && (doc.scenario?.supplier === meta.nodes[nesI].id
    || (doc.scenario_data?.base?.exporters ?? []).some(([i]: [number, number]) => i === nesI))
    ? `${book.node(nesI, lang)}: ${netString(lang, 'nesNote')}` : '';
  const built = await buildDate();
  const order = idx.cases.map((c) => c.id);
  const k = order.indexOf(doc.id);
  const prev = k > 0 ? idx.cases[k - 1] : null, next = k < order.length - 1 ? idx.cases[k + 1] : null;
  const chains = [...new Set([...(doc.network.products ?? []), doc.scenario?.product ?? ''].map((p) => book.stageOf(p)?.chain).filter((c): c is string => !!c))];

  const kicker = [
    t(lang, 'cases.card.num', { n: doc.num }),
    evs.length ? t(lang, evs.length > 1 ? 'cases.card.events' : 'cases.card.event', { list: evs.map((e) => e.num).join(', ') }) : t(lang, 'cases.card.allChains'),
  ].join(' · ');

  return (
    <div className="page page--doc st-page" lang={lang}>
      <JsonLd data={articleLd(lang, { headline: doc.title[lang], description: doc.question[lang], path: `/cases/${doc.id}`, modified: built, section: t(lang, 'common.nav.cases') })} />
      <TrailHead kicker={kicker} title={doc.title[lang]} dek={doc.question[lang]}
        counts={[
          { value: doc.papers.length, label: t(lang, 'cases.count.papers') },
          { value: doc.measured.length, label: t(lang, 'cases.count.measures') },
          { value: t(lang, `cases.kind.${doc.scenario.kind}`), label: t(lang, 'cases.count.scenario') },
        ]} />

      <nav className="st-related" aria-label={t(lang, 'cases.related')}>
        {evs.map(({ num, ev }) => ev ? (
          <a key={num} href={`/${lang}/events/${ev.id}`} className="st-related__link">
            <span className="st-diamond" aria-hidden>{num}</span>{ev.title[lang]}
          </a>
        ) : <span key={num} className="st-related__link"><span className="st-diamond" aria-hidden>{num}</span>{t(lang, 'cases.card.event', { list: num })}</span>)}
        {chains.map((c) => (
          <a key={c} href={`/${lang}/chains/${c}`} className="st-related__link st-related__link--chain">
            {t(lang, 'cases.chainLink', { name: chainList.find((ch) => ch.id === c)?.[lang] ?? c })}
          </a>
        ))}
      </nav>

      <section className="st-sec" aria-labelledby="papers">
        <h2 id="papers">{t(lang, 'cases.sec.papers')}</h2>
        <div className="st-papers">
          {doc.papers.map((p) => <PaperCard key={p.ref ?? p.title} paper={p} lang={lang} />)}
        </div>
      </section>

      <section className="st-sec" aria-labelledby="data">
        <h2 id="data">{t(lang, 'cases.sec.data')}</h2>
        <p className="st-sec__lede">{t(lang, 'cases.data.lede')}</p>
        {doc.network.plan_numbers ? (
          <aside className="st-plan">
            <p className="lr-card__h">{t(lang, 'cases.plan.label')}</p>
            <p>{doc.network.plan_numbers[lang]}</p>
            {doc.network.plan_numbers.note ? <p className="lr-caption">{doc.network.plan_numbers.note[lang]}</p> : null}
            <p className="lr-caption">{t(lang, 'cases.plan.note')}</p>
          </aside>
        ) : null}
        {lang === 'en' && readerNote(doc.network.note) ? <Notice tone="info" title={t(lang, 'cases.data.noteTitle')}>{readerNote(doc.network.note)}</Notice> : null}
        <div className="st-figs">
          {doc.measured.map((m, i) => <MeasureFigure key={i} m={m} ctx={ctx} n={i} />)}
        </div>
      </section>

      <section className="st-sec" aria-labelledby="scenario">
        <h2 id="scenario">{t(lang, 'cases.sec.scenario')}</h2>
        {scen ? <Scenario {...scen} /> : (
          <p className="st-sec__lede">{doc.scenario[lang] ?? doc.scenario.en}</p>
        )}
        {nesScen ? <p className="lr-caption">{nesScen}</p> : null}
        {doc.scenario_data?.error ? <Notice tone="warning" title={t(lang, 'cases.scen.failedTitle')}>{t(lang, 'cases.scen.failed')}</Notice> : null}
      </section>

      <TrailRule />

      {/* measured for Korea alone, when the case was planned: shown with ?focus=KOR only */}
      <FocusOnly iso="KOR">
      <section className="st-sec st-sec--text" aria-labelledby="korea">
        <h2 id="korea">{t(lang, 'cases.sec.korea')}</h2>
        {scen && koreaTiles(scen, lang).length ? (
          <div className="st-kor">
            <p className="lr-card__h">{t(lang, 'cases.kor.tilesH')}</p>
            <StatTiles>
              {koreaTiles(scen, lang).map((k, i) => <StatTile key={i} label={k.label} value={k.value} meta={k.meta} />)}
            </StatTiles>
          </div>
        ) : null}
        <p className="lr-prose">{doc.korea[lang]}</p>
      </section>
      </FocusOnly>

      <section className="st-sec st-sec--text" aria-labelledby="limits">
        <h2 id="limits">{t(lang, 'cases.sec.limits')}</h2>
        <p className="lr-prose">{doc.limits[lang]}</p>
      </section>

      {reading.length ? (
        <section className="st-sec st-sec--text" aria-labelledby="reading">
          <h2 id="reading">{t(lang, 'cases.sec.reading')}</h2>
          <ul className="st-reading">{reading.map((r) => <ReadingItem key={r.ref ?? r.title} r={r} lang={lang} />)}</ul>
        </section>
      ) : null}

      <nav className="st-pager" aria-label={t(lang, 'cases.pager')}>
        {prev ? <a href={`/${lang}/cases/${prev.id}`}>← {t(lang, 'cases.card.num', { n: prev.num })} · {prev.title[lang]}</a> : <span />}
        <a href={`/${lang}/cases`}>{t(lang, 'cases.all')}</a>
        {next ? <a href={`/${lang}/cases/${next.id}`}>{t(lang, 'cases.card.num', { n: next.num })} · {next.title[lang]} →</a> : <span />}
      </nav>
    </div>
  );
}
