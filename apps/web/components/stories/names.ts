// Names, periods and source lines for the event and case pages. Pure functions over the meta file, usable on the
// server and in client components (the scenario control gets a NameList, not the whole meta).
import { supplementLine } from '@larch/net/core';
import { formatHS, formatMonth, formatPeriod, t, type Lang } from '@/lib/i18n';
import type { EconSpec, Freq, Lens, MetaLite } from './types';

/** The Gulf as the case files write it (config/cases.yaml `regions.gulf`; build_stories.py GULF). */
export const GULF = ['SAU', 'ARE', 'IRQ', 'KWT', 'QAT', 'IRN', 'OMN', 'BHR'];

/** Codes the case files split a product by, named the way a reader knows them. */
const SUBSETS: Record<string, { en: string; ko: string }> = {
  '271111': { en: 'LNG', ko: 'LNG' },
  '271121': { en: 'Pipeline gas', ko: '배관 가스' },
};

export class Book {
  readonly idx: Map<string, number>;
  readonly groups: Map<string, { en: string; ko: string; members: number[] }>;
  readonly products: Map<string, MetaLite['products'][number]>;

  /** The customs citation for the months [from, to] ("" when no supplement month is in it). */
  cite(lang: Lang, from: number, to: number): string {
    return supplementLine(lang, this.meta as unknown as Parameters<typeof supplementLine>[1], from, to);
  }

  /** The citation for a story's monthly figures: the months they mention, from the first window's start. */
  citeMonths(lang: Lang, months: number[]): string {
    return months.length ? this.cite(lang, addMonths(Math.min(...months), -11), Math.max(...months)) : '';
  }

  constructor(readonly meta: MetaLite) {
    this.idx = new Map(meta.nodes.map((n, i) => [n.id, i]));
    this.groups = new Map(meta.groups.map((g) => [g.key, g]));
    this.products = new Map();
    for (const p of meta.products) {
      this.products.set(p.id, p);
      for (const a of p.aliases ?? []) this.products.set(a, p);
    }
  }

  get kor(): number {
    return this.idx.get('KOR') ?? -1;
  }

  /** A node's short name ("Japan" / "일본"). */
  node(i: number, lang: Lang): string {
    const n = this.meta.nodes[i];
    return n ? n[lang] || n.en : `#${i}`;
  }

  iso(i: number): string {
    return this.meta.nodes[i]?.id ?? '';
  }

  /** ISO3, group key, "GULF", "A+B" or a list -> node indices. */
  members(spec: EconSpec | null | undefined): number[] {
    if (spec == null) return [];
    if (Array.isArray(spec)) return [...new Set(spec.flatMap((s) => this.members(s)))];
    if (spec === 'GULF') return this.members(GULF);
    if (spec.includes('+')) return this.members(spec.split('+'));
    const g = this.groups.get(spec);
    if (g) return [...g.members];
    const i = this.idx.get(spec);
    return i == null ? [] : [i];
  }

  /** An economy or group as a reader names it: "Korea", "The Gulf", "European Union (27)", "Japan and Korea". */
  econ(spec: EconSpec | null | undefined, lang: Lang): string {
    if (spec == null) return '';
    if (Array.isArray(spec)) {
      if ([...spec].sort().join() === [...GULF].sort().join()) return t(lang, 'cases.gulf');
      return joinNames(spec.map((s) => this.econ(s, lang)), lang);
    }
    if (spec === 'GULF') return t(lang, 'cases.gulf');
    if (spec.includes('+')) return this.econ(spec.split('+'), lang);
    const g = this.groups.get(spec);
    if (g) return g[lang] || g.en;
    const i = this.idx.get(spec);
    return i == null ? spec : this.node(i, lang);
  }

  /** A product's name, with the codes of a split ("LNG (2711.11)"). */
  product(pid: string | null | undefined, lang: Lang): string {
    if (!pid) return '';
    const [base, codes] = pid.split('|');
    const p = this.products.get(base);
    const name = p ? p[lang] || p.en : base;
    if (!codes) return name;
    const cs = codes.split(',');
    if (cs.length === 1 && SUBSETS[cs[0]]) return `${SUBSETS[cs[0]][lang]} (${formatHS(cs[0])})`;
    return `${name} (${cs.map((c) => formatHS(c)).join(', ')})`;
  }

  /** The chain and stage key of a stage product ("C:plastics:crude|2709" -> plastics, crude), or null. */
  stageOf(pid: string | null | undefined): { chain: string; key: string } | null {
    if (!pid) return null;
    const p = this.products.get(pid.split('|')[0]);
    if (!p || p.kind !== 'stage' || !p.stage_key) return null;
    return { chain: p.chain ?? pid.split(':')[1], key: p.stage_key };
  }

  /** The names of every node in one language, for client components. */
  nameList(lang: Lang): NameList {
    return { names: this.meta.nodes.map((n) => n[lang] || n.en), iso: this.meta.nodes.map((n) => n.id), kor: this.kor };
  }
}

