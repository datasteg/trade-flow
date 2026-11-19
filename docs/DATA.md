# The data the site reads

Built by `scripts/build_snapshots.py` (annual snapshots, series, chains), `scripts/build_windows.py` (the monthly
windows: every monthly number on the site), `scripts/build_products.py` (HS chapters by economy), `scripts/build_stories.py` (events, cases, what
changed) and `scripts/checks.py` (checks) from the
trade-collector Comtrade layer (monthly reads add the Korea Customs Service supplement for the months Korea has not
filed with Comtrade; Comtrade wins wherever it holds a month: `layer()` in build_snapshots.py), into `data/` (gitignored, copied into the image). Every file is
brotli-compressed JSON on disk (`<path>.json.br`) and is served at `/data/<path>.json`
(`apps/web/app/data/[...path]/route.ts`); server components read it with `readData()` (`apps/web/lib/data.ts`).

**Two rules, one per frequency**:
years follow the **annual mirror rule** (the importer's report where it filed the year, else the exporter's report
times 1.06, CIF/FOB); months follow the **one monthly rule**, the windows of `build_windows.py` (the importer's report
for every month it filed, else the exporter's report spliced (κ), benchmarked to the importer's annual file, or times
1.06; a flow counts in a window only when positive in every month). The monthly lenses (`snap/M`, `series/M`, `nodes/M`,
`flows/M`) are retired: the chain strips, the event maps and strips and the stories read the windows, and check K4
(`scripts/checks.py`) fails if any page or script reads a retired file or one is on disk.

Node references are **indices into `meta.nodes`**. Product ids: `TOTAL`, `HS:<chapter>`, `B:<basket>`,
`C:<chain>:<stage>`; file names write `:` as `-` (`slug`). A stage shared by two chains with the same codes
is one product, named after the first chain; the other id is in `aliases`.

## Derived records

No original bilateral record is stored. A flow is its **share of the product's world trade** (`w`, three
significant digits); the snapshot carries one world total (`world`, USD). Values on screen are
`w × world`. A flow's two reports come from the mirror ratio `mr` (importer's report ÷ exporter's):
if `src` is 1 the drawn value is the importer's report, so `vm = w × world` and `vx = vm / mr`; if `src`
is 0 the drawn value is the exporter's report times 1.06 (annual mirror rule; 1.0 in the `exporter` view), so
`vx = w × world / 1.06` and `vm = vx × mr`; `mr` is null when one side did not report the flow. Node
totals, HHI, ranks and shares are indicators. CSV downloads carry only what a chart shows. The record
count is in `meta.records` (originals 0, budget 90,000).

## meta.json

