import { eventDates } from '@/components/stories/names';
import type { EventsIndex } from '@/components/stories/types';
import { readData } from '@/lib/data';
import { formatDate, isLang, LANGS, t, type Lang } from '@/lib/i18n';
import { ogImage, OG_SIZE, OG_TYPE } from '@/lib/og';

// One card per event and language: number and kind as the kicker, the title, the dates as the foot. Static for the
// events in events/index.json.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const size = OG_SIZE;
export const contentType = OG_TYPE;
export const alt = 'trade-flow event';

export async function generateStaticParams() {
  const idx = await readData<EventsIndex>('events/index.json');
  return LANGS.flatMap((lang) => idx.events.map((e) => ({ lang, event: e.id })));
}

export default async function Image({ params }: { params: Promise<{ lang: string; event: string }> }) {
  const { lang: raw, event: id } = await params;
  const lang: Lang = isLang(raw) ? raw : 'en';
  const idx = await readData<EventsIndex>('events/index.json');
  const e = idx.events.find((x) => x.id === id);
  return ogImage({
    lang,
    kicker: e ? `${t(lang, 'events.num', { n: e.num })} · ${t(lang, `events.kind.${e.kind}` as Parameters<typeof t>[1])}` : t(lang, 'common.nav.events'),
    title: e ? e.title[lang] : id,
    foot: e ? eventDates(e.start, e.end, e.ongoing, lang, formatDate) : '',
  });
}
