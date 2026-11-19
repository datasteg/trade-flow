# The "what changed" panel: replacing the before/after network map on event pages

A one-time site change (the prompt's second part). Until it lands, the critique records what the map hides for
the event at hand; once it lands, step D of the review checks the panel's headline and rows against
`event_numbers.py --levels`.

## Why the map goes

`components/stories/EventMap.tsx` draws `NetworkMap` in change colouring with a Before/After toggle and a "Play
the event" animation. On the base date every node is grey (colour = change), so "before" carries nothing; the
toggle only adds colour and the flow widths barely move; the thick flows are the largest economies' (US-centred),
not the event's; hundreds of small grey nodes and the East Asia label cluster add noise; there is no legend for
red/blue/yellow; and the page's main finding (Netherlands → China) is invisible. A reader should get the main
change in five seconds with no toggling: **which economies and which flows of the event's product changed most,
from what to what.**

## Spec

1. **Headline sentence**, generated from data, above the chart: the biggest change in one line. Example:
   "China's chip-equipment imports +31%; Netherlands → China rose from $0.5bn to $2.7bn (11% → 47% of Dutch
   exports)." Strings in `lib/strings/events.ts` with placeholders; numbers through the shared formatters.
2. **One product**: the event's `view.p` is already its primary product. Add a `primary_product` key to
   `config/events.yaml` only for an event whose main industry is not its view product (then the panel needs a
   snapshot of that product at the view's lens: baskets and TOTAL have lenses L, M, S; chain stages only L).
   No product selector here; the partner-share section below has one.
3. **Dumbbell (or slope) of the top flows**: 5–7 rows, ranked by absolute USD change between the base and the
   "after" window. A row is one bilateral flow A → B; hollow dot = before, filled dot = after, a line between
   them coloured by direction. Value label at the after dot in USD, with the % change; the share line
   ("of A's exports: 11% → 47%") under it, so a share that rises because the denominator shrank is visible.
   Levels and shares together, never shares alone.
4. **Optional mini-panel**, only if it adds meaning: top 3 gaining and top 3 losing economies (exports or imports
   of the product) as a diverging bar. `components/stories/BarList.tsx` with `diverging` already does this.
5. **Caption with the event marker**: the exact windows and the dated measures they straddle, from the timeline
   items that fall between the base and t (e.g. "Jul–Sep 2022 vs Jul–Sep 2023; Japan's controls 23 Jul 2023,
   Dutch licence rule 1 Sep 2023").
6. **Remove**: the Before/After toggle, "Play the event", the force layout, unrelated-economy nodes, region
   labels. **Keep**: "Show as table" and the CSV (`Figure` + `FigureTools`), the source line, the "What to watch"
   line. Consider one link "Open in the explorer" (`/[lang]/explore?…` with the product, period and base) for
   readers who want the network.
7. **Style**: Larch tokens only. Direction colours as the diverging bars use them: `--div-pos-2` (grew) and
   `--div-neg-2` (fell); the before dot hollow with `--viz-axis`; focus economies may keep the trail marker.
   Legend or direct labels for the two colours. Phone width 320–400 px with no horizontal scroll (labels above
   the dumbbell on narrow screens, like `.st-bars` at ≤ 479 px). Dark mode comes from the tokens.
8. **Data rules**: the same lens and mirror rule as the rest of the page. Flows come from the snapshots
   (`data/snap/M/<slug>/<YYYY>.<lens>.json`, or `snap/A/<slug>/<YYYY>.json`): value = `w × world`, one side per
   flow (`src`), `w` to three significant digits. A flow qualifies only if it is ≥ 1% of world trade in the
   product in either window (no +500% on $1m). A flow missing from one snapshot is at most
   `min(d10[exporter], s10[importer], 0.0005) × world`: show it as "≤ $x" rather than 0.
   `event_numbers.py <slug> --levels` is the reference computation (Python); port it to TypeScript in
   `page.tsx` (server side, `readData`) so the page and the check agree.

## The numbers it must reproduce for `us-chip-controls-2022` (Jul–Sep 2022 → Jul–Sep 2023, lens M)

From `event_numbers.py us-chip-controls-2022 --levels` on 25 Oct 2026 (store built 24 Oct 2026):

| Flow | Before | After | Change | Of exporter's exports | Of importer's imports |
|---|---|---|---|---|---|
| Netherlands → China | $510m | $2.7bn | +$2.2bn (+436%) | 10.6% → 46.7% | 5.5% → 22.7% |
| Japan → Taiwan | $1.8bn | $654m | −$1.1bn (−64%) | 21.2% → 10.6% | 23.2% → 18.8% |
| Netherlands → Taiwan | $2.2bn | $1.2bn | −$1.1bn (−48%) | 46.4% → 20.1% | 28.9% → 33.8% |
| United States → Taiwan | $1.5bn | $673m | −$875m (−57%) | 22.3% → 14.7% | 20.0% → 19.3% |
| Singapore → Taiwan | $1.5bn | $638m | −$855m (−57%) | 35.4% → 15.6% | 19.3% → 18.3% |
| Germany → Netherlands | $705m | $1.3bn | +$622m (+88%) | 43.4% → 52.0% | 60.0% → 69.8% |
| United States → Korea | $1.3bn | $695m | −$593m (−46%) | 18.5% → 15.2% | 26.7% → 19.3% |

Gainers: China imports +$2.8bn (+31%), Netherlands exports +$1.0bn (+21%), Germany exports +$927m (+57%).
Losers: Taiwan imports −$4.3bn (−55%), United States exports −$2.4bn (−34%), Japan exports −$2.3bn (−27%).

**Caveat the prompt did not anticipate.** Japan → China is +16.4 pp as a share of Japan's exports (35.2% → 51.6%)
but only **+$209m (+7%)** in USD ($3.0bn → $3.2bn): the share rose because Japan's sales to Taiwan fell by
$1.1bn. Ranked by USD change it is not a top-7 row. Two options for the user to choose:
(a) rank strictly by USD and let the headline or a reading item carry the Japan → China share story;
(b) add the flows between the event's named economies whose share moved ≥ 10 pp, marked as share movers.
Either way, show the level next to the share.

The snapshot's shares and the partner-share charts can differ in the tenths (three vs four significant digits):
46.7% here, 46.6% in the diversion list. Use the snapshot's own share on the panel and say in the method note
that the two are the same flow at different rounding, or recompute the panel's share from the series file.

## Verify

- The rows above for `us-chip-controls-2022`, the gainers and losers, and the caption's dates.
- Render all 14 pages in both languages at desktop and 375 px (`scripts/shots.sh <slug>`), look for overlapping
  labels, empty space and a missing legend.
- Show the user before/after screenshots of `us-chip-controls-2022`, `red-sea-2023` and `covid-2020` before
  finalising. (`red-sea-2023` and `covid-2020` view TOTAL: the floor keeps the dumbbell to the largest bilateral
  flows, which is the point of the Red Sea page: values held while routes changed.)
