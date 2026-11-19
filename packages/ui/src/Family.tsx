import type { ReactNode } from 'react';
import type { Lang } from './format';
import { cx } from './util';

// The datasteg flow-site family: the footer strip above the site's own footer line
// and the "Other sites" item of the masthead, both showing the same three cards. The data (names, roles, hosts,
// link templates) is family/family.json at the repository root, copied into the app at deploy; the app passes it
// in, resolves the context link of each card (the same economy, event or flow on the sibling) and marks itself.
// Server-safe: FamilyMenu is a <details>, so it opens without scripts.

export interface FamilySite {
  id: string;
  host: string;
  name: string;
  prefix?: string;
  role: Record<Lang, string>;
  links: Record<string, string>;
}

export interface FamilyData {
  kicker: Record<Lang, string>;
  menu: Record<Lang, string>;
  current: Record<Lang, string>;
  open: Record<Lang, string>;
  sites: FamilySite[];
}

/** One card's link: where it goes on the sibling and what it says ("Korea in money-flow"). */
export interface FamilyLink { href: string; label: string }

/** A link template of family.json filled in: "/{lang}/c/{iso3}" → "/en/c/KOR". Unknown keys stay as written. */
export function fillTemplate(tpl: string, vars: Record<string, string | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** The absolute URL of a site's link template. */
export function familyHref(site: FamilySite, key: string, vars: Record<string, string | undefined>): string {
  return site.host + fillTemplate(site.links[key] ?? site.links.home ?? '/{lang}', vars);
}

export function FamilyCards({ lang, family, current, links, className }: {
  lang: Lang;
  family: FamilyData;
  /** The id of this site, marked "You are here". */
  current: string;
  /** The context link per site id; a site without one gets "Open <name>" to its home page. */
  links: Record<string, FamilyLink | undefined>;
  className?: string;
}) {
  return (
    <ul className={cx('lr-family__cards', className)}>
      {family.sites.map((s) => {
        const here = s.id === current;
        const link = links[s.id] ?? { href: familyHref(s, 'home', { lang }), label: family.open[lang].replace('{name}', s.name) };
        return (
          <li key={s.id} className={cx('lr-family__card', here && 'is-current')} aria-current={here ? 'true' : undefined}>
            <p className="lr-family__name">
              <span lang="en">{s.name}</span>
              {here ? <span className="lr-family__here">{family.current[lang]}</span> : null}
            </p>
            <p className="lr-family__role">{s.role[lang]}</p>
            {here ? null : <a className="lr-family__link" href={link.href}>{link.label}</a>}
          </li>
        );
      })}
    </ul>
  );
}

/** The footer strip: kicker and the three cards. Place it above the Footer on every page. */
export function FamilyStrip(p: { lang: Lang; family: FamilyData; current: string; links: Record<string, FamilyLink | undefined>; children?: ReactNode }) {
  return (
    <section className="lr-family" aria-label={p.family.kicker[p.lang]}>
      <div className="lr-family__inner">
        <p className="lr-kicker">{p.family.kicker[p.lang]}</p>
        <FamilyCards lang={p.lang} family={p.family} current={p.current} links={p.links} />
        {p.children}
      </div>
    </section>
  );
}

/** The masthead item: a <details> whose panel holds the same cards. `detailsRef` lets the app close it on an outside
 *  click; without scripts it still opens and closes on its summary. */
export function FamilyMenu(p: {
  lang: Lang; family: FamilyData; current: string; links: Record<string, FamilyLink | undefined>;
  detailsRef?: React.Ref<HTMLDetailsElement>; className?: string;
}) {
  return (
    <details ref={p.detailsRef} className={cx('lr-family-menu', p.className)}>
      <summary>{p.family.menu[p.lang]}</summary>
      <div className="lr-family-menu__panel">
        <p className="lr-kicker">{p.family.kicker[p.lang]}</p>
        <FamilyCards lang={p.lang} family={p.family} current={p.current} links={p.links} />
      </div>
    </details>
  );
}
