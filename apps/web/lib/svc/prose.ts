// The event and case pages' own prose, as the views pass it on. The pages print trade values measured on the data
// beside the shares and changes ("Indonesia → China: $1.8bn → $193m (−89%)"); a view carries derived records only
// (core.ts), so every scaled dollar amount is taken out of the text: a parenthesis that held only amounts goes,
// any other amount becomes "[…]". Percentages, shares, prices per unit and counts stay. Korean text is matched with
// escaped characters, so this file holds no Korean.

/** "$1.8bn", "US$ 52.2 billion", "HK$295bn", "$21k". */
const EN_AMOUNT = /(?:US|HK|NT|A|C|S)?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?[–-]\s?\$?\d[\d,]*(?:\.\d+)?)?\s?(?:tn|bn|m|k|trillion|billion|million|thousand)(?![a-z])/g;
/** Korean amounts: a number with a scale word (trillion U+C870, hundred million U+C5B5, ten thousand U+B9CC) before
 *  "dollars" (U+B2EC U+B7EC), also Hong Kong dollars (U+D64D U+CF69 first); a range "a~b" counts as one. */
const KO_AMOUNT = /\d[\d,]*(?:\.\d+)?(?:\s?[~–-]\s?\d[\d,]*(?:\.\d+)?)?\s?(?:\uC870(?:\s?\d[\d,]*(?:\.\d+)?\s?\uC5B5)?|\uC5B5(?:\s?\d[\d,]*\s?\uB9CC)?|\uB9CC)\s?(?:\uD64D\uCF69\s?)?\uB2EC\uB7EC/g;
const MARK = '\u0000';
/** Words that join two amounts ("$52.2bn of $75.3bn", "$1.8bn → $193m"). */
const JOIN = new RegExp(`${MARK}(?:\\s*(?:→|->|–|-|~|to|of|against|and|vs\\.?|,|/)\\s*${MARK})+`, 'g');

/** The text without its scaled dollar amounts. */
export function withoutAmounts(text: string | null | undefined): string {
  if (!text) return '';
  let s = text.replace(EN_AMOUNT, MARK).replace(KO_AMOUNT, MARK);
  if (!s.includes(MARK)) return text;
  s = s.replace(JOIN, MARK);
  // a parenthesis that held amounts and nothing a reader needs without them (no % and no digits left) goes whole
  s = s.replace(/\s*[(（]([^()（）]*)[)）]/g, (m, inner: string) => {
    if (!inner.includes(MARK)) return m;
    const rest = inner.split(MARK).join('').replace(/[\s,;:→\-–~/]+/g, ' ').trim();
    if (!/%|\d/.test(rest)) return '';
    return m.replace(new RegExp(`${MARK}\\s*[,;]?\\s*`, 'g'), '').replace(/\(\s*[,;]\s*/, '(').replace(/\s*[,;]\s*\)/, ')');
  });
  return s.replace(new RegExp(MARK, 'g'), '[…]').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

/** Markdown: a heading and its lines, skipping empty ones. */
export function md(parts: (string | null | undefined | false)[]): string {
  return parts.filter((x): x is string => !!x && x.trim() !== '').join('\n\n');
}
export const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
