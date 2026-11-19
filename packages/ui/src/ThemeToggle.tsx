'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Lang } from './format';
import { ui } from './strings';
import { THEME_KEY } from './util';

/** The Masthead's icon button (Lucide moon / sun). The theme itself is set before the first paint by THEME_SCRIPT;
 *  this only flips <html data-theme> and saves the choice. */
export function ThemeToggle({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  function toggle() {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: the choice lasts this page only */ }
    setTheme(next);
  }
  const label = ui(lang, next === 'dark' ? 'theme.toDark' : 'theme.toLight');
  return (
    <button type="button" className="lr-iconbtn" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={20} strokeWidth={1.5} aria-hidden /> : <Moon size={20} strokeWidth={1.5} aria-hidden />}
    </button>
  );
}
