import type { Metadata } from 'next';
import { TrailHead, type DataRow } from '@larch/ui';
import { formatDate, formatPercentChange, formatUSD, t, type Lang } from '@/lib/i18n';
import { readData } from '@/lib/data';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import { countWord } from '@/lib/words';
import { Figure } from '@/components/stories/Figure';
import { LineChart, periodTicks, type ChartEvent } from '@/components/stories/LineChart';
import { eventDates, monthOf, periodLabel, tickLabel } from '@/components/stories/names';
import type { EventIndexEntry, EventsIndex } from '@/components/stories/types';
import '../cases/stories.css';

/** The index title with the count from the data ("Fourteen shocks …" / "14개 사건"). */
function indexTitle(lang: Lang, n: number): string {
  return t(lang, 'events.index.title', { n: lang === 'ko' ? n : countWord(n, lang, true) });
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const n = await readData<EventsIndex>('events/index.json').then((d) => d.events.length).catch(() => 0);
  return pageMeta(lang, { path: '/events', title: indexTitle(lang, n), description: t(lang, 'events.index.dek') });
}

function nextMonth(p: number): number {
  return p % 100 === 12 ? (Math.floor(p / 100) + 1) * 100 + 1 : p + 1;
}

/** Events as diamonds on the strip: those that began inside it, staggered onto a second row when two are close. */
function diamonds(events: EventIndexEntry[], lo: number, hi: number, lang: Lang): ChartEvent[] {
  const out: ChartEvent[] = [];
  let last = -Infinity, row = 0;
  for (const e of events) {
    const m = monthOf(e.start);
    if (m < lo || m > hi) continue;
    const v = Math.floor(m / 100) * 12 + (m % 100);
    row = v - last < 8 ? 1 - row : 0;
    last = v;
    out.push({ t: m, label: e.num, title: `${t(lang, 'events.num', { n: e.num })}: ${e.title[lang]}`, href: `/${lang}/events/${e.id}`, row });
  }
  return out;
}

function EventStrip({ idx, lang }: { idx: EventsIndex; lang: Lang }) {
  const s = idx.strip;
  const N = s.economies;
  const ct = s.complete_to;
  const complete = s.t.map((p, i) => (p <= ct ? s.imports[i] : null));
  // After the last complete month: those of them that have filed, while at least half have; joined at the last
  // complete month so the line does not break.
  const partial = s.t.map((p, i) => (p === ct || (p > ct && s.filed[i] >= N / 2) ? s.imports[i] : null));
  const pos = new Map(s.t.map((p, i) => [p, i]));
  const yoy = s.t.map((p, i) => {
    const j = pos.get(p - 100);
    return j != null && s.filed[i] === s.filed[j] && p <= ct ? s.imports[i] / s.imports[j] - 1 : null;
  });
  const lastFiled = s.t.map((p, i) => [p, s.filed[i]] as const).filter(([p, n]) => p > ct && n >= N / 2).pop();
  const lowI = complete.reduce<number>((a, v, i) => (v != null && (a < 0 || v < (complete[a] as number)) ? i : a), -1);
  const ctI = pos.get(ct) ?? s.t.length - 1;
  const usd = (v: number) => formatUSD(v, lang, { decimals: 2 });
  const reading = t(lang, 'events.strip.reading', {
    low: periodLabel(s.t[lowI], lang), lv: usd(s.imports[lowI]), last: periodLabel(ct, lang), v: usd(s.imports[ctI]),
    c: formatPercentChange(yoy[ctI], lang, { decimals: 1 }),
  });
  const rows: DataRow[] = s.t.map((p, i) => ({
    id: String(p),
    cells: { t: periodLabel(p, lang), v: formatUSD(s.imports[i], lang, { decimals: 1 }), yoy: formatPercentChange(yoy[i], lang, { decimals: 1 }), n: s.filed[i] },
    sort: { t: p, v: s.imports[i], yoy: yoy[i], n: s.filed[i] },
  }));
  return (
    <Figure lang={lang} wide id="strip"
      title={t(lang, 'events.strip.title', { n: N, from: periodLabel(s.from, lang), to: periodLabel(s.t[s.t.length - 1], lang) })}
      reading={reading}
      notes={[t(lang, 'events.strip.note', { p: periodLabel(ct, lang) })]}
      source={t(lang, 'events.strip.source')}
      table={{
        columns: [
          { key: 't', label: t(lang, 'cases.col.period'), sortable: true },
          { key: 'v', label: t(lang, 'events.strip.col.imports'), num: true, sortable: true },
          { key: 'yoy', label: t(lang, 'events.strip.col.yoy'), num: true, sortable: true },
          { key: 'n', label: t(lang, 'events.strip.col.filed'), num: true, sortable: true },
        ],
        rows,
        // Changes and counts only (the levels are on screen and in the table).
        csv: [[t(lang, 'cases.col.period'), t(lang, 'events.strip.col.yoyFrac'), t(lang, 'events.strip.col.filed')], ...s.t.map((p, i) => [p, yoy[i], s.filed[i]])],
        filename: 'events-strip',
      }}>
      <LineChart t={s.t} height={300} ariaLabel={reading}
        format={(v) => formatUSD(v, lang, { decimals: 1 })}
        ticks={periodTicks(s.t, 9, (p) => tickLabel(p, lang, false))}
        series={[
          { id: 'complete', label: t(lang, 'events.strip.complete', { n: N }), values: complete, colour: 'viz-focus' },
          { id: 'partial', label: t(lang, 'events.strip.partial'), values: partial, colour: 'viz-context' },
        ]}
        legend="below"
        band={{ from: nextMonth(ct), label: lastFiled ? t(lang, 'events.strip.band', { n: lastFiled[1], N, p: periodLabel(lastFiled[0], lang) }) : t(lang, 'cases.partial') }}
        events={diamonds(idx.events, s.t[0], s.t[s.t.length - 1], lang)} />
    </Figure>
  );
}

export default async function Events({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await langOf(params);
  const idx = await readData<EventsIndex>('events/index.json');
  const ongoing = idx.events.filter((e) => e.ongoing).length;
  const sources = await Promise.all(idx.events.map((e) => readData<{ sources: unknown[] }>(`events/${e.id}.json`).then((d) => d.sources.length).catch(() => 0)));
  return (
    <div className="page page--doc st-page">
      <TrailHead kicker={t(lang, 'common.nav.events')} title={indexTitle(lang, idx.events.length)} dek={t(lang, 'events.index.dek')}
        counts={[
          { value: idx.events.length, label: t(lang, 'events.count.events') },
          { value: ongoing, label: t(lang, 'events.count.ongoing') },
          { value: sources.reduce((a, b) => a + b, 0), label: t(lang, 'events.count.sources') },
        ]} />
      <EventStrip idx={idx} lang={lang} />
      <section className="st-sec" aria-labelledby="list">
        <h2 id="list">{t(lang, 'events.list.title')}</h2>
        <ol className="st-evlist">
          {idx.events.map((e) => (
            <li key={e.id} className="st-ev">
              <span className="st-diamond st-diamond--lg" aria-hidden>{e.num}</span>
              <div className="st-ev__body">
                <p className="st-ev__meta">
                  <span>{eventDates(e.start, e.end, e.ongoing, lang, formatDate)}</span>
                  <span> · {t(lang, `events.kind.${e.kind}` as Parameters<typeof t>[1])}</span>
                </p>
                <h3 className="st-ev__title"><a href={`/${lang}/events/${e.id}`}>{e.title[lang]}</a></h3>
                <p className="st-ev__dek">{e.dek[lang]}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
