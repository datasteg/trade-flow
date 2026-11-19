'use client';
// The family strip and the "Other sites" menu on this site: the Larch components with
// the context links resolved from the page. A chain page or explorer with a selected economy links to that economy
// on money-flow and global-network; the explorer's flow card to the pair page; an event page to its shock replay when
// global-network has one (events/index.json `replay`), else the dollar channel; every other page to the home pages.
// The reader's language stays in the path; same tab; no UTM. The server renders the home links; the page's
// selection arrives through lib/pageContext (set by the Explorer and the chain page) and ?focus= after hydration.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FamilyMenu, FamilyStrip, familyHref, type FamilyData, type FamilyLink } from '@larch/ui';
import family from '@/lib/family.json';
import { t, type Lang } from '@/lib/i18n';
import { usePageContext } from '@/lib/pageContext';

export interface FamilyEvent { id: string; en: string; ko: string; replay: boolean }

const DATA = family as unknown as FamilyData;
const SELF = 'trade-flow';

/** ?focus=ISO3 of the address, read after mount (the pages are static, so the server cannot see it). */
function useFocusParam(path: string): string | null {
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get('focus')?.toUpperCase() ?? '';
      setFocus(/^[A-Z]{3}$/.test(v) ? v : null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [path]);
  return focus;
}

function useFamilyLinks(lang: Lang, events: FamilyEvent[]): Record<string, FamilyLink | undefined> {
  const path = usePathname() ?? `/${lang}`;
  const ctx = usePageContext();
  const focusParam = useFocusParam(path);
  const seg = path.split('/').slice(2);
  const site = (id: string) => DATA.sites.find((s) => s.id === id);
  const gn = site('global-network'), mf = site('money-flow');
  const links: Record<string, FamilyLink | undefined> = {};
  if (!gn || !mf) return links;
  const inSite = (name: string, s: { name: string }) => t(lang, 'common.family.in', { name, site: s.name });

  if (ctx.flow) {
    const { a, b, aName, bName } = ctx.flow;
    links['global-network'] = { href: familyHref(gn, 'pair', { lang, a, b }), label: t(lang, 'common.family.flowIn', { a: aName, b: bName, site: gn.name }) };
    return links;
  }
  const focus = ctx.focus ?? (focusParam ? { iso: focusParam, name: focusParam } : null);
  if (focus && ['chains', 'explore', 'explore-monthly', 'cases'].includes(seg[0] ?? '')) {
    links['global-network'] = { href: familyHref(gn, 'economy_trade', { lang, iso3: focus.iso }), label: inSite(focus.name, gn) };
    links['money-flow'] = { href: familyHref(mf, 'economy', { lang, iso3: focus.iso }), label: inSite(focus.name, mf) };
    return links;
  }
  if (seg[0] === 'events' && seg[1]) {
    const ev = events.find((e) => e.id === seg[1]);
    links['global-network'] = ev?.replay
      ? { href: familyHref(gn, 'shock', { lang, event: ev.id }), label: inSite(ev[lang], gn) }
      : { href: familyHref(gn, 'dollar', { lang }), label: t(lang, 'common.family.dollarIn', { site: gn.name }) };
  }
  return links;
}

export function FamilyStripClient({ lang, events }: { lang: Lang; events: FamilyEvent[] }) {
  const links = useFamilyLinks(lang, events);
  return <FamilyStrip lang={lang} family={DATA} current={SELF} links={links} />;
}

/** The masthead item; closes on a click outside and on Escape (it is a <details>, so it works without this too). */
export function FamilyMenuClient({ lang, events }: { lang: Lang; events: FamilyEvent[] }) {
  const links = useFamilyLinks(lang, events);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
  }, []);
  return <FamilyMenu lang={lang} family={DATA} current={SELF} links={links} detailsRef={ref} />;
}
