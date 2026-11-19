# @larch/net

The network views of trade-flow.datasteg.com: the data contract (`docs/DATA.md`) as types, a loader for
`/data/<path>.json`, **NetView** (the D3 port of the local dashboard's `netview.js`, drawn to the Larch spec in
`02-Network-maps.md`), and the chart kit (**Strip, Shares, Slope, CheckPair**) as D3 modules with
React wrappers. Colours are Larch tokens only (`var(--token)`); the canvas flow layer reads them at run time and
redraws on a theme change.

```ts
import { NetworkMap, StripChart, SharesChart, SlopeChart, CheckPairChart } from '@larch/net';   // client components
import { loadMeta, loadSnapshot, decodeSeries, stageLeaders, sourceLine } from '@larch/net/core'; // no React
```

The React components are client components (`'use client'` inside); a server component can render them and pass
plain props. They import their own CSS (`@larch/net/net.css`); the page needs `@larch/design/tokens.css` and
`larch.css`, which the `[lang]` layout already loads. Every component takes `lang` (`'en' | 'ko'`) and writes its own
words (tooltips, table headers, "partial", "base", status words) in that language.

## `<NetworkMap>` — the map, self-loading

Loads `meta.json`, the snapshot, the base snapshot (change colouring), the series (fixed scale) and, for stage
colouring, `chains/<chain>.json`. Draws the backbone with hover tooltips, click to select, keyboard focus on the 25
largest economies, zoom 0.6–10×, a source line, and "Show as table" with both tables' CSV.

