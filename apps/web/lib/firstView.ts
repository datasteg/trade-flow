// The server-rendered first view of the all-goods network: the scene NetView draws, as a static picture, for the
// last complete year, coloured by region. The explorer shows it until its scripts take over. Server only (reads
// data/ and public/world-110m.json at build time).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  decodeSnap, DEFAULT_CONFIG, periodEnd, resolveColouring, staticScene, worldFromTopology,
  type Box, type GroupsFile, type Meta, type RawAnnualSnap, type RawSeries, type StaticMap,
} from '@larch/net/core';
import { readData } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

export type ViewBox = Box & { width: number; height: number };

/** The first view in `box`, or null when a file it needs is not built. `labels`: the N largest economies labelled
 *  (default 25); `maxEdges`: the largest flows drawn (default 200). */
export async function firstView(meta: Meta, lang: Lang, box: ViewBox, opts: { labels?: number; maxEdges?: number } = {}): Promise<StaticMap | null> {
  try {
    const year = meta.complete.A;
    const raw = await readData<RawAnnualSnap>(`snap/A/TOTAL/${year}.json`);
    const snap = decodeSnap(raw, { meta, product: 'TOTAL', freq: 'A', lens: null, rule: 'mirror', ncols: raw.ncols, ecols: raw.ecols });
    const topo = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'world-110m.json'), 'utf8')) as Parameters<typeof worldFromTopology>[0];
    const series = await readData<RawSeries>('series/A/TOTAL.json').catch(() => null);
    const cols = series?.cols ?? [];
    const ref = series ? Math.max(...(series.rows.mirror ?? []).map((r) => Number(r[cols.indexOf('world')]) || 0)) : null;
    const groups = await readData<GroupsFile>('groups/memberships.json');
    return staticScene(meta, snap, {
      ...DEFAULT_CONFIG, ref, labels: opts.labels ?? DEFAULT_CONFIG.labels,
      groups: resolveColouring(groups, 'region', { date: periodEnd(year, 'A') }),
    }, worldFromTopology(topo), box, lang, opts.maxEdges);
  } catch {
    return null;
  }
}