| Key | What |
|---|---|
| `nodes[]` | `{id, en, ko, name, region, subregion, lat, lon, groups, hist, nes?}`: 274 nodes; `en`/`ko` short names from `config/names.yaml`; `hist` = historical (USSR, East Germany …). `nes: true` marks a partner area that is not an economy: `S19`, **Asia, not elsewhere specified** (Comtrade partner code 490, `build_snapshots.ASIA_NES`; the measures registry's `asia_nes`), never Taiwan. Most importers book their trade with Taiwan under 490; Gulf exporters book unnamed Asian destinations there. It is a partner node like any other in flows, shares, rankings, HHI, `top1`/`top5`, counts, node series and stage top lists; it has no position, region or groups, and is left out only where an economy identity is needed: the API's economies list and economy view, the find box and focus economies, `products.json` economies and `changes.json` items. Wherever it is named in a ranking, tooltip or chain page the app adds the note `nesNote`. Taiwan (`TWN`) keeps its node but has no flows, since Comtrade holds Taiwan's trade under 490 |
| `groups[]` | `{key, en, ko, label_long, members: [node index]}`: G7, EU27, BRICS, ASEAN, USMCA, OPEC, WEST, EAST |
| `products[]` | `{id, slug, kind: total/chapter/basket/stage, en, ko, codes, A: [first, last], M?: [first, last], W?: [first, last], chain?, chains?, stage?, stage_key?, codes_pre2022?, aliases?, label_long?}`; `M` = `W`, the first and last 12-month window (products with windows only) |
| `chains[]` | `{id, en, ko, levels: [{en, ko, who: {en, ko}}]}`: each chain's ladder (chains.yaml `levels`), so the explorer can colour and label a stage without the chain file; `stage` on a product indexes it from 1 |
| `complete` | `{A: 2024, M: 202412}`: the last complete year and month (the ten largest traders all reported, and coverage ≥ 98%) |
| `last` | `{A: 2025, M: 202609}`: the last period with any data; later than `complete` = partial |
| `shown` | `{A, M, W}`: the last period the explorers offer and pages read, the last one in which all goods' world completeness (series `cmp`) is at least 0.85 (`build_snapshots.SHOWN_MIN`); W from the 12-month windows. Later periods stay in the files and tables |
| `coverage` | `{A: {YYYY: share}, M: {YYYYMM: share}}`: the share of 2024 exports held by the economies that filed the period (months: of the economies that file monthly) |
| `reporters` | `{A: {YYYY: n}, M: {YYYYMM: n}}` |
| `lenses` | `{L: 12, M: 3}`: the window a lens stands for (L the 12-month window, M the 3-month window, of the one monthly rule) |
| `windows` | the monthly rule: `{w: [3, 6, 12], default: 12, est: [codes 0–4], cif_fob: 1.06, anchor_max: 24, anchor_kept: true, div: {…}, skip: {w: [months]}}`; `cif_fob` is the one factor on an exporter's report standing in for the importer's (also the annual mirror rule); `anchor_kept`: beyond `anchor_max` months a splice keeps the last anchor, flagged with its year; `skip` lists the months in which a window of that length may not end (January and February stay together); products with windows carry `W: [first, last]` |
| `records` | `{originals: 0, budget: 90000, line: 100000}` |
| `volume` | the same block as `data/volume.json` (below) |
| `supplements` | `[{node, source: "KCS", en, ko, url, M: [first, last], ranges: [[first, last], ...], fetched}]`, `ranges` the runs of consecutive months (Korea: 2000–2012 and the latest months): months an economy's monthly records come from another source until its Comtrade files arrive (Korea from the Korea Customs Service); empty with `--no-supplement` |

`volume.json` (plain JSON, not brotli, not served; `volume()` in build_snapshots.py, full, `--meta-only` and
`--volume-only`): rows and bytes of each publisher's data as collected, for the www portal's Data chart, read from trade-collector's manifests and never estimated. `{schema: 1, app,
measured_at, items: [{id, publisher, rows, bytes, files, newest, row_is, read_from}], rows, bytes}`. UN Comtrade: the
files the network layer reads (final data, goods, annual and monthly, not superseded, no tariff-line files), one per
reporter and period (the latest publication), rows = `gz_lines` − 1, bytes = `gz_bytes`. Korea Customs Service:
`months.rows`, bytes = the raw `.xml.gz` files in `calls.raw_path`. A gap gives null, not a partial sum.

## The export surface (surface 1.0)

What global-network reads (`../global-network/docs/SURFACES.md`); it collects nothing itself. A reader opens
`surface.json` first and refuses a major version it was not written for.

`surface.json` (plain JSON, not brotli): `{surface: "1.0", built, shown, complete_a, files}` — `built` the local time
with offset, `shown` = `meta.shown.W`, `complete_a` = `meta.complete.A`, `files` the paths and globs listed below as
the site serves them (`<path>.json`). Written by `build_snapshots.py` (full and `--meta-only`) and by
`build_windows.py` (which sets the shown window).

`products.json` (`scripts/build_products.py`, after `build_windows.py`; moved from global-network on 2 Nov 2026):

```
{read, trade_flow_built, shown, ends: [YYYYMM], window: 12, cols: [x, m, x_est_share, x_est_code, m_est_share, m_est_code, x_est_year, m_est_year],
 chapters: {"01": {en, ko}, …}, world: {ch: {YYYYMM: USD}}, econ: {ISO3: {ch: {YYYYMM: [x, m, x_est_share, x_est_code, m_est_share, m_est_code, x_est_year, m_est_year]}}},
 rule, check}
