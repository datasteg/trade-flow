// Small counts as words, for titles that state a number of things ("Fourteen shocks", "아홉 연구"), so the number is
// counted from the data instead of typed into the string.
import type { Lang } from './i18n';

const EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// Korean determiners before a counted noun (한 연구, 아홉 연구, 열네 사건); digits above twenty.
const KO = ['영', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한', '열두', '열세', '열네',
  '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스무'];

/** `n` as a word: EN "fourteen" (capitalised with `cap`), KO "열네"; digits beyond twenty. */
export function countWord(n: number, lang: Lang, cap = false): string {
  if (!Number.isInteger(n) || n < 0 || n > 20) return String(n);
  if (lang === 'ko') return KO[n];
  const w = EN[n];
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}
