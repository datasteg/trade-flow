// The data contract (docs/DATA.md) as types: what scripts/build_snapshots.py and scripts/checks.py write into data/,
// served at /data/<path>.json. Raw* types are the files as stored; the decoded types (NetNode, NetEdge, Snap) are
// what the views draw. Node references in files are indices into meta.nodes.

export type Freq = 'A' | 'M';
/** Monthly lenses: L the 12-month sum, M the 3-month sum (read against 12 months earlier), S the single month
 *  (January and February together, stored at YYYY02). */
export type Lens = 'L' | 'M' | 'S';
/** Annual flow rules; only all goods (TOTAL) has importer and exporter files. */
export type Rule = 'mirror' | 'importer' | 'exporter';
export type ProductKind = 'total' | 'chapter' | 'basket' | 'stage';

export interface MetaNode {
  id: string;
  en: string;
  ko: string;
  name: string;
  region: string | null;
  subregion: string | null;
  lat: number | null;
  lon: number | null;
  groups: string[];
  hist: boolean;
  /** A partner area that is not an economy (Comtrade partner 490, "Asia, not elsewhere specified"; most importers book
   *  their Taiwan trade there): a node like any other in flows, shares, ranks and concentration, with no position, and
   *  left out only where an economy identity is needed (economy lists and views, the find box). */
  nes?: boolean;
}

export interface MetaGroup {
  key: string;
  en: string;
  ko: string;
  label_long: string;
  members: number[];
}

export interface MetaProduct {
  id: string;
  slug: string;
  kind: ProductKind;
  en: string;
  ko: string;
  codes: string[];
  /** First and last year with a snapshot. */
  A: [number, number];
  /** First and last month (YYYYMM) with monthly snapshots, when the product has monthly data. */
  M?: [number, number];
  /** The lenses drawn as maps (chain stages: L only). */
  lenses?: Lens[];
  /** First and last month (YYYYMM) of the monthly explorer's windows, when the product has them. */
  W?: [number, number];
  chain?: string;
  chains?: string[];
  stage?: number;
  stage_key?: string;
  codes_pre2022?: string[] | null;
  aliases?: string[];
  label_long?: string;
}

/** One rung of a chain's ladder (chains.yaml `levels`): its name and who makes it (the Trail's column heads). */
export interface ChainLevel {
  en: string;
  ko: string;
  who: { en: string; ko: string };
}

/** A chain as meta.json lists it: names and the ladder, so the explorer can colour and label stages without
 *  loading the chain file. */
export interface MetaChain {
  id: string;
  en: string;
  ko: string;
  levels: ChainLevel[];
}

export interface Meta {
  v: number;
  built_at: string;
  layer_built?: Partial<Record<Freq, string>>;
  nodes: MetaNode[];
  groups: MetaGroup[];
  products: MetaProduct[];
  chains?: MetaChain[];
  /** The last complete year and month: the ten largest traders all reported. */
  complete: Record<Freq, number>;
  /** The last period with any data; later than complete = partial. */
  last: Record<Freq, number>;
  /** The last period offered in the explorers: all goods' world completeness at least 0.85.
   * W: the monthly explorer's windows. Later periods stay in the tables. */
  shown?: Partial<Record<Freq | 'W', number>>;
  /** Share of 2024 world exports held by the economies that filed the period, keyed "YYYY" / "YYYYMM". */
  coverage: Record<Freq, Record<string, number>>;
  reporters: Record<Freq, Record<string, number>>;
  lenses: Partial<Record<Lens, number>>;
  records: { originals: number; budget: number; line: number };
  /** The monthly explorer's windows (scripts/build_windows.py). */
  windows?: MetaWindows;
  /** Months an economy's monthly records come from another source until its Comtrade files arrive. */
  supplements?: MetaSupplement[];
}

