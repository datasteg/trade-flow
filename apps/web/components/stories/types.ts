// The case and event files as scripts/build_stories.py writes them (data/cases/*.json, data/events/*.json). Node
// references are indices into meta.nodes; shares and changes are fractions; periods are YYYY or YYYYMM.

export type Bi = { en: string; ko: string };
export type Freq = 'A' | 'M';
export type Lens = 'L' | 'M' | 'S';
/** An economy as the config names it: ISO3, a group key (EU27, WEST …), "GULF", or a list of ISO3 codes. */
export type EconSpec = string | string[];

// -- meta ----------------------------------------------------------------------------------------------------------

export interface MetaNodeLite { id: string; en: string; ko: string; nes?: boolean }
export interface MetaGroupLite { key: string; en: string; ko: string; members: number[] }
export interface MetaProductLite {
  id: string; slug: string; kind: string; en: string; ko: string; codes: string[];
  chain?: string; chains?: string[]; stage?: number; stage_key?: string; aliases?: string[]; label_long?: string;
  A?: [number, number]; M?: [number, number];
}
export interface MetaLite {
  nodes: MetaNodeLite[];
  groups: MetaGroupLite[];
  products: MetaProductLite[];
  complete: Record<Freq, number>;
  last: Record<Freq, number>;
  coverage: { A: Record<string, number>; M: Record<string, number> };
  reporters: { A: Record<string, number>; M: Record<string, number> };
  built_at?: string;
  /** The last period pages read. */
  shown?: Partial<Record<Freq | 'W', number>>;
  supplements?: import('@larch/net/core').MetaSupplement[];
}

// -- cases ---------------------------------------------------------------------------------------------------------

export interface Paper {
  ref?: string;
  authors: string;
  year: number;
  series: string;
  number: string | null;
  title: string;
  url: string;
  date: string;
  finding: Bi;
  quote: string | string[];
  verified: boolean;
}

export interface FurtherReading {
  ref?: string; authors: string; year: number; series: string; number: string | null; title: string; url: string;
  date: string; case: string;
}

export interface CaseIndexEntry { id: string; num: number; events: string[]; title: Bi; question: Bi; papers: number }
export interface CasesIndex { cases: CaseIndexEntry[]; further_reading: FurtherReading[]; gaps: Bi }

export interface MeasureSpec {
  kind: string;
  en?: string;
  ko?: string;
  note?: string;
  product?: string;
  lens?: Lens;
  [key: string]: unknown;
}

/** One measured result: the numbers of its kind, or `items` (one per `each:` value or period), or an error. */
export interface Measured {
  kind: string;
  spec?: MeasureSpec;
  items?: Measured[];
  each?: Record<string, string>;
  error?: string;
  [key: string]: unknown;
}

export interface WorldChange extends Measured {
  product: string; freq: Freq; lens: Lens | null;
  importers: { complete?: boolean; all?: boolean; n?: number; span?: [number, number]; economies?: EconSpec };
  partner?: string | null;
  values: { t: number; against: number; change: number | null }[];
}

/** Imports of the same importers from one partner and from everyone else, each against a year earlier. */
export interface PartnerSplit extends Measured {
  product: string; freq: Freq; lens: Lens | null;
  importers: { complete?: boolean; n?: number; span?: [number, number] };
  partner: string; outside: boolean;
  values: { t: number; against: number; from: number | null; others: number | null }[];
}

export interface PartnerShares extends Measured {
  product: string; freq: Freq; lens: Lens | null; role: 'importer' | 'exporter'; economy: string;
  t: number[]; series: { id: string; share: (number | null)[] }[]; other: (number | null)[];
  yoy: (number | null)[]; filed: boolean[];
  /** The economy's own months past meta.shown come from a supplement: preliminary from this month. */
  prelim_from?: number | null;
}

export interface ShareChange extends Measured {
  product: string; freq: Freq; lens: Lens | null; importer: string; supplier: string;
  rows: [number, number | null, boolean][];
}

export interface TopExporters extends Measured {
  product: string; freq: Freq; t: number; lens: Lens | null; rows: [number, number][];
  kor: number | null; kor_rank: number; group?: string; group_share?: number | null;
  base?: number; base_share?: (number | null)[];
}

export interface KoreaExposure extends Measured {
  product: string; freq: Freq; t: number; lens: Lens | null; share_of_world_imports: number | null;
  top_suppliers: [number, number][]; filed: boolean; supplier?: string; supplier_share?: number | null;
}

