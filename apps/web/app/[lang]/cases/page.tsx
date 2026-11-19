import type { Metadata } from 'next';
import { TrailHead } from '@larch/ui';
import { t, type Lang } from '@/lib/i18n';
import { readData } from '@/lib/data';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import { countWord } from '@/lib/words';
import { defaultStage, stageOptions, stageParam, TOOL_PATH } from '@/lib/cutSupplier';
import type { CasesIndex, EventsIndex } from '@/components/stories/types';
import './stories.css';

/** The index title with the count from the data ("Nine research findings …" / "아홉 연구의 결론 …"). */
function indexTitle(lang: Lang, n: number): string {
  return t(lang, 'cases.index.title', { n: countWord(n, lang, true) });
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const n = await readData<CasesIndex>('cases/index.json').then((d) => d.cases.length).catch(() => 0);
  return pageMeta(lang, { path: '/cases', title: indexTitle(lang, n), description: t(lang, 'cases.index.dek') });
}

export default async function Cases({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langOf(params);
  const [idx, events] = await Promise.all([
    readData<CasesIndex>('cases/index.json'),
    readData<EventsIndex>('events/index.json').catch(() => null),
  ]);
  const papers = idx.cases.reduce((a, c) => a + c.papers, 0);
  const linked = new Set(idx.cases.flatMap((c) => c.events));
  // the tool's default view: the first chain's chokepoint stage and its largest exporter
  const tool = await stageOptions().then(({ options, chains, index }) => {
    const st = defaultStage(options);
    const chain = chains.find((c) => c.id === st.chain);
    const year = index.chains.find((c) => c.id === st.chain)?.year;
    const top = chain?.stages.find((s) => s.key === st.key)?.years[String(year)]?.top_exporters[0];
    return { stage: stageParam(st), exporter: top ? top[0] : null };
  }).catch(() => null);
  const meta = tool?.exporter != null ? await readData<{ nodes: { id: string }[] }>('meta.json').catch(() => null) : null;
  const toolHref = `/${lang}${TOOL_PATH}${tool ? `?stage=${tool.stage}${meta && tool.exporter != null ? `&exporter=${meta.nodes[tool.exporter]?.id ?? ''}` : ''}` : ''}`;
  return (
    <div className="page page--doc st-page">
      <TrailHead kicker={t(lang, 'common.nav.cases')} title={indexTitle(lang, idx.cases.length)} dek={t(lang, 'cases.index.dek')}
        counts={[
          { value: idx.cases.length, label: t(lang, 'cases.count.cases') },
          { value: papers, label: t(lang, 'cases.count.papers') },
          { value: linked.size, label: t(lang, 'cases.count.events') },
        ]} />
      <ol className="st-cards">
        {idx.cases.map((c) => {
          const evs = c.events.map((num) => ({ num, ev: events?.events.find((e) => e.num === num) ?? null }));
          return (
            <li key={c.id} className="st-card">
              <p className="lr-kicker">{t(lang, 'cases.card.num', { n: c.num })}</p>
              <h2 className="st-card__title"><a href={`/${lang}/cases/${c.id}`}>{c.title[lang]}</a></h2>
              <p className="st-card__q">{c.question[lang]}</p>
              <p className="st-card__meta">
                {evs.length ? evs.map(({ num, ev }) => (
                  ev ? <a key={num} href={`/${lang}/events/${ev.id}`} className="st-card__event" title={ev.title[lang]}>
                    <span className="st-diamond" aria-hidden>{num}</span>{ev.title[lang]}
                  </a> : <span key={num} className="st-card__event"><span className="st-diamond" aria-hidden>{num}</span>{t(lang, 'cases.card.event', { list: num })}</span>
                )) : <span className="st-card__event">{t(lang, 'cases.card.allChains')}</span>}
                <span className="st-card__papers">{t(lang, c.papers === 1 ? 'cases.card.paper' : 'cases.card.papers', { n: c.papers })}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <section className="st-sec" aria-labelledby="tools">
        <h2 id="tools">{t(lang, 'cases.tools.h')}</h2>
        <ul className="st-cards">
          <li className="st-card">
            <p className="lr-kicker">{t(lang, 'cases.kind.cut_supplier')}</p>
            <h3 className="st-card__title"><a href={toolHref}>{t(lang, 'cases.tool.title')}</a></h3>
            <p className="st-card__tool">{t(lang, 'cases.tools.cutDek')}</p>
            <p className="st-card__meta"><a className="st-card__event" href={toolHref}>{t(lang, 'cases.tools.open')} →</a></p>
          </li>
        </ul>
      </section>
      <aside className="st-gaps">
        <h2>{t(lang, 'cases.gaps.title')}</h2>
        <p className="lr-prose">{idx.gaps[lang]}</p>
      </aside>
    </div>
  );
}
