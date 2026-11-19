import type { ReactNode } from 'react';
import type { Lang } from './format';
import { LanguageSwitch } from './LanguageSwitch';
import { Marker } from './marker';
import { SECTIONS, ui, type Section } from './strings';
import { ThemeToggle } from './ThemeToggle';
import { cx } from './util';

/** "trade-flow" after a trail marker; Latin letters on Korean pages too (marked lang="en" there). */
export function Wordmark({ lang, href, size = 'md', mark }: { lang: Lang; href?: string; size?: 'md' | 'sm'; mark?: ReactNode }) {
  return (
    <a className="lr-wordmark" href={href ?? `/${lang}`}>
      {mark ?? <Marker size={size} />}
      <span lang={lang === 'ko' ? 'en' : undefined}>{ui(lang, 'wordmark')}</span>
    </a>
  );
}

/** The top bar: wordmark, Explorer · Chains · Events · Cases · Method, 한/EN and the theme toggle (56px).
 *  `active` marks the current section (aria-current="page"). `navigate` is handed to the LanguageSwitch. */
export function Masthead({ lang, active, navigate, className, mark, children }: {
  lang: Lang;
  /** The site mark before the wordmark (the datasteg family icon set); the trail marker when absent. */
  mark?: ReactNode;
  active?: Section;
  navigate?: (url: string) => void;
  className?: string;
  /** Extra controls before the language switch. */
  children?: ReactNode;
}) {
  return (
    <header className={cx('lr-masthead', className)}>
      <Wordmark lang={lang} mark={mark} />
      <nav aria-label={ui(lang, 'nav.label')}>
        <ul className="lr-nav">
          {SECTIONS.map((s) => (
            <li key={s}>
              <a href={`/${lang}/${s}`} aria-current={s === active ? 'page' : undefined}>{ui(lang, `nav.${s}`)}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="lr-masthead__end">
        {children}
        <LanguageSwitch lang={lang} navigate={navigate} />
        <ThemeToggle lang={lang} />
      </div>
    </header>
  );
}

export interface FooterLink { label: ReactNode; href: string }

/** The last band: small wordmark, links, the source line (UN Comtrade by default) and an optional note line. */
export function Footer({ lang, links = [], source, note, className }: {
  lang: Lang;
  links?: FooterLink[];
  source?: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <footer className={cx('lr-footer', className)}>
      <Wordmark lang={lang} size="sm" />
      {links.length ? (
        <ul className="lr-footer__links">
          {links.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
        </ul>
      ) : null}
      <p className="lr-caption lr-footer__source">{source ?? ui(lang, 'footer.source')}</p>
      {note ? <p className="lr-caption lr-footer__source">{note}</p> : null}
    </footer>
  );
}
