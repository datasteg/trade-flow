'use client';
// The datasteg bar (family/DatastegBar.tsx, 9 Nov 2026): one thin band above every public site's own masthead, the
// same on www, articles, money-flow, trade-flow, global-network and open-research. It names every site with its mark,
// marks the one you are on, keeps the reader's language and, on an economy page, sends the siblings that have one to
// the same economy. It replaces the per-site "Other sites" menus. Source: family/ (sync.mjs copies this file,
// datasteg-bar.css, marks.json and family.json into each app; tests/test_family_sync.py fails on a stale copy).
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import family from '@/lib/family.json';
import marks from '@/lib/marks.json';
import './datasteg-bar.css';

type Lang = 'en' | 'ko';
type Site = { id: string; host: string; name: string; role: Record<Lang, string>; links: Record<string, string>; economy_from?: { path?: string; query?: string } };
type Family = { bar: { label: Record<Lang, string>; context: Record<Lang, string> }; current: Record<Lang, string>; sites: Site[]; articles: Site; portal: Site };
type Part = [string, Record<string, string | number>];

const F = family as unknown as Family;
const M = marks as unknown as { colours: Record<string, { accent: string; deep: string }>; marks: Record<string, Part[]> };
/** The bar's order: the portal, then the products in the portal's order (articles, then the flow sites). */
const SITES: Site[] = [F.portal, F.articles, ...F.sites];

/** One site's mark, 24-px grid. Ink follows the text colour; accent and deep are the site's signature colours. */
export function SiteMark({ id, size = 18, className }: { id: string; size?: number; className?: string }) {
  const parts = M.marks[id];
  const c = M.colours[id];
  if (!parts || !c) return null;
  const col = (k: string | number) => (k === 'ink' ? 'currentColor' : k === 'accent' ? c.accent : c.deep);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {parts.map(([shape, a], i) => {
        const p: Record<string, string | number> = {};
        for (const k of ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r']) if (a[k] !== undefined) p[k] = a[k];
        const fill = a.fill !== undefined ? col(a.fill) : 'none';
        const stroke = a.stroke !== undefined ? col(a.stroke) : undefined;
        const props = {
          key: i, ...p, fill, stroke,
          strokeWidth: stroke ? (a.sw ?? 1.5) : undefined,
          strokeLinecap: stroke ? ((a.cap as 'round' | 'butt') ?? 'round') : undefined,
          strokeLinejoin: stroke ? ('round' as const) : undefined,
          opacity: a.opacity, transform: a.rot ? `rotate(${a.rot})` : undefined,
        };
        if (shape === 'rect') return <rect {...props} />;
        if (shape === 'circle') return <circle {...props} />;
        if (shape === 'ellipse') return <ellipse {...props} />;
        return <path {...props} />;
      })}
    </svg>
  );
}

/** The economy in view: from the path (money-flow /e/KOR, global-network and open-research /c/KOR) or, on
 *  trade-flow, from ?focus=KOR. */
function economyOf(site: Site | undefined, path: string, search: string): string | undefined {
  const from = site?.economy_from;
  if (!from) return undefined;
  if (from.path) { const m = new RegExp(from.path).exec(path); return m?.[1]?.toUpperCase(); }
  if (from.query) { const v = new URLSearchParams(search).get(from.query); return v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined; }
  return undefined;
}

export function DatastegBar({ lang, site }: { lang: Lang; site: string }) {
  const path = usePathname() ?? `/${lang}`;
  const [search, setSearch] = useState('');
  const row = useRef<HTMLUListElement>(null);
  useEffect(() => { setSearch(window.location.search); }, [path]);
  // on a narrow screen the row scrolls sideways: bring the current site into view
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && row.current && row.current.scrollWidth > row.current.clientWidth) row.current.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, []);
  const iso3 = economyOf(SITES.find((s) => s.id === site), path, search);
  return (
    <nav className="dsb" aria-label={F.bar.label[lang]} data-site={site}>
      <ul className="dsb-row" ref={row}>
        {SITES.map((s) => {
          const here = s.id === site;
          const ctx = !here && iso3 && s.links.economy ? s.links.economy.replace('{iso3}', iso3) : undefined;
          const href = `${s.host}${(ctx ?? s.links.home ?? '/{lang}').replace('{lang}', lang)}`;
          const title = here ? `${F.current[lang]}: ${s.role[lang]}` : ctx ? F.bar.context[lang].replace('{name}', s.name) : s.role[lang];
          return (
            <li key={s.id} className={s.id === 'www' ? 'dsb-home' : undefined}>
              <a href={here ? `${s.host}${(s.links.home ?? '/{lang}').replace('{lang}', lang)}` : href} title={title}
                aria-current={here ? 'true' : undefined} data-sig={s.id} lang={lang === 'ko' ? 'en' : undefined}>
                <SiteMark id={s.id} size={s.id === 'www' ? 18 : 16} />
                <span>{s.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
