// The browser's loader for /data/<path>.json (DATA.md): one fetch per file, an in-memory cache of the last 64
// snapshot files (a monthly file holds a year of one lens) and of the decoded snapshots, and prefetch of the
// periods ahead while playing. A missing file (404) resolves to null; any other failure rejects.
import { decodeSnap } from './decode';
import type {
  Chain, ChecksFile, DivFile, Freq, Lens, Meta, MetaProduct, RawAnnualSnap, RawFlowsFile, RawMonthlyFile, RawNodesFile,
  RawSeries, Rule, Snap, WindowLen,
} from './types';
import { findProduct, lensWindow, LRU, validEnd } from './util';

let BASE = '/data';

/** Where the data files are served (default "/data"). */
export function setDataBase(base: string): void {
  BASE = base.replace(/\/$/, '');
}

export function dataUrl(rel: string): string {
  return `${BASE}/${rel}`;
}

const snapFiles = new LRU<string, Promise<unknown>>(64);
const otherFiles = new LRU<string, Promise<unknown>>(64);
const decoded = new LRU<string, Snap | null>(128);

class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`${url}: HTTP ${status}`);
  }
}

async function fetchJSON<T>(rel: string): Promise<T | null> {
  const url = dataUrl(rel);
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url);
      break;
    } catch (e) {
      // network errors (a restart, a flaky phone connection) are retried; HTTP errors are not
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

/** A data file by path ("chains/batteries.json"), cached; null when it does not exist. */
export function loadData<T>(rel: string, cache: 'snap' | 'other' = 'other'): Promise<T | null> {
  const lru = cache === 'snap' ? snapFiles : otherFiles;
  const hit = lru.get(rel);
  if (hit) return hit as Promise<T | null>;
  const p = fetchJSON<T>(rel);
  lru.set(rel, p);
  p.catch(() => lru.delete(rel));
  return p;
}

let metaPromise: Promise<Meta> | null = null;

/** meta.json, loaded once per page. */
export function loadMeta(): Promise<Meta> {
  if (!metaPromise) {
    metaPromise = loadData<Meta>('meta.json').then((m) => {
      if (!m) throw new Error('meta.json is missing');
      return m;
    });
    metaPromise.catch(() => { metaPromise = null; });
  }
  return metaPromise;
}

/** Hands the loader a meta.json the server already read (the explorer passes it down), so it is not fetched. */
export function primeMeta(meta: Meta): void {
  if (!metaPromise) metaPromise = Promise.resolve(meta);
}

export interface SnapOptions {
  /** Monthly lens (default L): the window it stands for, L 12 months, M 3 (lensWindow), when `win` is not given. */
  lens?: Lens;
  /** Annual flow rule (default mirror; importer and exporter exist for TOTAL only). */
  rule?: Rule;
  /** Monthly explorer: the window length; the snapshot comes from snap/W instead of a lens. */
  win?: WindowLen;
}

/** The data path of the file holding a period: snap/A/<slug>/<YYYY>[.rule].json, or for months snap/W/<slug>/<YYYY>.w<w>.json
 *  (the one monthly rule: the monthly lenses' snap/M files are retired). */
export function snapPath(p: MetaProduct, f: Freq, t: number, o: SnapOptions = {}): string {
  if (f === 'M') return `snap/W/${p.slug}/${Math.floor(t / 100)}.w${o.win ?? lensWindow(o.lens)}.json`;
  const rule = p.id === 'TOTAL' ? (o.rule ?? 'mirror') : 'mirror';
  return `snap/A/${p.slug}/${t}${rule === 'mirror' ? '' : `.${rule}`}.json`;
}

/** One period of one product, decoded; null when there is no snapshot for it (months: no window of that length ends
 *  in January, nor in April for 3 months). */
export async function loadSnapshot(meta: Meta, productId: string, f: Freq, t: number, o: SnapOptions = {}): Promise<Snap | null> {
  const p = findProduct(meta, productId);
  if (!p) return null;
  const rule: Rule = f === 'A' && p.id === 'TOTAL' ? (o.rule ?? 'mirror') : 'mirror';
  const win = f === 'M' ? o.win ?? lensWindow(o.lens) : null;
  const key = `${p.id}|${f}|${t}|${win ? `w${win}` : rule}`;
  if (decoded.has(key)) return decoded.get(key) ?? null;
  const rel = snapPath(p, f, t, { rule, win: win ?? undefined });
  let snap: Snap | null = null;
  if (f === 'A') {
    const raw = await loadData<RawAnnualSnap>(rel, 'snap');
    if (raw) snap = decodeSnap(raw, { meta, product: p.id, freq: f, lens: null, rule, ncols: raw.ncols, ecols: raw.ecols });
  } else {
    const raw = await loadData<RawMonthlyFile>(rel, 'snap');
    const one = raw?.snaps.find((x) => x.t === t);
    if (raw && one) {
      snap = decodeSnap(one, { meta, product: p.id, freq: f, lens: null, rule: 'mirror', ncols: raw.ncols, ecols: raw.ecols, wlen: win });
    }
  }
  decoded.set(key, snap);
  return snap;
}

/** Starts loading the given periods (playback asks for the next two), ignoring failures. */
export function prefetchSnapshots(meta: Meta, productId: string, f: Freq, periods: number[], o: SnapOptions = {}): void {
  for (const t of periods) loadSnapshot(meta, productId, f, t, o).catch(() => undefined);
}

function slugOf(meta: Meta, productId: string): string | null {
  return findProduct(meta, productId)?.slug ?? null;
}

/** The data folder: A (years) or W (months: the windows of the one monthly rule; the retired lenses' M folder is not
 *  read, check K4). */
export type DataDir = 'A' | 'W';

/** series/<dir>/<slug>.json: the strip metrics over every period. */
export function loadSeries(meta: Meta, productId: string, f: DataDir): Promise<RawSeries | null> {
  const slug = slugOf(meta, productId);
  return slug ? loadData<RawSeries>(`series/${f}/${slug}.json`) : Promise.resolve(null);
}

/** nodes/<dir>/<slug>.json: exports and imports of the 100 largest economies over time. */
export function loadNodeSeries(meta: Meta, productId: string, f: DataDir): Promise<RawNodesFile | null> {
  const slug = slugOf(meta, productId);
  return slug ? loadData<RawNodesFile>(`nodes/${f}/${slug}.json`) : Promise.resolve(null);
}

/** flows/<dir>/<slug>.json: the 300 largest flows over time. */
export function loadFlowSeries(meta: Meta, productId: string, f: DataDir): Promise<RawFlowsFile | null> {
  const slug = slugOf(meta, productId);
  return slug ? loadData<RawFlowsFile>(`flows/${f}/${slug}.json`) : Promise.resolve(null);
}

/** div/<slug>.json: the monthly explorer's divergence flags (all goods and chain stages only). */
export function loadDivergence(meta: Meta, productId: string): Promise<DivFile | null> {
  const slug = slugOf(meta, productId);
  return slug ? loadData<DivFile>(`div/${slug}.json`) : Promise.resolve(null);
}

/** The window ends of the monthly explorer for a product and window length: every month of meta's W range except
 *  those in which such a window would split January from February (meta.windows.skip). */
export function windowPeriods(meta: Meta, p: MetaProduct, w: WindowLen): number[] {
  const out: number[] = [];
  if (!p.W) return out;
  const skip = new Set(meta.windows?.skip[String(w)] ?? []);
  let t = p.W[0];
  while (t <= p.W[1]) {
    if (!skip.has(t % 100)) out.push(t);
    t = t % 100 === 12 ? (Math.floor(t / 100) + 1) * 100 + 1 : t + 1;
  }
  return out;
}

/** chains/<chain>.json */
export function loadChain(chainId: string): Promise<Chain | null> {
  return loadData<Chain>(`chains/${chainId}.json`);
}

/** checks/<slug>.json */
export function loadChecks(meta: Meta, productId: string): Promise<ChecksFile | null> {
  const slug = slugOf(meta, productId);
  return slug ? loadData<ChecksFile>(`checks/${slug}.json`) : Promise.resolve(null);
}

/** The periods that exist for a product, frequency and lens: years, or the end months of the lens's window (no
 *  window ends in January, nor in April for 3 months: the windows' grid). */
export function periodsOf(p: MetaProduct, f: Freq, lens: Lens = 'L'): number[] {
  const out: number[] = [];
  if (f === 'A') {
    for (let y = p.A[0]; y <= p.A[1]; y++) out.push(y);
    return out;
  }
  if (!p.M) return out;
  const w = lensWindow(lens);
  let t = p.M[0];
  while (t <= p.M[1]) {
    if (validEnd(t, w)) out.push(t);
    t = t % 100 === 12 ? (Math.floor(t / 100) + 1) * 100 + 1 : t + 1;
  }
  return out;
}