/** A supplement to Comtrade's monthly records: Korea's customs months. */
export interface MetaSupplement {
  /** Index into meta.nodes. */
  node: number;
  source: string;
  en: string;
  ko: string;
  url: string;
  /** First and last month, YYYYMM. */
  M: [number, number];
  /** The runs of consecutive months (Korea: 2000–2012 and the latest months). */
  ranges?: [number, number][];
  /** Day of the latest fetch, YYYY-MM-DD. */
  fetched: string;
  /** Runs of months by the day they were fetched: [first, last, YYYY-MM-DD]. */
  vintages?: [number, number, string | null][];
  /** The first month the source may still revise (the latest months): drawn and cited as preliminary. */
  preliminary_from?: number;
}

/** Window lengths in months of the monthly explorer. */
export type WindowLen = 3 | 6 | 12;

/** Estimate codes of the monthly explorer, by index: 0 reported, 1 benchmarked, 2 spliced, 3 partner-only,
 *  4 interpolated (a filed month with no row of the product, from the months around it). */
export type EstCode = 0 | 1 | 2 | 3 | 4;

export interface MetaWindows {
  w: WindowLen[];
  default: WindowLen;
  est: string[];
  /** The CIF/FOB factor wherever an exporter's report stands in for the importer's (1.06, also in the annual mirror rule). */
  cif_fob: number;
  /** Months within which a splice anchors as usual; beyond them the last anchor is kept and flagged with its year. */
  anchor_max: number;
  anchor_kept?: boolean;
  div: { w: number; history: number; min_history: number; k: number; floor?: number; min_share: number };
  /** Months (1–12) in which a window of each length may not end, so that January and February stay together. */
  skip: Record<string, number[]>;
}

export interface Totals {
  nodes: number;
  /** All flows of the full graph (the snapshot stores only the backbone candidates). */
  edges: number;
  reporters: number;
  /** Exporter HHI. */
  hhi: number | null;
  top1: number | null;
  top1_id: number;
  top5: number | null;
  /** Import-weighted supplier HHI. */
  hhi_sup: number | null;
  density: number | null;
  /** Share of value from importers' own reports. */
  imp_rep: number | null;
  exporters: number;
  /** Monthly explorer: the share of world trade that is estimated, by code (benchmarked, spliced, partner-only),
   *  and the number of flagged flows kept. */
  est?: number | null;
  est_by?: (number | null)[];
  dv?: number;
}

/** [anchor node index, size, trade share] */
export type RawCommunity = [number, number, number];

/** One period's snapshot as stored (annual file, or one element of a monthly file's `snaps`). */
export interface RawSnapCore {
  t: number;
  win: [number, number] | null;
  world: number;
  tot: Totals;
  comm: RawCommunity[] | null;
  nodes: (number | null)[][];
  edges: (number | null)[][];
}

export interface RawAnnualSnap extends RawSnapCore {
  v: number;
  p: string;
  f: 'A';
  rule: Rule;
  ncols: string[];
  ecols: string[];
}

export interface RawMonthlyFile {
  v: number;
  p: string;
  f: 'M';
  lens: Lens;
  year: number;
  rule: Rule;
  ncols: string[];
  ecols: string[];
  snaps: RawSnapCore[];
}

/** An economy in one snapshot. Values in USD are share × world. */
export interface NetNode {
  /** Index into meta.nodes. */
  i: number;
  /** ISO3. */
  id: string;
  /** Exports and imports as shares of world trade. */
  x: number;
  m: number;
  exports: number;
  imports: number;
  total: number;
  /** Share of world trade, (exports + imports) / (2 × world). */
  share: number;
  outDeg: number;
  inDeg: number;
  /** Supplier HHI (of its imports) and market HHI (of its exports). */
  hhiSup: number | null;
  hhiMkt: number | null;
  /** Top supplier (node index, −1 none) and its share of the node's imports. */
  topSup: number;
  topSupShare: number | null;
  /** Reported every month of the window (annual: the year). */
  reported: boolean;
  d10: number;
  s10: number;
  /** Supplier PageRank, buyer PageRank, betweenness and community index (annual and lens L only). */
  pv: number | null;
  pb: number | null;
  bt: number | null;
  c: number;
  /** Exports − imports (USD) and the Grubel–Lloyd index 1 − |X − M| / (X + M) (null without trade). */
  net: number;
  gl: number | null;
  /** Unit value of its exports and of its imports ($/kg), annual chain stages only, where net weight covers at
   *  least 80% of the value; else null. */
  ux: number | null;
  um: number | null;
  /** Monthly explorer: the estimate code of most of the economy's estimated imports (0 when it filed every month);
   *  null elsewhere. */
  est: EstCode | null;
  /** Monthly explorer, spliced imports: the year of the splice's anchor ("spliced on 2024"); null elsewhere. */
  ky: number | null;
  /** A partner area that is not an economy (meta.nodes[i].nes): ranked as any node, explained by NES_NOTE. */
  nes: boolean;
  rankTotal: number;
  rankExports: number;
  rankImports: number;
}

