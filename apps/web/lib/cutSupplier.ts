// The "Cut a supplier" tool (/[lang]/cases/tools/cut-supplier): the case studies' scenario
// engine (components/stories/scenario.ts) on any chain stage. The tables the engine works on are built here from
// the stage's annual snapshot, the way build_stories.py builds them for a case: each large importer's suppliers as
// shares of its imports (the snapshot keeps every importer's ten largest suppliers and every flow above 0.05% of
// world trade; the rest is the "smaller suppliers" bucket) and the largest exporters by share of world exports.
// Server only.
import { findProduct, type Meta, type MetaProduct, type RawAnnualSnap } from '@larch/net/core';
import type { ChainFile, ChainIndexFile, ChainStageFile } from '@/components/chains/types';
import type { ScenarioTable } from '@/components/stories/types';
import { readData } from '@/lib/data';

export const TOOL_PATH = '/cases/tools/cut-supplier';

export interface StageOption {
  /** The product id, C:<chain>:<key>. */
  id: string;
  chain: string;
  key: string;
  stage: number;
  en: string;
  ko: string;
  chainEn: string;
  chainKo: string;
  role: string | null;
  /** The chain's chokepoint in the latest complete year. */
  chokepoint: boolean;
}

/** The value of ?stage= for a stage: "<chain>/<key>" (global-network's S2 keys); "C:<chain>:<key>" and
 *  "<chain>:<key>" are read too. */
export function stageParam(s: { chain: string; key: string }): string {
  return `${s.chain}/${s.key}`;
}

export async function stageOptions(): Promise<{ options: StageOption[]; chains: ChainFile[]; index: ChainIndexFile }> {
  const index = await readData<ChainIndexFile>('chains/index.json');
  const chains = await Promise.all(index.chains.map((c) => readData<ChainFile>(`chains/${c.id}.json`)));
  const options = chains.flatMap((c, k) => c.stages.map((s): StageOption => ({
    id: s.product, chain: c.id, key: s.key, stage: s.stage, en: s.en, ko: s.ko, chainEn: c.en, chainKo: c.ko, role: s.role,
    chokepoint: index.chains[k].chokepoint === s.key,
  })));
  return { options, chains, index };
}

export function parseStage(q: string | string[] | undefined, options: StageOption[]): StageOption | null {
  const v = (Array.isArray(q) ? q[0] : q ?? '').trim();
  if (!v) return null;
  const norm = v.replace(/^C:/, '').replace(/[:/]+/g, '/');
  return options.find((o) => stageParam(o) === norm) ?? options.find((o) => o.id === v) ?? null;
}

/** The default stage: the first chain's chokepoint (chains in the index order), else the first stage. */
export function defaultStage(options: StageOption[]): StageOption {
  return options.find((o) => o.chokepoint) ?? options[0];
}

function cols(names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  names.forEach((c, i) => { out[c] = i; });
  return out;
}
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? 0 : v);

/** The scenario table of a product in a year from its annual snapshot: the 40 largest importers with their suppliers
 *  (the twelve largest, at least 0.5% each) and the 25 largest exporters, plus any node in `ensure` with exports.
 *  Null when the snapshot is not built. */
export async function snapTable(product: MetaProduct, year: number, ensure: number[] = []): Promise<ScenarioTable | null> {
  const raw = await readData<RawAnnualSnap>(`snap/A/${product.slug}/${year}.json`).catch(() => null);
  if (!raw) return null;
  const nc = cols(raw.ncols), ec = cols(raw.ecols);
  const nodes = raw.nodes.map((r) => ({ i: r[nc.i] as number, x: num(r[nc.x]), m: num(r[nc.m]), r: num(r[nc.r]) }));
  const inbound = new Map<number, [number, number][]>();
  for (const e of raw.edges) {
    const s = e[ec.s] as number, tt = e[ec.t] as number, w = num(e[ec.w]);
    if (w <= 0) continue;
    const list = inbound.get(tt) ?? [];
    list.push([s, w]);
    inbound.set(tt, list);
  }
  const importers = nodes.filter((n) => n.m > 0).sort((a, b) => b.m - a.m).slice(0, 40).map((n) => ({
    i: n.i,
    share: n.m,
    suppliers: (inbound.get(n.i) ?? []).map(([s, w]) => [s, w / n.m] as [number, number]).sort((a, b) => b[1] - a[1])
      .filter(([, s]) => s >= 0.005).slice(0, 12),
    filed: n.r === 1,
  }));
  const byX = nodes.filter((n) => n.x > 0).sort((a, b) => b.x - a.x);
  const exporters: [number, number][] = byX.slice(0, 25).map((n) => [n.i, n.x]);
  for (const i of ensure) {
    if (exporters.some(([k]) => k === i)) continue;
    const n = byX.find((o) => o.i === i);
    if (n) exporters.push([n.i, n.x]);
  }
  return { product: product.id, freq: 'A', t: year, lens: null, importers, exporters };
}

/** The stages this stage feeds within its chain, with data in the year (at most three), for "one stage down". */
export function downStages(chain: ChainFile, stage: ChainStageFile, year: number): ChainStageFile[] {
  return stage.feeds
    .map((k) => chain.stages.find((s) => s.key === k))
    .filter((s): s is ChainStageFile => !!s && (s.years[String(year)]?.world ?? 0) > 0)
    .slice(0, 3);
}

/** The product of a stage option in meta (the explorer's product list), or null. */
export function productOf(meta: Meta, o: StageOption): MetaProduct | null {
  return findProduct(meta, o.id);
}
