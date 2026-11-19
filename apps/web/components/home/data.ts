// What the home page reads besides meta.json (docs/DATA.md): the all-goods snapshot of the last complete year, for
// the network block's counts, and the chains, for the chain blocks. Server only, at build time.
import { EDITORIAL, titleWithYear } from '@/components/chains/editorial';
import { roleOf } from '@/components/chains/model';
import type { ChainFile, ChainIndexFile } from '@/components/chains/types';
import { tryData } from '@/components/method/data';
import { readData } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

/** snap/A/TOTAL/<YYYY>.json, the part the network block reads: the year, world trade and the graph's size. */
export interface RawSnap {
  t: number;
  world: number;
  tot: { nodes: number; edges: number };
}

export const readSnap = (year: number) => readData<RawSnap>(`snap/A/TOTAL/${year}.json`);

/** One chain block: its ladder (which rungs the chain trades itself, where the chokepoint sits) and the editor's
 *  finding, in the page language. */
export interface ChainBlock {
  id: string;
  href: string;
  name: string;
  year: number;
  /** The rungs' names, from the ground. */
  levelNames: string[];
  /** The number of stages (products) on the ladder. */
  stages: number;
  /** Per rung: the chain has a product of its own there (not only a feedstock or side input). */
  present: boolean[];
  chokeLevel: number | null;
  chokeName: string | null;
  /** The chain page's title with the year it was checked against (components/chains/editorial.ts), or null. */
  finding: string | null;
}

/** One block per chain, from chains/index.json and each chain's file; none when the chains are not built. */
export async function chainBlocks(lang: Lang): Promise<ChainBlock[]> {
  const index = await tryData<ChainIndexFile>('chains/index.json');
  if (!index) return [];
  const files = await Promise.all(index.chains.map((c) => tryData<ChainFile>(`chains/${c.id}.json`)));
  return index.chains.map((c, i) => {
    const stages = files[i]?.stages ?? [];
    const levels = files[i]?.levels ?? c.levels ?? [];
    const cs = c.chokepoint ? stages.find((s) => s.key === c.chokepoint) : undefined;
    return {
      id: c.id,
      href: `/${lang}/chains/${c.id}`,
      name: lang === 'ko' ? c.ko : c.en,
      year: c.year,
      levelNames: levels.map((l) => (lang === 'ko' ? l.ko : l.en)),
      stages: stages.length || c.stages,
      present: levels.map((_, k) => stages.some((s) => s.stage === k + 1 && roleOf(s) === null)),
      chokeLevel: cs?.stage ?? null,
      chokeName: cs ? (lang === 'ko' ? cs.ko : cs.en) : null,
      finding: EDITORIAL[c.id] ? titleWithYear(EDITORIAL[c.id], lang) : null,
    };
  });
}