/** A flow exporter → importer in one snapshot. */
export interface NetEdge {
  s: number;
  t: number;
  /** "CHN>USA" */
  key: string;
  /** Share of world trade, and its value (w × world, USD). */
  w: number;
  value: number;
  /** Rank among the exporter's destinations and the importer's suppliers. */
  ro: number;
  ri: number;
  /** Mirror ratio (importer's report ÷ exporter's), null when one side did not report. */
  mr: number | null;
  /** 1: the drawn value is the importer's report; 0: the exporter's. */
  src: 0 | 1;
  /** The importer's and the exporter's reports (USD), from w, mr and src; null where that side did not report. */
  vm: number | null;
  vx: number | null;
  /** How far the two reports disagree: |vm − vx| / max(vm, vx), from the mirror ratio; null with one report. */
  asym: number | null;
  /** asym above DISAGREE.asym on a flow of at least DISAGREE.share of world trade ("reports disagree"). */
  disagree: boolean;
  /** Unit value of the flow ($/kg), annual chain stages only, where net weight covers ≥ 80% of the value. */
  uv: number | null;
  /** Monthly explorer: the estimate code (0 reported, 1 benchmarked, 2 spliced, 3 partner-only); null elsewhere. */
  est: EstCode | null;
  /** Monthly explorer, spliced flows: the year of the splice's anchor ("spliced on 2024"); null elsewhere. */
  ky: number | null;
  /** Monthly explorer: the divergence flag of the pair's 12-month mirror ratio (0 none, 1 below, 2 above its band). */
  dv: 0 | 1 | 2;
  /** Monthly explorer: the flag's numbers from div/<slug>.json, when the page has loaded them. */
  div?: DivInfo | null;
}

/** A divergence flag's numbers: the 12-month mirror ratio, the median and MAD of the 36 months before, the events
 *  whose code bundle matches. */
export interface DivInfo {
  r: number;
  med: number;
  mad: number;
  k: number;
  /** The band's least half-width, as a share of the median. */
  floor: number;
  events: string[];
}

/** div/<slug>.json: the divergence flags of the flows on the 12-month maps, by window end. */
export interface DivFile {
  p: string;
  level: 'TOTAL' | 'HS2';
  rule: MetaWindows['div'];
  cols: string[];
  /** {YYYYMM: {"s>t" (node indices): [ratio, median, MAD, direction, [event ids]]}} */
  t: Record<string, Record<string, [number, number, number, 1 | 2, string[]]>>;
}

export interface Community {
  anchor: number;
  size: number;
  share: number;
}

/** A decoded snapshot: one product, one period, one rule or lens. */
export interface Snap {
  product: string;
  freq: Freq;
  lens: Lens | null;
  rule: Rule;
  t: number;
  /** The months the window covers (monthly), null for years. */
  win: [number, number] | null;
  world: number;
  tot: Totals;
  comm: Community[];
  nodes: NetNode[];
  edges: NetEdge[];
  /** Node by meta index. */
  byIndex: Map<number, NetNode>;
  /** Whether PageRank, betweenness and communities are present (annual and lens L). */
  full: boolean;
  /** Monthly explorer: the window length in months; null elsewhere. */
  wlen: WindowLen | null;
}

/** series/<A|M>/<slug>.json */
export interface RawSeries {
  p: string;
  f: Freq;
  cols: string[];
  rows: Partial<Record<string, (number | null)[][]>>;
}

