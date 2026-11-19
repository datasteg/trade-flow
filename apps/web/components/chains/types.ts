// The chain files as the builder writes them (docs/DATA.md, "Chains"), and the trimmed model the chain page hands
// to its client components. Node references are indices into meta.nodes.
import type { Lang } from '@/lib/i18n';

/** An economy that both imports and exports a stage (scripts/build_snapshots.py TWO_WAY: Grubel–Lloyd index ≥ 0.3,
 *  exports and imports each ≥ 2% of world trade): shares of world trade, the index, unit values of each side ($/kg,
 *  null where weight covers less than 80% of the value), and its three largest suppliers and buyers. */
export interface TwoWayRow {
  i: number;
  x: number;
  m: number;
  gl: number;
  ux: number | null;
  um: number | null;
  sup: number[];
  buy: number[];
}

export interface StageYear {
  world: number;
  kg: number | null;
  usd_per_kg: number | null;
  kg_coverage: number | null;
  exporters: number;
  hhi: number | null;
  /** [node, share of world exports], largest first (five). */
  top_exporters: [number, number][];
  top_importers: [number, number][];
  importer_reported: number | null;
  /** [exporter, importer, share of the stage's world trade], the eight largest. */
  flows: [number, number, number][];
  two_way: TwoWayRow[];
}

export interface UseShare {
  /** 0–1, or null when no free source gives it. */
  share: number | null;
  what?: { en: string; ko: string } | null;
  source?: string | null;
  year?: number | null;
  url?: string | null;
  quote?: string | null;
  published?: string | null;
}

export interface ChainStageFile {
  key: string;
  product: string;
  stage: number;
  en: string;
  ko: string;
  codes: string[];
  codes_pre2022: string[] | null;
  feeds: string[];
  shared: string[];
  role: string | null;
  /** Keyed by chain id. */
  use_share: Record<string, UseShare> | null;
  caveat: { en: string; ko: string } | null;
  residual: boolean;
  years: Record<string, StageYear>;
  monthly: { t: number[]; world: number[]; hhi: number[]; cmp?: (number | null)[] } | null;
}

/** One rung of a chain's ladder (chains.yaml `levels`): its name and who makes it (the Trail's column heads). */
export interface ChainLevel {
  en: string;
  ko: string;
  who: { en: string; ko: string };
}

export interface ChainFile {
  id: string;
  en: string;
  ko: string;
  /** The ladder, from the ground to the shop; `stages[].stage` indexes it from 1. Four to eight rungs. */
  levels: ChainLevel[];
  years: number[];
  chokepoint: Record<string, string | null>;
  stages: ChainStageFile[];
}

export interface ChainIndexFile {
  chains: {
    id: string;
    en: string;
    ko: string;
    levels: ChainLevel[];
    stages: number;
    year: number;
    chokepoint: string | null;
    world: Record<string, number | null>;
    /** The most two-way stage of the year: stage key, economy (node index), Grubel–Lloyd index. */
    two_way: { stage: string; i: number; gl: number } | null;
  }[];
}

/** econ/<chain>/<year>.json: every economy at every stage, for a focus economy (rows follow `cols`: i, x, m, ts,
 *  tss, ux, um). */
export interface EconFile {
  chain: string;
  year: number;
  cols: string[];
  stages: Record<string, (number | null)[][]>;
}

/** One economy at one stage, from the econ file: shares of world exports and imports, ranks among all economies
 *  trading the stage, its top supplier and that supplier's share of its imports, unit values. */
export interface EconPlace {
  x: number;
  m: number;
  xRank: number | null;
  mRank: number | null;
  ts: number | null;
  tss: number | null;
  ux: number | null;
  um: number | null;
}

export interface MetaNode { id: string; en: string; ko: string; name: string; hist?: boolean; nes?: boolean }

export interface MetaFile {
  nodes: MetaNode[];
  products: { id: string; kind: string; chain?: string; chains?: string[]; stage_key?: string; codes: string[]; aliases?: string[] }[];
  complete: { A: number; M: number };
  last: { A: number; M: number };
  coverage: { A: Record<string, number>; M: Record<string, number> };
  built_at?: string;
  shown?: { A?: number; M?: number; W?: number };
  supplements?: import('@larch/net/core').MetaSupplement[];
}

/* The model the page passes to its client components (everything already in the page's language). ------------- */

export type StageRole = 'feedstock' | 'side' | null;

export interface UseShareView {
  share: number | null;
  what: string | null;
  source: string | null;
  /** The source's short name for the badge ("IEA"). */
  short: string | null;
  year: number | null;
  url: string | null;
}

export interface SharedLink { chain: string; name: string; href: string }

export interface StageModel {
  key: string;
  product: string;
  stage: number;
  name: string;
  codes: string[];
  codesPre: string[] | null;
  feeds: string[];
  /** The stages that feed this one. */
  inputs: string[];
  shared: SharedLink[];
  role: StageRole;
  use: UseShareView | null;
  caveat: string | null;
  residual: boolean;
  /** First and last year with data; null when the stage never traded. */
  first: number | null;
  last: number | null;
  /** The customs records short of Korea's Comtrade file on this stage (checks.py kcs_stage), when over 0.5%: the
   *  flow, the gap (customs ÷ Comtrade − 1), the months measured, the customs months it applies to. */
  kcsGap: { side: 'x' | 'm'; gap: number; months: [number, number]; supplied: [number, number]; node: number; source: string } | null;
}

export interface ChainModel {
  id: string;
  lang: Lang;
  name: string;
  /** The ladder in the page language: rung k is levels[k - 1]. */
  levels: { name: string; who: string }[];
  years: number[];
  /** meta.complete.A: the default year; later years are partial. */
  complete: number;
  /** meta.complete.M (YYYYMM): later months are partial. */
  completeMonth: number;
  /** Share of 2024 exports filed, for partial years (meta.coverage.A) and months (meta.coverage.M). */
  coverage: Record<string, number>;
  coverageM: Record<string, number>;
  /** meta.shown.M: the monthly strips end here. */
  shownMonth: number | null;
  /** The customs citation for the monthly strips' months ("" when none) */
  monthCite: string;
  chokepoint: Record<string, string | null>;
  stages: StageModel[];
  /** By node index: [ISO3, short name in the page language]. */
  nodes: [string, string][];
  /** Node indices a reader can pick as the focus economy: today's economies (no historical ones, no Comtrade
   *  special areas). */
  focusable: number[];
  /** Node indices of partner areas that are not economies (Asia, n.e.s.: meta.nodes[].nes), noted where ranked. */
  nes: number[];
  /** The other chains' names (for "also in"). */
  chainNames: Record<string, string>;
}

/** One year of every stage (null where the stage has no data that year). */
export type YearSlice = Record<string, StageYear | null>;

export interface StageSeries {
  /** HHI by chain year (null before the code exists). */
  hhi: (number | null)[];
  /** Lens L: the 12-month sum, by month from t0. */
  m: { t: number[]; world: number[]; cmp: (number | null)[] | null } | null;
}

export type ChainSeries = Record<string, StageSeries>;
