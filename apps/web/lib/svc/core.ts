// The shared pieces of trade-flow's internal views under /svc/v1 (api/docs/SVC-CONTRACT.md). The api service calls
// them over the Docker network (http://trade-flow:8080/svc/v1/...) and serves them as REST and MCP at
// api.datasteg.com. Page parity: a view returns what one page or chart of the site draws, read with readData() from
// the release the pages serve.
//
// The licence rule: answers carry
// derived records only (shares, ranks, ratios, HHI) and no original UN Comtrade record. No view returns a USD value of
// a flow, an economy or the world: shares of world trade, of an economy's exports or imports and of a flow, ranks,
// mirror ratios and indices only. Lists are capped at one chart's worth, and nothing lists the data folder.
import {
  addMonths, decodeSnap, findProduct, LRU, nodeIndex, nodeName, supplementLine, supplementRuns, windowPeriods,
  type Meta, type MetaProduct, type RawAnnualSnap, type RawMonthlyFile, type Snap,
} from '@larch/net/core';
import { decodeDataFile, readData, readDataFile } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { svcError, svcJson } from '@/lib/svc';

export type { Lang };
export const APP = 'trade-flow';

/* Errors ------------------------------------------------------------------------------------------------------- */

/** A failed call: status, type and a detail that says how to fix the call (never a stack trace). */
export class SvcFail extends Error {
  constructor(public status: number, public type: string, public title: string, public detail: string) {
    super(detail);
  }
}
export const badParam = (detail: string) => new SvcFail(400, 'bad-parameter', 'Bad parameter', detail);
export const unknownId = (type: string, title: string, detail: string) => new SvcFail(404, type, title, detail);

/** Runs a view and answers with its JSON, or with the error envelope: 400/404 from SvcFail, 503 when a data file
 *  the view reads is missing from the release. */
export async function respond(build: () => Promise<unknown>): Promise<Response> {
  try {
    return svcJson(await build());
  } catch (e) {
    if (e instanceof SvcFail) return svcError(e.status, e.type, e.title, e.detail);
    console.error('svc:', e instanceof Error ? e.message : e);
    return svcError(503, 'data-unavailable', 'Data not available', 'A data file this view reads is missing from the release trade-flow serves. Try again after the next release.');
  }
}

/** A query value, trimmed and clipped (so a detail never echoes a long input). */
export function param(url: URL, k: string): string | null {
  const v = url.searchParams.get(k);
  return v == null || v.trim() === '' ? null : v.trim().slice(0, 80);
}

/** A path segment as Next hands it, decoded once more if it still carries %XX (product ids hold ':'). */
export function segment(v: string): string {
  try {
    return /%[0-9A-Fa-f]{2}/.test(v) ? decodeURIComponent(v) : v;
  } catch {
    return v;
  }
}

/** `limit`: an integer from 1 to max, default `dflt`. */
export function limitParam(url: URL, dflt: number, max: number): number {
  const v = param(url, 'limit');
  if (v == null) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw badParam(`limit must be an integer from 1 to ${max}; got "${v}".`);
  return n;
}

/* The release and the envelope ----------------------------------------------------------------------------------- */

/** What /health reports: the image tag (APP_VERSION) and its build time. */
export const release = () => process.env.APP_VERSION ?? 'dev';
export const builtAt = (meta: Meta) => process.env.BUILD_TIME || meta.built_at;

export interface Source { publisher: string; dataset: string; vintage: string | null; licence: string; terms: string; url: string }
export interface Column { id: string; label: string; unit?: string }
export interface Table { columns: Column[]; rows: (string | number | null)[][] }

export interface Envelope {
  app: string;
  view: string;
  release: string;
  built: string;
  period?: Record<string, unknown>;
  page: string;
  sources: Source[];
  summary: string;
  data: unknown;
  table?: Table;
  notes?: string[];
  cursor?: string | null;
}

