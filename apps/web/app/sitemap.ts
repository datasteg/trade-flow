import type { MetadataRoute } from 'next';
import { readData } from '@/lib/data';
import { LANGS } from '@/lib/i18n';
import { buildDate, SITE_URL } from '@/lib/seo';
import { TOOL_PATH } from '@/lib/cutSupplier';

// Both languages, built from the same index files the pages read: home, the two explorers, the chains, events and
// cases with their indexes, the supplier tool, method and checks. lastModified is the data build date.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [chains, events, cases, built] = await Promise.all([
    readData<{ chains: { id: string }[] }>('chains/index.json').then((d) => d.chains.map((c) => c.id)).catch(() => [] as string[]),
    readData<{ events: { id: string }[] }>('events/index.json').then((d) => d.events.map((e) => e.id)).catch(() => [] as string[]),
    readData<{ cases: { id: string }[] }>('cases/index.json').then((d) => d.cases.map((c) => c.id)).catch(() => [] as string[]),
    buildDate(),
  ]);
  const lastModified = new Date(built);
  const paths: [string, number][] = [
    ['', 1], ['/explore', 0.9], ['/explore-monthly', 0.9],
    ['/chains', 0.8], ...chains.map((id): [string, number] => [`/chains/${id}`, 0.8]),
    ['/events', 0.8], ...events.map((id): [string, number] => [`/events/${id}`, 0.7]),
    ['/cases', 0.8], ...cases.map((id): [string, number] => [`/cases/${id}`, 0.7]),
    [TOOL_PATH, 0.6], ['/method', 0.6], ['/method/checks', 0.5],
  ];
  return LANGS.flatMap((lang) => paths.map(([p, priority]) => ({
    url: `${SITE_URL}/${lang}${p}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority,
    alternates: { languages: { en: `${SITE_URL}/en${p}`, ko: `${SITE_URL}/ko${p}`, 'x-default': `${SITE_URL}/en${p}` } },
  })));
}
