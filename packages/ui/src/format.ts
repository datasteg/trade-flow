// Numbers, dates and HS codes the Larch way (design book: 06-Bilingual, 01-Typography "Codes"). Pure functions, no
// React: usable in server components, client components, the D3 views and generateStaticParams alike. The web app
// re-exports all of this from apps/web/lib/i18n.ts.
//
// Units in, words out: values are US dollars; shares and changes are FRACTIONS (0.56 is 56%, a share change of 0.12
// is +12 pp, growth of 0.041 is +4.1%), as the Python builders write them. Every negative gets a true minus (U+2212).

export type Lang = 'en' | 'ko';
export const LANGS: readonly Lang[] = ['en', 'ko'];
export const MINUS = '−';

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'ko';
}

const LOCALE: Record<Lang, string> = { en: 'en-GB', ko: 'ko-KR' };
const formatters = new Map<string, Intl.NumberFormat>();

/** |v| grouped, with at most `max` decimals (trailing zeros dropped unless `min` asks for them). No sign. */
function digits(v: number, lang: Lang, max = 0, min = 0): string {
  const key = `${lang}:${max}:${min}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: max, minimumFractionDigits: Math.min(min, max) });
    formatters.set(key, f);
  }
  return f.format(Math.abs(v));
}

/** Rounds like Intl does (half away from zero) so the unit choice matches the printed figure. */
function round(v: number, decimals: number): number {
  const m = 10 ** decimals;
  return Math.sign(v) * Math.round(Math.abs(v) * m) / m;
}

/** The sign in front of a formatted magnitude: "−" for negatives, "+" for positives when `signed`, nothing for zero. */
function sign(v: number, signed = false): string {
  if (v < 0) return MINUS;
  return signed && v > 0 ? '+' : '';
}

/** A leading hyphen-minus (and one after a space) becomes a true minus "−". For strings built elsewhere. */
export function minus(s: string | number): string {
  return String(s).replace(/^-/, MINUS).replace(/(\s)-(?=\d)/g, `$1${MINUS}`);
}

export interface NumberOptions { decimals?: number; signed?: boolean }

/** 1234567 -> "1,234,567"; −0.5 -> "−0.5" (decimals default 0). */
export function formatNumber(v: number | null | undefined, lang: Lang, o: NumberOptions = {}): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const d = o.decimals ?? 0;
  const r = round(v, d);
  return sign(r, o.signed) + digits(r, lang, d);
}

const EN_UNITS: [number, string][] = [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'm'], [1e3, 'k']];

/** US dollars. EN "$115.4bn", "$640m", "$1.2tn", "$640k", "$85"; KO "1,154억 달러", "6억 4,000만 달러", "1.2조 달러",
 *  "640만 달러", "85 달러". `decimals` (default 1) applies to the EN units and to 조; negatives read "−$4.1bn". */
export function formatUSD(v: number | null | undefined, lang: Lang, o: NumberOptions = {}): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const d = o.decimals ?? 1;
  const a = Math.abs(v);
  const s = sign(v, o.signed);
  if (lang === 'ko') return s + koreanUSD(a, d);
  for (let i = 0; i < EN_UNITS.length; i++) {
    const [size, unit] = EN_UNITS[i];
    if (a < size) continue;
    const r = round(a / size, d);
    // 999.96bn rounds to 1,000.0bn: say $1tn instead.
    if (r >= 1000 && i > 0) return `${s}$${digits(round(a / EN_UNITS[i - 1][0], d), lang, d)}${EN_UNITS[i - 1][1]}`;
    return `${s}$${digits(r, lang, d)}${unit}`;
  }
  const r = round(a, 0);
  return r >= 1000 ? `${s}$1k` : `${s}$${digits(r, lang, 0)}`;
}

/** Korean money in 만/억/조: 조 with `d` decimals; whole 억 from 100억; 억 and 만 (to the 100만) from 1억; whole 만
 *  from 1만. When rounding reaches the next unit (9,999.6억), the next unit takes over. */
function koreanUSD(a: number, d: number): string {
  const jo = () => `${digits(round(a / 1e12, d), 'ko', d)}조 달러`;
  const eok = () => {
    const r = round(a / 1e8, 0);
    return r >= 1e4 ? jo() : `${digits(r, 'ko')}억 달러`;
  };
  const eokMan = () => {
    const r = Math.round(a / 1e6) * 1e6;
    if (r >= 1e10) return eok();
    const e = Math.floor(r / 1e8);
    const m = Math.round((r - e * 1e8) / 1e4);
    return m ? `${digits(e, 'ko')}억 ${digits(m, 'ko')}만 달러` : `${digits(e, 'ko')}억 달러`;
  };
  const man = () => {
    const r = round(a / 1e4, 0);
    return r >= 1e4 ? eokMan() : `${digits(r, 'ko')}만 달러`;
  };
  if (a >= 1e12) return jo();
  if (a >= 1e10) return eok();
  if (a >= 1e8) return eokMan();
  if (a >= 1e4) return man();
  const r = round(a, 0);
  return r >= 1e4 ? man() : `${digits(r, 'ko')} 달러`;
}

/** A share (fraction) as a percentage: 0.56 -> "56%" in both editions (decimals default 0). */
export function formatShare(fraction: number | null | undefined, lang: Lang, o: NumberOptions = {}): string {
  if (fraction == null || !Number.isFinite(fraction)) return '–';
  const d = o.decimals ?? 0;
  const r = round(fraction * 100, d);
  return `${sign(r, o.signed)}${digits(r, lang, d)}%`;
}

/** A change in a share, in percentage points (fraction difference in): 0.12 -> "+12 pp" / "+12%p"; −0.03 -> "−3 pp". */
export function formatPointChange(fraction: number | null | undefined, lang: Lang, o: { decimals?: number } = {}): string {
  if (fraction == null || !Number.isFinite(fraction)) return '–';
  const d = o.decimals ?? 0;
  const r = round(fraction * 100, d);
  return `${sign(r, true)}${digits(r, lang, d)}${lang === 'ko' ? '%p' : ' pp'}`;
}

/** A percentage change (growth fraction in): 0.041 -> "+4.1%", −0.037 -> "−3.7%", 4.46 -> "+446%" with decimals 0. */
export function formatPercentChange(fraction: number | null | undefined, lang: Lang, o: { decimals?: number } = {}): string {
  if (fraction == null || !Number.isFinite(fraction)) return '–';
  const d = o.decimals ?? 1;
  const r = round(fraction * 100, d);
  return `${sign(r, true)}${digits(r, lang, d)}%`;
}

// Fixed month names, not Intl's: en-GB writes "Sept", and server and browser ICU data can differ (hydration).
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** A day, read in UTC: "24 Oct 2026" / "2026년 10월 24일". Accepts a Date, an ISO string ("2026-10-24") or a timestamp. */
export function formatDate(d: Date | string | number, lang: Lang): string {
  const x = toDate(d);
  if (Number.isNaN(x.getTime())) return '–';
  const y = x.getUTCFullYear(), m = x.getUTCMonth(), day = x.getUTCDate();
  return lang === 'ko' ? `${y}년 ${m + 1}월 ${day}일` : `${day} ${MONTHS_EN[m]} ${y}`;
}

/** A month: formatMonth(2026, 3) -> "Mar 2026" / "2026년 3월" (month 1–12). */
export function formatMonth(year: number, month: number, lang: Lang): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '–';
  return lang === 'ko' ? `${year}년 ${month}월` : `${MONTHS_EN[month - 1]} ${year}`;
}

/** A trade period as the data store it: YYYY (2024 -> "2024" / "2024년") or YYYYMM (202603 -> "Mar 2026" / "2026년 3월"). */
export function formatPeriod(period: number | string, lang: Lang): string {
  const p = typeof period === 'string' ? Number(period) : period;
  if (!Number.isInteger(p) || p <= 0) return String(period);
  if (p < 10000) return lang === 'ko' ? `${p}년` : String(p);
  if (p < 1000000) return formatMonth(Math.floor(p / 100), p % 100, lang);
  return String(period);
}

/** HS code as written in Larch: six digits with a dot after the heading ("850760" -> "8507.60"), headings ("2846")
 *  and chapters ("85") as they are. A number loses its leading zero, so it is padded back to an even length. */
export function formatHS(code: string | number): string {
  let c = String(code).replace(/[^0-9]/g, '');
  if (typeof code === 'number' && c.length % 2 === 1) c = c.padStart(c.length + 1, '0');
  return c.length === 6 ? `${c.slice(0, 4)}.${c.slice(4)}` : c;
}

/** The HS chapter (first two digits) of a code. */
export function hsChapter(code: string | number): string {
  return formatHS(code).slice(0, 2);
}