/** Summaries are what an assistant quotes: plain English, at most 600 characters (cut at a sentence end). */
export function clip(s: string, max = 600): string {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > max / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, max - 1).trimEnd()}…`;
}

export function envelope(meta: Meta, view: string, o: Omit<Envelope, 'app' | 'view' | 'release' | 'built'>): Envelope {
  const out: Envelope = { app: APP, view, release: release(), built: builtAt(meta), ...o, summary: clip(o.summary) };
  if (!out.notes?.length) delete out.notes;
  return out;
}

/* Data ----------------------------------------------------------------------------------------------------------------- */

export const getMeta = () => readData<Meta>('meta.json');

/** A file read once and not kept: for the large files and the long runs of snapshots a view goes through (the
 *  chapter snapshots of a pair), which readData()'s memo of 64 parsed files would otherwise fill. Same folder and
 *  path rules as readData() (lib/data.ts). Null when the file is not in the release. */
export async function readOnce<T>(rel: string): Promise<T | null> {
  const f = await readDataFile(rel);
  return f ? (JSON.parse((await decodeDataFile(f)).toString('utf8')) as T) : null;
}

/* Rounding: shares as percentages with three significant digits, the precision the bundle stores (DATA.md). ---------- */

export function pct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v === 0 ? 0 : Number((v * 100).toPrecision(3));
}
export function ratio(v: number | null | undefined, digits = 3): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Number(v.toFixed(digits));
}
/** A change as a percentage with one decimal. */
export function change(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 1000) / 10;
}

/** "2.66%" for summaries. */
export function pctText(v: number | null | undefined): string {
  const p = pct(v);
  return p == null ? 'n/a' : `${p}%`;
}

/* Periods ----------------------------------------------------------------------------------------------------------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** YYYYMM -> "2026-07". */
export const ym = (t: number) => `${Math.floor(t / 100)}-${String(t % 100).padStart(2, '0')}`;
/** YYYYMM -> "Jul 2026". */
export const monthWords = (t: number) => `${MON[(t % 100) - 1]} ${Math.floor(t / 100)}`;

/** A period a view reads: the 12-month window ending in a month (freq M, the monthly explorer) or a year (freq A, the
 *  explorer). */
export type Sel = { freq: 'M' | 'A'; t: number };

export const periodKey = (s: Sel) => (s.freq === 'M' ? ym(s.t) : String(s.t));
export const periodWords = (s: Sel) => (s.freq === 'M' ? `the 12 months to ${monthWords(s.t)}` : String(s.t));
/** The months a window sums: [first, last]. */
export const windowMonths = (t: number): [number, number] => [addMonths(t, -11), t];

/** The 12-month windows the monthly explorer offers for a product: to meta.shown.W. */
export function windowsShown(meta: Meta, p: MetaProduct): number[] {
  const end = meta.shown?.W ?? meta.complete.M;
  return windowPeriods(meta, p, 12).filter((t) => t <= end);
}
/** The years the explorer offers for a product: to meta.shown.A. */
export function yearsShown(meta: Meta, p: MetaProduct): [number, number] {
  return [p.A[0], Math.min(p.A[1], meta.shown?.A ?? p.A[1])];
}

/** The default period: the shown 12-month window for products with windows (all goods, baskets, chain stages); the
 *  last complete year for HS chapters, which have annual data only. */
export function defaultSel(meta: Meta, p: MetaProduct): Sel {
  const ws = p.W ? windowsShown(meta, p) : [];
  if (ws.length) return { freq: 'M', t: ws[ws.length - 1] };
  const [a, b] = yearsShown(meta, p);
  return { freq: 'A', t: Math.max(a, Math.min(meta.complete.A, b)) };
}

/** `period`: "2026-07" (the 12-month window ending in July 2026), "2024" (the year), or the default. */
export function parsePeriod(meta: Meta, p: MetaProduct, q: string | null): Sel {
  if (!q) return defaultSel(meta, p);
  const name = p.en;
  let m = /^(\d{4})-(\d{2})$/.exec(q);
  if (m) {
    const ws = p.W ? windowsShown(meta, p) : [];
    if (!ws.length) {
      const [a, b] = yearsShown(meta, p);
      throw badParam(`${name} has annual data only: ask for a year from ${a} to ${b}, or leave period out.`);
    }
    const t = Number(m[1]) * 100 + Number(m[2]);
    if (ws.includes(t)) return { freq: 'M', t };
    if (m[2] === '01') throw badParam(`No 12-month window ends in January (January and February stay together): ask for ${Number(m[1]) - 1}-12 or ${m[1]}-02.`);
    throw badParam(`period ${q} is outside the 12-month windows the site shows for ${name}: ${ym(ws[0])} to ${ym(ws[ws.length - 1])} (YYYY-MM).`);
  }
  m = /^(\d{4})$/.exec(q);
  if (m) {
    const y = Number(q);
    const [a, b] = yearsShown(meta, p);
    if (y >= a && y <= b) return { freq: 'A', t: y };
    throw badParam(`year ${q} is outside the years the site shows for ${name}: ${a} to ${b}.`);
  }
  throw badParam(`period must be a month YYYY-MM (the 12-month window ending in it) or a year YYYY; got "${q}".`);
}

/** The envelope's period block. */
export function periodBlock(meta: Meta, s: Sel): Record<string, unknown> {
  if (s.freq === 'M') {
    const [a] = windowMonths(s.t);
    return { freq: 'M', window_months: 12, shown: ym(s.t), from: ym(a), default: ym(meta.shown?.W ?? meta.complete.M), newest: ym(meta.last.M), complete_a: meta.complete.A };
  }
  return { freq: 'A', shown: String(s.t), default: String(meta.complete.A), newest: String(meta.last.A), complete_a: meta.complete.A, partial: s.t > meta.complete.A };
}

/** The decoded snapshot of a product in a period: snap/W/<slug>/<YYYY>.w12.json (window) or snap/A/<slug>/<YYYY>.json
 *  (year, mirror rule), as the explorers load them. Null when the release has none. */
export async function snapAt(meta: Meta, p: MetaProduct, s: Sel): Promise<Snap | null> {
  if (s.freq === 'A') {
    const raw = await readData<RawAnnualSnap>(`snap/A/${p.slug}/${s.t}.json`).catch(() => null);
    return raw ? decodeSnap(raw, { meta, product: p.id, freq: 'A', lens: null, rule: 'mirror', ncols: raw.ncols, ecols: raw.ecols }) : null;
  }
  const file = await readData<RawMonthlyFile>(`snap/W/${p.slug}/${Math.floor(s.t / 100)}.w12.json`).catch(() => null);
  const one = file?.snaps.find((x) => x.t === s.t);
  return file && one ? decodeSnap(one, { meta, product: p.id, freq: 'M', lens: null, rule: 'mirror', ncols: file.ncols, ecols: file.ecols, wlen: 12 }) : null;
}

/* Names ------------------------------------------------------------------------------------------------------------------ */

export const productName = (p: MetaProduct, lang: Lang) => (lang === 'ko' ? p.ko || p.en : p.en);

/** An economy as the views write it: ISO3 code and short name in the asked language. */
export function econRef(meta: Meta, i: number, lang: Lang): { code: string; name: string } {
  return { code: meta.nodes[i]?.id ?? String(i), name: nodeName(meta, i, lang) };
}
export const enName = (meta: Meta, i: number) => nodeName(meta, i, 'en');

/** The index of an economy code; 404 when trade-flow does not know it. */
export function econIndex(meta: Meta, code: string, what = 'economy'): number {
  const c = code.toUpperCase();
  const i = /^[A-Z0-9_]{3}$/.test(c) ? nodeIndex(meta, c) : null;
  if (i != null && meta.nodes[i]?.nes) {
    throw unknownId('unknown-economy', 'Not an economy',
      `${c} is ${meta.nodes[i].en} (UN Comtrade partner code 490): a partner area, not an economy. Its flows appear as partners of the economies that trade with it; GET /v1/trade-flow/economies lists the economies.`);
  }
  if (i == null) {
    throw unknownId('unknown-economy', 'Unknown economy code',
      `${code.slice(0, 12)} is not an ${what} code trade-flow knows. Use an ISO 3166-1 alpha-3 code such as KOR; GET /v1/trade-flow/economies lists them.`);
  }
  return i;
}

/** A product by id ("HS:85", "B:semiconductors", "C:batteries:cells", "TOTAL"), alias or file slug ("HS-85"). */
export function productOf(meta: Meta, id: string | null, dflt = 'TOTAL'): MetaProduct {
  const want = id ?? dflt;
  const p = findProduct(meta, want) ?? findProduct(meta, want.toUpperCase()) ?? meta.products.find((x) => x.slug === want) ?? null;
  if (!p) {
    throw unknownId('unknown-product', 'Unknown product',
      `${want.slice(0, 40)} is not a trade-flow product. Use TOTAL, an HS chapter such as HS:85, a basket such as B:semiconductors or a chain stage such as C:batteries:cells; GET /v1/trade-flow/products lists them.`);
  }
  return p;
}

/** The economies a reader can pick: today's economies (no historical ones, no Comtrade special areas, no partner area
 *  that is not an economy: S19, Asia, not elsewhere specified). */
export function economies(meta: Meta): number[] {
  return meta.nodes.flatMap((n, i) => (!n.hist && !n.nes && /^[A-Z]{3}$/.test(n.id) ? [i] : []));
}

/* Sources ------------------------------------------------------------------------------------------------------------- */

const COMTRADE_TERMS = 'UN Comtrade terms of use: a free visualisation may hold fewer than 100,000 original records; transformed data (indicators, aggregations) are not copyrighted. This answer carries derived records only (shares, ranks, ratios); the records are at comtradeplus.un.org.';

export function comtrade(meta: Meta, freq: 'A' | 'M'): Source {
  return {
    publisher: 'United Nations Statistics Division',
    dataset: freq === 'M' ? 'UN Comtrade, monthly final data (goods), 12-month windows' : 'UN Comtrade, annual final data (goods), mirror rule',
    vintage: (meta.layer_built?.[freq] ?? meta.built_at ?? '').slice(0, 10) || null,
    licence: 'UN Comtrade terms of use',
    terms: COMTRADE_TERMS,
    url: 'https://comtradeplus.un.org',
  };
}

/** The sources of an answer over the months [from, to] (monthly) or a year: UN Comtrade, and the Korea Customs Service
 *  when the months reach Korea's customs months, credited as the site credits them (supplementLine). */
export function sourcesFor(meta: Meta, freq: 'A' | 'M', months?: [number, number] | null): { sources: Source[]; notes: string[] } {
  const sources = [comtrade(meta, freq)];
  const notes: string[] = [];
  if (freq === 'M' && months) {
    for (const sup of meta.supplements ?? []) {
      if (!supplementRuns(sup, months[0], months[1]).length) continue;
      sources.push({
        publisher: 'Korea Customs Service', dataset: sup.en, vintage: sup.fetched,
        licence: 'Public data portal (data.go.kr): reuse with credit to the source', terms: 'Name the source: Korea Customs Service.', url: sup.url,
      });
    }
    const line = supplementLine('en', meta, months[0], months[1]);
    if (line) notes.push(`Korea's monthly records that UN Comtrade lacks come from the Korea Customs Service: ${line}`);
  }
  return { sources, notes };
}

/** Years a chain or a case reads: annual data, Comtrade only. */
export const annualSources = (meta: Meta) => sourcesFor(meta, 'A');

/* A small cache of derived results (bounded; the data are baked into the image and never change while it runs). ---- */

export function cached<K, V>(max: number): (key: K, make: () => Promise<V>) => Promise<V> {
  const lru = new LRU<K, Promise<V>>(max);
  return (key, make) => {
    const hit = lru.get(key);
    if (hit) return hit;
    const p = make();
    lru.set(key, p);
    p.catch(() => lru.delete(key));
    return p;
  };
}

/** The public page of a path in a language. */
export const pageOf = (lang: Lang, path: string) => `/${lang}${path}`;