/** Node names for a client component: names[i], iso[i], and Korea's index (the case studies' Korea sections). */
export interface NameList { names: string[]; iso: string[]; kor: number }

/** "A, B and C" / "A, B, C". */
export function joinNames(names: string[], lang: Lang): string {
  if (names.length <= 1) return names[0] ?? '';
  if (lang === 'ko') return names.join('·');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A period as a reader reads it. Lens S stores January and February together at YYYY02. */
export function periodLabel(p: number, lang: Lang, lens?: Lens | null): string {
  if (p > 9999 && lens === 'S' && p % 100 === 2) {
    const y = Math.floor(p / 100);
    return lang === 'ko' ? `${y}년 1~2월` : `Jan–Feb ${y}`;
  }
  return formatPeriod(p, lang);
}

/** A short axis label: "2024", "Mar 26" / "26.3". */
export function tickLabel(p: number, lang: Lang, monthly: boolean): string {
  if (p <= 9999) return String(p);
  const y = Math.floor(p / 100), m = p % 100;
  if (!monthly) return String(y);
  return lang === 'ko' ? `${String(y).slice(2)}.${m}` : formatMonth(y, m, 'en').replace(/ (\d\d)(\d\d)$/, ' ’$2');
}

/** A period as a number on a time axis: 2024 -> 2024, 202603 -> 2026.1667. */
export function periodValue(p: number): number {
  return p > 9999 ? Math.floor(p / 100) + ((p % 100) - 1) / 12 : p;
}

/** The same period a year earlier. */
export function yearBefore(p: number): number {
  return p > 9999 ? p - 100 : p - 1;
}

/** The lens in words: "lens M (3-month sum against a year earlier)". */
export function lensText(lens: Lens | null | undefined, lang: Lang): string {
  if (!lens) return '';
  return t(lang, 'cases.lens', { k: lens, name: t(lang, `cases.lens.${lens}`) });
}

/** The source line under a chart: frequency, flow rule, lens. Months under the side-selecting rule are the monthly
 *  explorer's windows (build_stories.py reads them), so the line names that rule; `importer` stays the importers' own
 *  reports (the world_change and partner_split measures). */
export function sourceLine(lang: Lang, o: { freq: Freq; lens?: Lens | null; rule?: 'mirror' | 'importer' | 'exporter'; extra?: string; cite?: string }): string {
  const base = t(lang, o.freq === 'M' ? 'cases.source.M' : 'cases.source.A');
  const r = o.rule ?? 'mirror';
  const rule = t(lang, o.freq === 'M' && r === 'mirror' ? 'cases.rule.monthly' : `cases.rule.${r}`);
  const parts = [base, rule];
  if (o.freq === 'M' && o.lens) parts.push(lensText(o.lens, lang));
  if (o.extra) parts.push(o.extra);
  // the customs citation of the page's monthly figures
  return parts.join(lang === 'ko' ? ', ' : '; ') + (lang === 'ko' ? '.' : '.') + (o.freq === 'M' && o.cite ? ` ${o.cite}` : '');
}

/** The months (YYYYMM) a story's measured numbers mention, under the keys that hold periods. */
export function monthsIn(x: unknown, out: number[] = []): number[] {
  if (Array.isArray(x)) { for (const y of x) monthsIn(y, out); return out; }
  if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (['t', 'base', 'against', 'span', 'from', 'to', 'win'].includes(k)) {
        for (const q of Array.isArray(v) ? v : [v]) if (typeof q === 'number' && q > 190000 && q < 210000 && q % 100 >= 1 && q % 100 <= 12) out.push(q);
      }
      if (typeof v === 'object') monthsIn(v, out);
    }
  }
  return out;
}

/** An event's dates: "15 Sep 2008 – 30 Jun 2009", "28 Feb 2026 – ongoing". */
export function eventDates(start: string, end: string | null, ongoing: boolean, lang: Lang, fmt: (d: string, l: Lang) => string): string {
  const a = fmt(start, lang);
  if (ongoing || !end) return `${a} – ${t(lang, 'events.ongoing')}`;
  if (end === start) return a;
  return `${a} – ${fmt(end, lang)}`;
}

/** English possessive: "Japan’s", "United States’"; Korean names are returned as they are (templates add 의). */
export function poss(name: string, lang: Lang): string {
  if (lang === 'ko') return name;
  return /s$/.test(name) ? `${name}’` : `${name}’s`;
}

/** A product name inside an English sentence: "car parts", but "LNG" and "Korea" stay as they are. */
export function mid(name: string, lang: Lang): string {
  if (lang === 'ko' || name.length < 2) return name;
  return /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

/** The first letter in upper case ("the Gulf" at the start of a sentence or a label). */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "2026-02-28" -> 202602 */
export function monthOf(date: string): number {
  return Number(date.slice(0, 4)) * 100 + Number(date.slice(5, 7));
}

/** A month YYYYMM moved by k months. */
export function addMonths(p: number, k: number): number {
  const m = Math.floor(p / 100) * 12 + (p % 100) - 1 + k;
  return Math.floor(m / 12) * 100 + (m % 12) + 1;
}