export interface SeriesRow {
  t: number;
  world: number;
  edges: number;
  nodes: number;
  reporters: number;
  imp_rep: number | null;
  hhi: number | null;
  top1: number | null;
  top1_id: number | null;
  top5: number | null;
  hhi_sup: number | null;
  exporters: number;
  /** Monthly explorer: the share of world trade that is estimated, and the number of flagged flows on the map. */
  est?: number | null;
  dv?: number | null;
  /** World completeness: the share of last year's flows still present. */
  cmp?: number | null;
}

/** nodes/<A|M>/<slug>.json: exports and imports (USD) of the 100 largest economies. */
export interface RawNodesFile {
  p: string;
  f: Freq;
  A?: NodesBlock;
  L?: NodesBlock;
  M?: NodesBlock;
  /** nodes/W: one block per window length ("3", "6", "12"). */
  [w: string]: NodesBlock | string | undefined;
}
export interface NodesBlock {
  t: number[];
  ids: number[];
  x: (number | null)[][];
  m: (number | null)[][];
  /** Each economy's completeness per period. */
  c?: (number | null)[][];
}

/** flows/<A|M>/<slug>.json: the 300 largest flows by peak share. */
export interface RawFlowsFile {
  p: string;
  f: Freq;
  A?: FlowsBlock;
  L?: FlowsBlock;
  /** flows/W: one block per window length ("3", "6", "12"). */
  [w: string]: FlowsBlock | string | undefined;
}
export interface FlowsBlock {
  t: number[];
  flows: [number, number][];
  w: (number | null)[][];
  mr: (number | null)[][];
  /** flows/W: the estimate code by period. */
  est?: (EstCode | null)[][];
}

export interface ChainStageYear {
  world: number;
  kg?: number | null;
  usd_per_kg?: number | null;
  kg_coverage?: number | null;
  exporters: number;
  hhi: number | null;
  top_exporters: [number, number][];
  top_importers: [number, number][];
  importer_reported: number | null;
  flows: [number, number, number][];
  /** The economies that both import and export the stage (TWO_WAY), largest first. */
  two_way?: TwoWayRow[];
}

/** A two-way trader of a stage-year: exports and imports as shares of world trade, the Grubel–Lloyd index, unit
 *  values of each side ($/kg, null where weight covers less than 80% of the value), the three largest suppliers
 *  and buyers (node indices). */
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

/** econ/<chain>/<year>.json: every economy at every stage of a chain, for a focus economy. Rows follow `cols`:
 *  i, x, m (shares of world trade), ts, tss (top supplier, −1 none, and its share of the economy's imports),
 *  ux, um ($/kg). */
export interface EconFile {
  chain: string;
  year: number;
  cols: string[];
  stages: Record<string, (number | null)[][]>;
}

export interface ChainStage {
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
  use_share: unknown;
  caveat: { en: string; ko: string } | null;
  residual: boolean;
  years: Record<string, ChainStageYear>;
  monthly?: { t: number[]; world: number[]; hhi: (number | null)[] };
}

export interface Chain {
  id: string;
  en: string;
  ko: string;
  /** The chain's ladder, from the ground to the shop; `stages[].stage` indexes it from 1. */
  levels: ChainLevel[];
  years: number[];
  chokepoint: Record<string, string | null>;
  stages: ChainStage[];
}

export type CheckStatus = 'pass' | 'watch' | 'fail' | 'info' | 'not run';

/** Two indexes (= 100 at the base) on one axis. */
export interface CheckPairData {
  t: number[];
  base: string;
  a: (number | null)[];
  b: (number | null)[];
}

export interface Check {
  id: string;
  status: CheckStatus;
  pair?: CheckPairData;
  against?: string;
  partner?: string;
  note?: string;
  [key: string]: unknown;
}

export interface ChecksFile {
  p: string;
  run_at: string;
  tiers: { tier: number; checks: Check[] }[];
}

export interface ChecksIndex {
  run_at: string;
  checks: Record<string, { tier: number; en: string; ko: string; threshold: { en: string; ko: string } }>;
  [key: string]: unknown;
}
