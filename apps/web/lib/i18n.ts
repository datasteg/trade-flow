// Languages, interface strings and formatters for the site. Import everything from '@/lib/i18n'.
//
// Strings: t(lang, '<area>.<key>'), from the per-area tables in lib/strings/ (common.ts now; add explore.ts,
// chains.ts … and register them in lib/strings/index.ts). Keys are checked by TypeScript.
// Formatters (design book, 06-Bilingual): implemented in @larch/ui/format so the components and the D3 views share
// them, and re-exported here. Shares and changes are fractions in; every negative gets a true minus (U+2212).
import { TABLES, type StringTable } from './strings';
import { josa as qkrJosa } from './josa-qkr';
import type { Lang } from '@larch/ui/format';

export {
  type Lang, LANGS, isLang, MINUS, minus,
  formatNumber, formatUSD, formatShare, formatPointChange, formatPercentChange,
  formatDate, formatMonth, formatPeriod, formatHS, hsChapter,
} from '@larch/ui/format';

type Tables = typeof TABLES;
type Area = keyof Tables & string;

/** Every string key, as '<area>.<key>' ('common.skip', 'explore.title' …). */
export type StringKey = { [A in Area]: `${A}.${keyof Tables[A] & string}` }[Area];

/** The interface string for `key` in `lang`, with `{name}` placeholders filled from `vars`; `{name|이}` (a particle
 *  qkr placed after the placeholder) gets the particle that fits the value. */
export function t(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  const i = key.indexOf('.');
  const table = TABLES[key.slice(0, i) as Area] as StringTable;
  const s = table[key.slice(i + 1)]?.[lang] ?? key;
  return vars ? s.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (m, k: string, p?: string) => (k in vars ? (p ? qkrJosa(String(vars[k]), p) : String(vars[k])) : m)) : s;
}

/** The locale tag for <html lang>, Intl and og:locale. */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', ko: 'ko-KR' };

/** A Korean particle after a name the data chooses: `withFinal` after a final consonant ("한국이", "일본과"),
 *  `without` after a vowel ("사우디가", "칠레와"); 으로/로 also takes 로 after ㄹ. Latin letters and digits read as
 *  their Korean names do (ending in a vowel unless they end in L, M, N, R or 0, 1, 3, 6, 7, 8). */
export function josa(word: string, withFinal: string, without?: string): string {
  if (without === undefined) return qkrJosa(word, withFinal); // josa(word, '이'): qkr's form, one particle

  const last = word.trim().replace(/[)\]"’'”]+$/, '').slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  let final: boolean;
  if (code >= 0 && code <= 11171) {
    const jong = code % 28;
    final = jong !== 0 && !(withFinal === '으로' && jong === 8);
  } else {
    final = /[LMNRlmnr013678]/.test(last);
  }
  return word + (final ? withFinal : without);
}