```

- Each economy's exports and imports (USD) in every HS chapter (the 96 chapters of `meta.products`; 77, 98 and 99 are
  not built and stay in the residual "other") over the 12-month windows ending in `ends`: the 36 months to the shown
  month and the year before them, so a reader can take each economy's own shown month (the last window complete for
  it, up to two years before the world's) and its year-earlier window. Economies: those with an all-goods 12-month
  line (`nodes/W/TOTAL.json`, the 100 largest by peak trade), Asia, n.e.s. (`S19`) left out: it has no country sheet.
- The windows are `build_windows.py`'s run on the chapters (`apply_rule`, the same function as every
  monthly product): the importer's report where it filed, else the exporter's spliced, benchmarked or times 1.06; a
  flow counts only when positive in every month. A reporter that filed a month but sent no row of the chapter in a
  direction did not file that chapter (`product_filed`; since 17 Nov 2026 the rule of every monthly product, L2); such
  a month between two months that hold the chapter is interpolated flow by flow (estimate code 4), any other is left
  to the partners. `x_est_year`/`m_est_year`: where the side's estimate is mostly spliced (code 2), the year of the
  splice's anchor ("spliced on 2024"), else null. `x_est_share` is the estimated share of the economy's exports in the chapter and `x_est_code` the code
  holding most of it (1 benchmarked, 2 spliced, 3 partner-only, 4 interpolated); `m_…` likewise for imports.
- Aggregates by economy and chapter only; a reader publishes values, shares of the economy's total and changes.
- `check`: the chapter sums against the all-goods window at the shown month. The two cannot agree to the percent by
  construction: a chapter flow is lumpy where the all-goods flow is not (gold from Kyrgyzstan, soybeans into China,
  oil cargoes), so the positive-months rule drops it at chapter level, and chapter-specific splices can put the sum a
  little above. On 2 Nov 2026 the sums were 0.65 (Georgia) to 1.07 (Hong Kong) of exports and 0.94–1.02 of imports for
  the economies that reported every month of the window, most of them 0.95–1.0 (0.06–1.01 and 0.43–1.01 for those
  whose all-goods window is itself the partners' estimate), the world 0.988. Enforced: the world within `CHECK_TOL` (2%) and every reported side of at least $1bn
  inside `CHECK_BAND` (0.90–1.07; a missing or broken chapter of a large economy falls outside it), unless listed in
  `CHECK_EXCEPTIONS` with its reason (Georgia's and Azerbaijan's exports). `check.econ` carries every ratio
  (`x`, `m`, `r` = reported every month), `check.world` the world's; chapter 99 is windowed for the check only.

`changes.json` (`scripts/build_stories.py`; ported from global-network's `build.py` on 2 Nov 2026 so the numbers
match): `{shown, prev, items: [...]}`, `prev` the window end before the shown month (windows skip January). Items,
all with `side: "trade"`, for every economy with an all-goods 12-month line:

| kind | fields | rule |
|---|---|---|
| `export_sign` | `eco, t, mom: [before, now], base: [before, now]` | the economy's 12-month export momentum (% against the 12-month window ending exactly 12 months earlier, found by month, not by list position, since the windows skip January; `base` names those windows; null where either window is incomplete, check K1) changed sign between its own shown window `t` and the one before. The own shown window is the last at or before the world's shown month whose completeness `c` ≥ 0.9; an economy without one takes the world's |
| `divergence` | `eco, t, partner, dir, mr` | one of the economy's five largest destinations in its own shown window carries the divergence flag `dv` (`dir` 1 below the pair's band, 2 above; `div/TOTAL.json`), with the mirror ratio |
| `chokepoint` | `chain, chain_name: {en, ko}, year, from, to, from_name, to_name` | the chain's chokepoint stage (`chains/<chain>.json`) differs between the chain's year and the year before (null = none) |

`events/index.json` entries carry `replay: true|false`: whether global-network replays the event, from its
`data/surface.json` (`replays`) when present, else the ids under `replays:` in its `config/shocks.yaml`, else false.

## Snapshots

`snap/A/<slug>/<YYYY>.json` — one year, mirror rule. `TOTAL` also has `<YYYY>.importer.json` and
`<YYYY>.exporter.json`. Years: TOTAL 1962–2025, others 1995–2025 (from the year the code exists).

```
{v, p, f: "A", rule, t, win: null, world, tot, comm, ncols, nodes, ecols, edges}
```

`snap/A` is the annual mirror rule: the importer's report where it filed the year, else the exporter's report times
1.06 (CIF/FOB: the same factor as the monthly windows' partner-only months; the `importer` and `exporter` views draw
one side as filed). The monthly lenses' `snap/M/<slug>/<YYYY>.<lens>.json` (one side per window, the exporter's report
as is) were retired on 17 Nov 2026: months are the windows below (`snap/W`), and a lens now
names a window, L the 12-month window and M the 3-month window.

`tot`: `nodes`, `edges` (all flows of the full graph), `reporters`, `hhi` (exporter HHI), `top1`, `top1_id`,
`top5` (shares of world exports), `hhi_sup` (import-weighted supplier HHI), `density`, `imp_rep` (share of
value from importers' reports), `exporters`.

`comm`: `[anchor node, size, trade share]` per community (Louvain on the symmetrised graph, seed 7),
largest first; `nodes[].c` indexes into it.

`nodes` rows follow `ncols`:

| col | |
|---|---|
| `i` | node index |
| `x`, `m` | exports, imports as shares of world trade (value = share × world) |
| `od`, `id` | number of destinations, suppliers |
| `hs`, `hm` | supplier HHI (of its imports), market HHI (of its exports) |
| `ts`, `tss` | top supplier (node index, −1 none) and its share of the node's imports |
| `r` | 1 if the economy reported every month of the window (annual: the year) |
| `d10`, `s10` | the 10th-largest destination / supplier flow, as a share of world (0 if fewer). A flow absent from a snapshot was at most `min(d10[s], s10[t], 0.0005)`: use it as the base value bound in change colouring |
| `pv`, `pb`, `bt`, `c` | supplier PageRank, buyer PageRank, betweenness, community — annual and 12-month windows only (`ncols` says) |
| `ux`, `um` | unit value of its exports and of its imports, $/kg — annual chain stages only, null unless net weight covers ≥ 80% of the value |

`edges` rows follow `ecols`: `s`, `t` (exporter, importer), `w` (share of world), `ro` (rank among the
exporter's destinations), `ri` (rank among the importer's suppliers), `mr` (mirror ratio or null),
`src` (1 importer's report, 0 exporter's), and for annual chain stages `uv` (the flow's unit value, $/kg, null
unless net weight covers ≥ 80% of its value; a ratio, so still a derived record). Kept: `ro ≤ 10` or `ri ≤ 10` or
`w ≥ 0.0005`, largest first.

The gap between a flow's two reports is derived, not stored: `asym = |mr − 1| / max(mr, 1)`
(= |importer's − exporter's| / the larger). The app marks "reports disagree" where `asym > 0.5` on a flow of
`w ≥ 0.01` (packages/net/src/twoway.ts), in tables and tooltips only.

## Series

`series/A/<slug>.json`: `{p, f, cols, rows: {mirror|importer|exporter: [...]}}`,
`cols = [t, world, edges, nodes, reporters, imp_rep, hhi, top1, top1_id, top5, hhi_sup, exporters, cmp]`, `cmp` the
world's completeness: the value a year earlier of the flows still present, over all flows a year earlier
(`build_snapshots.Completeness`). The months are `series/W` (below); growth over the
year compares a window with the window ending 12 months earlier, found by month (the windows skip January).

`nodes/A/<slug>.json`: `{p, f, A: {t: [periods], ids: [node index], x: [[USD by period]], m: [[USD]]}}`
and `c: [[completeness by period]]` for the 100 largest nodes of the product (by peak trade; Asia, n.e.s. included). Aggregates, in USD. `c` is the share of the economy's usual trade the period holds (its flows a year earlier still
present, by value; a thin reference year steps back another year, at most twice); under 0.9 (`COMPLETE_SHARE`) its line
stops.

`flows/A/<slug>.json`: `{p, f, A: {t, flows: [[s, t]], w: [[share by period]], mr: [[ratio]]}}` for the
300 largest flows by peak share.

## The monthly windows: the one monthly rule

`scripts/build_windows.py`, run after `build_snapshots.py`. Every monthly product (TOTAL, baskets, chain stages); the
same rule (`build_windows.apply_rule`) builds the HS chapters of `products.json` and every monthly number of the events
and cases (`build_stories.py`). Every monthly number on the site is one of these windows: the monthly explorer, the
chain pages' monthly and focus strips (`chains/<chain>.json` `monthly`, `nodes/W` `"12"`), the event maps and lead
strips (`snap/W`, `series/W`: 3-month windows for lens M, 12-month for lens L), the stories' measures and the API.

`snap/W/<slug>/<YYYY>.w<w>.json` — the windows of w = 3, 6 or 12 months ending in the months of a year:

```
{v, p, f: "W", w, year, rule: "window", ncols, ecols, snaps: [{t: YYYYMM, win: [first, last], world, tot, comm, nodes, edges}]}
```

- No window ends in January; 3-month windows not in April, 6-month windows not in July (`meta.windows.skip`).
- A flow's value is the sum over the window of one monthly series: the importer's report where it filed; else,
  where the exporter filed, an estimate: **spliced** κ(m) × exporter's report, κ(m) = importer ÷ exporter over the 12
  months ending a year earlier (else the latest such 12 months within 24; else, for an importer that stopped filing,
  the last such 12 months however old, flagged with that year: "spliced on 2024", so no step when the anchor
  passes 24 months); **benchmarked** (proportional Denton to the importer's annual file, every estimated month of a
  year the annual file covers, the partner-only months of economies that file annually but not monthly included); **partner-only** (no anchor at all, or a spliced month above 5 × the importer's own average month in the
  anchor year): the exporter's report × 1.06 for every importer (the factor of the annual mirror rule).
- A reporter that filed a month but sent no row of the product in a direction did not file the product that month
  (`product_filed`, L2; Japan's April 2026 file has no chapter 84 or 85 rows): such a month between two months that
  hold the product is interpolated flow by flow (code 4), any other is estimated from the partners. Its zero is never
  a report. Check K5 (`checks.py`) fails when an economy that filed every month of a 12-month window loses at least
  half of a side worth 0.5% of the product's world trade from one window to the next.
- Kept only when positive in every month (as above); `mr` only when both reports are positive in every month and the
  window is reported.
- `ecols` = `s, t, w, ro, ri, mr, src, est, dv, ky`: `est` 0 reported, 1 benchmarked, 2 spliced, 3 partner-only,
  4 interpolated (the flow's worst month); `dv` the divergence flag of the pair's 12-month window ending in t (0, 1
  below, 2 above); `ky` for a spliced flow the year of the oldest anchor among its spliced months, else null.
  `src` is 1 for a reported flow.
- `ncols` = the annual columns with the network measures (w = 12) or without them (3, 6), plus `est`: the code of most
  of the economy's estimated imports, and `ky`: the anchor year of most of its spliced imports (code 2), else null.
  The estimated share of an economy is not written (with it, the reported part of a partly filed window would be a
  sum over fewer months than the window).
- `tot` adds `est` (share of world trade estimated), `est_by` (benchmarked, spliced, partner-only, interpolated) and
  `dv`.
- Kept flows: 1,500 / 600 / 600 (TOTAL at 12 / 6 / 3 months), 600 / 300 / 300 (baskets), 300 (stages).

`series/W/<slug>.json`, `nodes/W/<slug>.json`, `flows/W/<slug>.json`: as the annual files, keyed by window length
(`"3"`, `"6"`, `"12"`) on the windows' end months; series add the columns `est` and `dv` (before `cmp`), flows add `est`
(codes by period). Growth over the year compares a window with the window of the same length ending 12 months
earlier, by month (`t − 100`), never by list position (L1, check K1).

`div/<slug>.json` (TOTAL and chain stages): `{p, level: TOTAL|HS2, rule, cols: [r, med, mad, dir, events], t: {YYYYMM:
{"s>t": [...]}}}` for the flagged flows of the 12-month maps: the pair's 12-month mirror ratio, the median and MAD of
the 36 months before, the direction and the ids of events whose products and economies match.

`diag/<slug>.json`: the tier-0 diagnostics (timing share, splice backtest by window and importer size, the
single-month test, the share left out by the positive-months rule, benchmark counts); aggregates only.
`checks.py run` turns them into the checks `timing_share`, `splice_backtest` and `windows_guard`, and
`checks/index.json` carries `windows`, the summary for /method/checks.

## Chains

`chains/index.json`: `{chains: [{id, en, ko, levels, stages, year, chokepoint, world: {stage: USD}, two_way: {stage, i, gl} | null}]}`
(`two_way`: the most two-way stage of the year, see below).

`chains/<chain>.json`: `{id, en, ko, levels: [{en, ko, who: {en, ko}}], years, chokepoint: {YYYY: stage key|null}, stages: [...]}`.
`levels` is the chain's ladder from the ground to the shop (four to eight rungs; `who` names the rung's makers, the
Trail's column heads); each stage sits on one rung:
`{key, product, stage (1 … levels.length), en, ko, codes, codes_pre2022, feeds, shared, role, use_share, caveat: {en, ko},
residual, years: {YYYY: {world, kg, usd_per_kg, kg_coverage, exporters, hhi, top_exporters: [[node, share]],
top_importers, importer_reported, flows: [[s, t, share]] (8 largest), two_way: [{i, x, m, gl, ux, um, sup, buy}]}},
monthly: {w: 12, t, world, hhi, est, cmp}}` (the 12-month windows of `series/W`, the one monthly rule).
Unit values only where `kg_coverage ≥ 0.8`. Chokepoint: the non-feedstock stage worth ≥ $1bn with the
highest exporter HHI, when above 0.25.

`two_way`: the economies that both import and export the stage (`TWO_WAY` in build_snapshots.py): Grubel–Lloyd
index `gl = 1 − |X − M| / (X + M)` ≥ 0.3 and exports `x` and imports `m` each ≥ 2% of world trade in the stage
(shares of world); `ux`, `um` the unit value of each side ($/kg, null below 80% weight coverage); `sup`, `buy` its
three largest suppliers and buyers (node indices). Largest first. The most two-way stage of a year (index page,
chain head): the highest `gl` among two-way traders that are top-five exporters or importers, feedstocks left out.

`econ/<chain>/<year>.json`: `{chain, year, cols: [i, x, m, ts, tss, ux, um], stages: {stage key: [[...]]}}`, one row
per economy trading the stage (shares of world trade, top supplier and its share of the economy's imports, unit
values). Loaded only when a reader sets a focus economy (`?focus=ISO3`); ranks are computed in the page.

`stages/<slug>.json`: the same `years` for one stage product, with the `econ` rows the econ files are made from.

## Groupings

`groups/memberships.json` (from `config/groups.yaml` and `config/memberships.csv`):
`{v, schemes: {region: [keys], bloc: [keys], club: [keys]}, custom: {en, ko, colour}, groups: {key: {kind, en, ko,
colour, note, members: [[ISO3, first day, last day]], sources: [url]}}}`. Dates are YYYY-MM-DD, both inclusive,
null for open (regions have none). A map reads membership on the last day of the period shown (31 December, or the
month's last day), or today's; overlapping blocs take the reader's first. Colours are fixed tokens per group.

## Checks

`checks/<slug>.json`: `{p, run_at, tiers: [{tier, checks: [{id, status: pass|watch|fail|info|not run, …}]}]}`;
check pairs carry `pair: {t, base, a, b}` (two indexes, = 100 at the base). `checks/index.json`: what each
check is (`checks`), counts by status, one row per product and check, the validators and the record count.

`checks/consistency.json` (`checks.py run`, and `checks.py consistency` after `build_stories.py`): the consistency
checks of the flow sites' consistency rules that trade-flow runs, each failing the build: **K1** every
growth base window in `changes.json` ends exactly 12 months before its window, and the growth agrees with the windows;
**K4** no page, component or script reads a retired monthly lens and none is in `data/`; **K5** no reported zero (an
economy that filed every month of a 12-month window does not lose half of a side worth 0.5% of the product's world
trade and US$1bn from one window to the next). `{run_at, plan, checks: [{id, status, …}], ok}`.
