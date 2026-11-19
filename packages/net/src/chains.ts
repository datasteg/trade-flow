// Chain helpers on chains/<chain>.json: which stage an economy leads (stage colouring), the stages up and down the
// trail (Signposts), and the groups of meta.json as ISO3 lists.
import type { Chain, ChainStage, Meta } from './types';

/** The stage each economy leads in a year: among the chain's stages where it is a top-five exporter, the one where
 *  its share of world exports is largest. ISO3 → stage number 1–5. */
export function stageLeaders(meta: Meta, chain: Chain, year: number): Record<string, number> {
  const best = new Map<number, { stage: number; share: number }>();
  const y = String(nearestYear(chain, year));
  for (const st of chain.stages) {
    if (st.role === 'feedstock') continue;
    for (const [i, share] of st.years[y]?.top_exporters ?? []) {
      const b = best.get(i);
      if (!b || share > b.share) best.set(i, { stage: st.stage, share });
    }
  }
  const out: Record<string, number> = {};
  for (const [i, b] of best) { const id = meta.nodes[i]?.id; if (id) out[id] = b.stage; }
  return out;
}

/** The chain year closest to `year` that the chain has. */
export function nearestYear(chain: Chain, year: number): number {
  const ys = chain.years;
  if (!ys.length) return year;
  if (ys.includes(year)) return year;
  return year > ys[ys.length - 1] ? ys[ys.length - 1] : ys[0];
}

/** The stages that feed this one (upstream) and the stages it feeds (downstream). */
export function stageNeighbours(chain: Chain, key: string): { up: ChainStage[]; down: ChainStage[] } {
  const me = chain.stages.find((x) => x.key === key);
  if (!me) return { up: [], down: [] };
  return {
    up: chain.stages.filter((x) => x.feeds.includes(key)),
    down: chain.stages.filter((x) => me.feeds.includes(x.key)),
  };
}

/** A group key ("G7", "BRICS") or a comma-separated ISO3 list ("USA,CAN,MEX") as ISO3 codes. */
export function groupMembers(meta: Meta, spec: string | null | undefined): string[] {
  if (!spec) return [];
  const g = meta.groups.find((x) => x.key === spec);
  if (g) return g.members.map((i) => meta.nodes[i]?.id).filter((x): x is string => !!x);
  return spec.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9_]{3}$/.test(x));
}

/** A group's name in the page language, or the list as written. */
export function groupLabel(meta: Meta, spec: string, lang: 'en' | 'ko'): string {
  const g = meta.groups.find((x) => x.key === spec);
  return g ? (lang === 'ko' ? g.ko : g.key) : spec;
}
