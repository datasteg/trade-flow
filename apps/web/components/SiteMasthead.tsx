'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Masthead, SECTIONS, sectionLabel, ui, type Section } from '@larch/ui';
import { type FamilyEvent } from '@/components/Family';
import { SiteMark } from '@/components/DatastegBar';
import type { Lang } from '@/lib/i18n';

/** The Larch Masthead with the site mark (a larch, from the datasteg family icon set), the current section marked
 *  (from the path) and a
 *  language switch that changes only the /en or /ko segment without a reload, keeping the hash and the scroll position. Below 760px the nav moves to a
 *  scrolling row under the bar (site.css). */
export function SiteMasthead({ lang }: { lang: Lang; events?: FamilyEvent[] }) {
  const path = usePathname() ?? `/${lang}`;
  const router = useRouter();
  const first = path.split('/')[2] ?? '';
  const active = (SECTIONS as readonly string[]).includes(first) ? (first as Section) : undefined;
  return (
    <div className="site-header">
      {/* the sibling sites are in the datasteg bar above (family/DatastegBar.tsx), which replaced the "Other sites" item */}
      <Masthead lang={lang} active={active} mark={<SiteMark id="trade-flow" size={24} className="ds-wordmark-mark" />} navigate={(url) => router.push(url, { scroll: false })} />
      <nav className="site-subnav" aria-label={ui(lang, 'nav.label')}>
        {SECTIONS.map((s) => (
          <a key={s} href={`/${lang}/${s}`} aria-current={s === active ? 'page' : undefined}>{sectionLabel(lang, s)}</a>
        ))}
      </nav>
    </div>
  );
}
