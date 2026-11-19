// Small shared helpers: an LRU map, period arithmetic, node names.
import type { Lang } from '@larch/ui/format';
import type { Freq, Lens, Meta, MetaProduct, WindowLen } from './types';

/** A Map that keeps the `max` most recently used entries. */
export class LRU<K, V> {
  private m = new Map<K, V>();
  constructor(private max: number) {}
  get(k: K): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as K);
  }
  delete(k: K): void {
    this.m.delete(k);
  }
  has(k: K): boolean {
    return this.m.has(k);
  }
  get size(): number {
    return this.m.size;
  }
}

/** YYYYMM + k months. */
export function addMonths(p: number, k: number): number {
  const i = Math.floor(p / 100) * 12 + (p % 100) - 1 + k;
  return Math.floor(i / 12) * 100 + (i % 12) + 1;
}

/** Whether a window of w months may end in t: it keeps January and February together (no end in January, nor in
 *  April for 3 months or July for 6), as build_windows.valid_end. */
export function validEnd(t: number, w: number): boolean {
  return t % 100 !== 1 && addMonths(t, -(w - 1)) % 100 !== 2;
}

/** The window of the one monthly rule a lens stands for: L the 12-month window, M the 3-month window. */
export function lensWindow(lens: Lens | null | undefined): WindowLen {
  return lens === 'M' ? 3 : 12;
}

/** The next window end after p (k = 1) or before it (k = −1) for windows of w months. */
export function stepWindow(p: number, w: number, k: 1 | -1 = 1): number {
  let q = addMonths(p, k);
  while (!validEnd(q, w)) q = addMonths(q, k);
  return q;
}

/** The period `k` steps from p: years for A, months for M. */
export function addPeriods(p: number, k: number, f: Freq): number {
  return f === 'A' ? p + k : addMonths(p, k);
}

/** The base period that defaults with t: 2017 for years (or the first year when the code begins later),
 *  12 months back for months. */
export function defaultBase(t: number, f: Freq, first?: number): number {
  if (f === 'A') return Math.max(2017, first ?? 0);
  const b = addMonths(t, -12);
  return first != null && b < first ? first : b;
}

/** The economy's short name in the page language ("Japan" / "일본"), ISO3 when unknown. */
export function nodeName(meta: Meta, i: number, lang: Lang): string {
  const n = meta.nodes[i];
  return n ? (n[lang] || n.en || n.name || n.id) : String(i);
}

/** The index of an ISO3 code in meta.nodes (cached per meta). */
const isoIndex = new WeakMap<Meta, Map<string, number>>();
export function nodeIndex(meta: Meta, iso: string | null | undefined): number | null {
  if (!iso) return null;
  let m = isoIndex.get(meta);
  if (!m) {
    m = new Map(meta.nodes.map((n, i) => [n.id, i]));
    isoIndex.set(meta, m);
  }
  return m.get(iso.toUpperCase()) ?? null;
}

/** A product by id or alias. */
const prodIndex = new WeakMap<Meta, Map<string, MetaProduct>>();
export function findProduct(meta: Meta, id: string | null | undefined): MetaProduct | null {
  if (!id) return null;
  let m = prodIndex.get(meta);
  if (!m) {
    m = new Map();
    for (const p of meta.products) {
      m.set(p.id, p);
      for (const a of p.aliases ?? []) if (!m.has(a)) m.set(a, p);
    }
    prodIndex.set(meta, m);
  }
  return m.get(id) ?? null;
}

/** The product's name in the page language. */
export function productName(p: MetaProduct | null | undefined, lang: Lang): string {
  if (!p) return '';
  return p[lang] || p.en;
}

/** Whether the period is after the last complete one (fewer than the ten largest traders have filed). */
export function isPartial(meta: Meta, f: Freq, t: number): boolean {
  return t > meta.complete[f];
}

/** Coverage of the period: the share of 2024 world exports filed. */
export function coverageOf(meta: Meta, f: Freq, t: number): number | null {
  return meta.coverage?.[f]?.[String(t)] ?? null;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Prefers-reduced-motion, read when asked (false on the server). */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