| Prop | Type | Default | |
|---|---|---|---|
| `lang` | `'en' \| 'ko'` | — | page language (labels use `meta.nodes[].en/ko`) |
| `product` | `string` | — | `TOTAL`, `HS:85`, `B:semiconductors`, `C:batteries:cells` (ids or aliases in `meta.products`) |
| `freq` | `'A' \| 'M'` | `'A'` | months only for products with `M` in meta |
| `period` | `number` | `meta.complete[freq]` | `2024` or `202004` |
| `lens` | `'L' \| 'M' \| 'S'` | `'L'` | monthly lens; M and S exist for TOTAL and baskets only (else L) |
| `rule` | `'mirror' \| 'importer' \| 'exporter'` | `'mirror'` | annual all goods only |
| `base` | `number \| null` | 2017 / t−12 | base period for change colouring and base rings |
| `colorBy` | `'region' \| 'bloc' \| 'club' \| 'custom' \| 'community' \| 'change' \| 'concentration' \| 'reporting' \| 'stage'` | `'region'` | groupings from `groups/memberships.json` (membership at the end of the period); community needs annual or lens L; stage needs a chain-stage product |
| `sizeBy` | `'split' \| 'total' \| 'exports' \| 'imports' \| 'pagerank' \| 'betweenness' \| 'degree'` | `'total'` | split: imports as the left half-disc, exports as the right, one scale; PageRank/betweenness: annual and lens L only |
| `scale` | `'fixed' \| 'period'` | `'fixed'` | fixed: sizes compare across periods (value measures) |
| `layout` | `'map' \| 'force'` | `'map'` | |
| `k` | `number` | `2` | top k flows per economy (1–10) |
| `min` | `number` | `0.0002` | share floor of world trade (0.02%) |
| `labels` | `number` | `25` | N largest economies labelled (0, 10, 25, 50, 999 for all) |
| `focus` | `string \| null` | — | selected economy, ISO3; controlled when passed |
| `flow` | `string \| null` | — | selected flow, `"CHN>USA"` |
| `blocs` | `string[]` | `['EU', 'ASEAN', 'USMCA']` | colorBy `bloc`: blocs in order; an economy in two takes the first |
| `club` | `string` | `'G7'` | colorBy `club`: `G7`, `G20`, `OECD`, `BRICS` |
| `custom` | `string[]` | `[]` | colorBy `custom`: ISO3 codes |
| `membershipToday` | `boolean` | `false` | blocs and clubs: today's membership instead of the period's |
| `outline` | `string[]` | `[]` | ISO3 economies with a dashed ring (an event's economies) |
| `height` | `number \| string` | `480` | CSS height of the map |
| `interactive` | `boolean` | `true` | hover, click, keyboard, zoom |
| `table` | `boolean` | `true` | "Show as table" + CSV under the map |
| `source` | `boolean` | `true` | source line under the map |
| `onSelect` | `({focus, flow}) => void` | — | click on an economy (toggles) or a flow; background click clears |
| `onRender` | `(view: NetView) => void` | — | after each render; `view.drawn()` gives `{nodes, edges}` |
| `className` | `string` | — | |

```tsx
<NetworkMap lang={lang} product="C:batteries:cells" period={2024} colorBy="change" base={2019} focus="CHN" height={520} />
<NetworkMap lang={lang} product="TOTAL" freq="M" period={202005} lens="M" colorBy="change" outline={['CHN', 'USA']} />
```

## Chart kit (data in, no fetching)

All four take `lang`, a `label` (what the chart shows, used as its `aria-label`) and the frame props: `title?`,
`source?` (the source line: period, flow rule, HS version, lens — `sourceLine()` writes the standard one),
`csvName?`, `noTable?`, `className?`. Each renders "Show as table" and "Download CSV" (UTF-8 with BOM, headers in
the page language, numbers unformatted) unless `noTable`. Periods are `YYYY` or `YYYYMM`, ascending; values are
aligned with `periods` (`null` for gaps); shares and changes are fractions.

### `<StripChart>` — one metric over all periods

| Prop | Type | |
|---|---|---|
| `periods` | `number[]` | |
| `series` | `{key, label, colour?, values}[]` | one series (two at most, same unit); `colour` a token name (default `viz-focus`, then `viz-context`) |
| `format` | `(v: number) => string` | labels, table (`(v) => formatUSD(v, lang)`) |
| `tickFormat?` | `(v) => string` | y ticks (default `format`) |
| `tableFormat?` | `(v) => string` | table cells (default `format`), when labels round harder than the table should |
| `mark?` | `'line' \| 'bar'` | bars are the scrubber strip (52px, current bar in `viz-focus`, gold diamond) |
| `current?`, `base?` | `number \| null` | current marker; hollow base marker (draggable with `onBase`) |
| `complete?` | `number \| null` | later periods under the partial band |
| `coverage?` | `Record<string, number>` | `meta.coverage[f]`: the band reads "partial · 62% filed" when `current` is partial |
| `events?` | `{t, label}[]` | diamonds on the axis (three labelled at most) |
| `codeBegins?` | `number` | "code begins 2017" |
| `log?`, `zero?`, `height?`, `labelLast?` | | log scale for long levels; include zero; px; label the last value (default on) |
| `onPick?(t)`, `onBase?(t)` | | click a period; drag the base |

```tsx
const rows = decodeSeries(raw, 'mirror');
<StripChart lang={lang} label="Exporter HHI, lithium hydroxide" periods={rows.map(r => r.t)}
  series={[{ key: 'hhi', label: 'HHI', values: rows.map(r => r.hhi) }]} format={(v) => v.toFixed(2)}
  current={2024} base={2019} complete={meta.complete.A} source={sourceLine(lang, { freq: 'A' })} />
```

### `<SharesChart>` — top-five partner shares

| Prop | Type | |
|---|---|---|
| `periods` | `number[]` | |
| `slots` | `{key, label, values, focus?}[]` | at most five, in slot order (`viz-1` … `viz-5`); identity by slot, never by rank: fix the order once |
| `other?` | `(number \| null)[] \| null` | the rest in `viz-context` (default 1 − slots; `null` hides it) |
| `current?`, `base?`, `complete?`, `coverage?`, `height?`, `onPick?` | | as Strip; the table gives share at base, now and the change in pp |

### `<SlopeChart>` — base and now

| Prop | Type | |
|---|---|---|
| `left`, `right` | `string` | column heads ("2017", "2024") |
| `items` | `{key, label, a, b, mover?, focus?}[]` | ten at most; `a` base, `b` now (shares, or ranks with `mode="rank"`) |
| `mode?` | `'share' \| 'rank'` | default share |
| `movers?` | `number` | movers in `viz-focus`: the flagged items, else the N largest changes (default 3) |

### `<CheckPairChart>` — two indexes on one axis

| Prop | Type | |
|---|---|---|
| `periods` | `number[]` | from `pair.t` of a check in `checks/<slug>.json` |
| `base` | `string` | `pair.base` ("2019"): both lines are 100 there |
| `a`, `b` | `{label, values}` | `pair.a` (ours, Comtrade) in `viz-1`, `pair.b` (the validator) in `viz-2` |
| `status?` | `'pass' \| 'watch' \| 'fail' \| 'info' \| 'not run'` | shown as a word with an icon |

## Lower level

- `NetViewHost` — NetView in a div for pages that load their own snapshot (the explorer): `lang, meta, snap,
  config: Partial<ViewConfig>, insets?, loading?, message?, interactive?, productLabel?, onSelectNode?,
  onSelectFlow?, onRender?, viewRef?`.
- `NetView` (class) — `new NetView(host, {lang, meta, insets, onSelectNode, onSelectFlow, onRender})`, then
  `render(snap, config, animate)`, `fit()`, `ensureVisible(iso, box)`, `setInsets()`, `setLoading()`, `message()`,
  `drawn()`, `destroy()`.
- Loader: `loadMeta()`, `primeMeta(meta)`, `loadSnapshot(meta, product, f, t, {lens, rule})` (64 files cached,
  decoded snapshots too), `prefetchSnapshots()`, `loadSeries()`, `loadNodeSeries()`, `loadFlowSeries()`,
  `loadChain()`, `loadChecks()`, `periodsOf(product, f, lens)`.
- Decoding: `decodeSnap()`, `compareBase(baseSnap)` (a flow the base did not keep is bounded by
  `min(d10[s], s10[t], 0.0005)`), `growth()`, `decodeSeries(raw, rule | lens)`, `momentum(rows)`.
- Chains: `stageLeaders(meta, chain, year)` (ISO3 → stage, for `colorBy="stage"`), `stageNeighbours(chain, key)`,
  `groupMembers(meta, spec)`.
- Server: `staticScene(meta, snap, config, world, box, lang)` with `worldFromTopology()` draws the first view
  without a DOM (the explorer server-renders it).
- Tables: `flowsTable()`, `nodesTable()`, `tableCSV()`, `downloadCSV()`; each chart module exports its
  `*Table(options)`.