export interface BetweenGroups extends Measured {
  product: string; freq: Freq; lens: Lens | null; a: string; b: string; rows: [number, number, number, number][];
}

export interface ConnectorScatter extends Measured {
  product: string; freq: Freq; a: string; b: string; w0: [number, number]; w1: [number, number];
  points: [number, number | null, number | null, number | null][];
}

export interface FragilityRank extends Measured {
  years: number[];
  latest: {
    year: number; kor_score: number | null; world_score: number | null;
    rows: [string, string, string, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null][];
  };
  top10?: [number, string[]][];
}

export interface FragilityKorea extends Measured {
  years: number[]; kor_score: (number | null)[]; world_score: (number | null)[];
}

export interface Movers extends Measured {
  product: string; freq?: Freq; lens?: Lens | null; base?: number; t?: number; world_change?: number | null;
  /** [node, change in share of world exports, share at t] */
  up?: [number, number, number][];
  down?: [number, number, number][];
}

export interface ScenarioSpec {
  kind: 'cut_supplier' | 'close_route' | 'cut_output' | 'tariff' | 'none';
  product: string | null;
  supplier: EconSpec | null;
  alternatives?: EconSpec[];
  importer?: string;
  importers?: EconSpec;
  codes?: string[];
  route?: string;
  bypass?: string[];
  also_cut?: string[];
  other_products?: string[];
  cut: number | null;
  period: number | null;
  down_stage: string | string[] | null;
  note?: string;
  en: string;
  ko: string;
}

export interface ScenarioImporter { i: number; share: number; suppliers: [number, number][]; filed: boolean }
export interface ScenarioTable {
  product: string; freq: Freq; t: number; lens: Lens | null;
  importers: ScenarioImporter[];
  /** [node, share of world exports] for the 25 largest exporters. */
  exporters: [number, number][];
}
export interface ScenarioData {
  spec: ScenarioSpec;
  base: ScenarioTable | null;
  also_cut?: ScenarioTable[];
  other_products?: ScenarioTable[];
  down?: ScenarioTable[];
  error?: string;
}

export interface CaseDoc {
  id: string;
  num: number;
  events: string[];
  title: Bi;
  question: Bi;
  carries_over?: string[];
  papers: Paper[];
  network: {
    freq: Freq; products: string[]; from: number; to: number; base: number | string; note?: string;
    measures: MeasureSpec[]; plan_numbers: (Bi & { note?: Bi }) | null;
  };
  scenario: ScenarioSpec;
  korea: Bi;
  limits: Bi;
  measured: Measured[];
  scenario_data: ScenarioData | null;
}

// -- events --------------------------------------------------------------------------------------------------------

export interface EventView { f: Freq; p: string; base: number; t: number; lens: Lens | null }

export interface EventIndexEntry {
  id: string; num: string; start: string; end: string | null; ongoing: boolean; kind: string;
  title: Bi; dek: Bi; products: string[]; economies: string[]; view: EventView;
}

export interface EventStrip {
  from: number; complete_to: number; economies: number; t: number[]; imports: number[]; filed: number[];
}

export interface EventsIndex { events: EventIndexEntry[]; strip: EventStrip }

export interface EventSource {
  n: number; title: string; publisher: string; date: string | null; accessed?: string; url: string;
}

export interface TimelineItem { date: string; en: string; ko: string; source?: number; reported?: boolean }

/** One documented explanation in "Reading the numbers": the figure as the page shows it, the mechanism, sources by n. */
export interface ReadingItem { kind?: string; number: Bi; en: string; ko: string; sources?: number[]; checked?: string }
export interface EventReading { window?: Bi; items: ReadingItem[] }

export interface EventDoc extends EventIndexEntry {
  timeline: TimelineItem[];
  watch: Bi;
  sources: EventSource[];
  series: PartnerShares[];
  measures: Movers[];
  missing: { economy: string; product: string; role: 'importer' | 'exporter' }[];
  reading?: EventReading;
}

// -- chains (only what the scenario reads) ---------------------------------------------------------------------------

export interface UseShare {
  share: number | null;
  what?: Bi;
  source?: string;
  year?: number | null;
  url?: string | null;
  quote?: string | null;
}

export interface ChainStageLite {
  key: string; product: string; stage: number; en: string; ko: string; feeds: string[];
  role?: string | null; use_share?: Record<string, UseShare> | null;
}
export interface ChainLite { id: string; en: string; ko: string; stages: ChainStageLite[] }
