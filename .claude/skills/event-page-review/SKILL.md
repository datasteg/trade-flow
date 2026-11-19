---
name: event-page-review
description: Critique and refine one trade-flow economic-event page (/ko|en/events/<slug>) or all fourteen - recompute the page's numbers, find the figures that contradict the event's headline, explain them with sourced mechanisms (front-loading, scope gaps, substitution, rerouting, share effects, prices, cycle, overlapping events, reporting artefacts), audit the before/after window and the labels, and add a bilingual "Reading the numbers / 숫자 읽기" section with citations. Use it whenever the user asks to review, critique, fact-check, explain, add context to or "fix the confusing numbers on" an event page, to audit an event's window or labels, when a new event is added to config/events.yaml, and for the related chart work on event pages (the "what changed" panel that replaces the before/after map).
argument-hint: <slug | all> [--reference-first]
metadata:
  version: 0.1.0
  scope: trade-flow only
---
# event-page-review

## Purpose

Each event page measures what moved in UN Comtrade data and says, on purpose, that it does not say why. That
stance stays: the measurement sections only **measure**. But a number that contradicts the headline (Dutch
chip-tool exports to China quadrupling under export controls) leaves the reader confused, and the explanation is
usually documented somewhere. This skill finds those numbers, tests the standard mechanisms against the site's own
data, backs the ones that hold with sources, and puts them on the page in a separate, clearly labelled section.
Nothing on the page may rest on your own inference.

## Where things live (read, don't guess)

| What | Where |
|---|---|
| Event text, dates, timeline, products, economies, the view (product, base, t, lens), sources, and the new `reading` | `config/events.yaml` (one entry per event, in date order; `n` numbers the sources) |
| Measured numbers for a page | `data/events/<slug>.json.br`, written by `uv run scripts/build_stories.py --only <slug>` (about 2 s; needs the Comtrade network layer the trade collector builds). All yaml keys except `view` are copied through. |
| The page | `apps/web/app/[lang]/events/[event]/page.tsx`; strings `apps/web/lib/strings/events.ts`; types `apps/web/components/stories/types.ts`; styles `apps/web/app/[lang]/cases/stories.css`; the map `components/stories/EventMap.tsx` |
| Product and economy names, caveats | `config/names.yaml`, `config/chains.yaml` (`caveat`, `role`, codes), `data/meta.json` |
| USD levels and flows (the explorer's numbers) | `data/snap/<A|M>/<product-slug>/…` and `data/series/…` (`docs/DATA.md`: value = `w × world`, one side per flow, three significant digits) |
| Critique files | `notes/event-critiques/<slug>.md` (create the folder on first use; it is committed) |
| This skill's tools | `.claude/skills/event-page-review/scripts/` and `references/` (paths below are relative to `trade-flow/`) |

Run every command from `trade-flow/`. Scripts are `uv run` Python with inline dependencies (`--offline` works).

## When and how to run

- **One slug**: the full cycle below on that event.
- **A new event**: after its entry, data and figures exist, the same cycle; the critique doubles as the launch check.
- **All events**: do `us-chip-controls-2022` first as the reference, show the user the rendered page and the
  critique, and wait for a go before the other thirteen. Then run them one at a time (each needs its own research);
  parallel subagents are fine for the research step only, with the critique file as their brief.
- The before/after map's replacement (`references/what-changed-panel.md`) is a separate, one-time code task; do it
  only when asked, and once it exists, step D checks its numbers too.

## Step 0 — Load the page as it is

1. `uv run .claude/skills/event-page-review/scripts/event_numbers.py <slug> --levels` prints every number the
   page shows, computed the way `page.tsx` computes it: the lead strip (world trade on a year earlier), the named
   economies' year-on-year bars, the diversion list (every partner-share change, the top 10 the page draws), the
   movers slopes, each partner-share chart's reading, the missing and muted rows, the sources, and with
   `--levels` the USD levels at base and t from the snapshots (the named economies' exports and imports, the largest
   flows by USD change with their "of exporter" and "of importer" shares, the flows between the named economies,
   gainers and losers). `--at YYYYMM` prints every series at another period (the series run from the base −12
   months to t +6 months). `--json` for diffs. It also flags duplicate labels.
   Traps it makes visible: the same flow appears twice in the diversion list when it is read once as a share of the
   exporter's exports and once of the importer's imports; snapshot shares and series shares can differ in the
   tenths (three vs four significant digits); grey bars are economies that had not filed or whose series is erratic.
2. Read the entry in `config/events.yaml` (timeline dates, sources) and the page's section order in `page.tsx`.
3. Look at the page in both languages: `pnpm dev` (port 3003, compiles on first request), then
   `.claude/skills/event-page-review/scripts/shots.sh <slug> http://localhost:3003 <scratchpad>/shots/<slug>` and
   open the tiles (`en-1280-00.png` …, `ko-375-00.png` …). Stop the server by its PID from `ss -ltnp`, never with
   `pkill -f` (it kills your own shell).

## Step A — Critique, in writing, before any edit

Write `notes/event-critiques/<slug>.md` with the skeleton in `references/critique-template.md`:

1. **Counterintuitive numbers.** Every figure whose sign or size runs against the headline, with its value as the
   page shows it and the chart it is on: trade rising where a ban should cut it, an unnamed economy moving most, a
   targeted country's share rising, a share rising while the level falls.
2. **Mechanism check**, each number against all of these, with a verdict (applies / does not / cannot tell) and
   what you checked: front-loading or stockpiling between announcement and effective date (licence grace periods
   count); scope gaps (nodes, grades, origin rules, exemptions the measure left out; the product's HS codes vs the
   measure's annex); substitution to suppliers outside the measure; rerouting through third countries (HKG, VNM,
   MEX, ARE, KAZ, TUR, MYS, SGP); share or denominator effects (always the level beside the share); price vs volume
   (USD values move with prices and FX); demand or cycle (the world strip, the unnamed economies); overlapping
   events (the page's "What else changed" list); reporting artefacts (which side reported, mirror ratio, late
   filers, HS 2022 recodes, confidential trade, re-exports). The template's second table says where in the data
   each one shows.
3. **Window audit.** The announcement, the effective date(s) and later tightenings against the two windows. Say
   whether "after" captures anticipation, the immediate impact or the settled state. The view drives every figure
   on the page, so a change to `view.base` or `view.t` is a proposal in the critique, not an edit, unless the user
   asked for it. A second window ("+12 months") needs the series extended in `build_stories.py` (`hi = t + 6`
   months) and a page change: propose it.
4. **Labelling issues.** The same flow twice with different values, two products that collapse to one label (the
   product switch strips trailing parentheses; two products can share a name), unclear product names, missing
   units, charts whose titles do not say which codes they cover.
5. **Missing context.** What a reader needs that is not on the page: firm disclosures (segment or region sales by
   quarter), the measure's own text, official statistics.

## Step B — Research

Back each explanation with primary or high-quality sources: government or regulator notices and the published
rule; official statistics; company filings and quarterly results; IMF, BIS, OECD, WTO or central-bank analysis;
reputable trade press last. For each, record title, publisher, date, URL and the sentence it supports, in the
critique's sources table. `uv run .claude/skills/event-page-review/scripts/check_links.py <slug> --urls <url …>`
checks candidates resolve (403s, "Lock" or "Just a moment" pages are bot walls, not dead links: open them with
WebFetch or a browser and read them). An explanation you cannot source is a hypothesis: it stays in the critique,
labelled, and does not go on the page. Numbers from a source are quoted as the source gives them, with its period.

## Step C — Refine the page

1. **First time only**: wire the section as `references/wiring.md` says (types, four strings, one block in
   `page.tsx`, five CSS lines). Check with `grep -n "sec.reading" apps/web/lib/strings/events.ts` first.
2. **Add `reading` to the event** in `config/events.yaml`:

   ```yaml
       reading:
         window: {en: "…", ko: "…"}          # optional: what the windows capture, one line
         items:
           - kind: front-loading               # front-loading | scope | substitution | rerouting | denominator | price | cycle | overlap | reporting | definition
             number: {en: "Netherlands → China: 10.6% → 46.6% of Dutch chip-equipment exports (Sep 2022 → Sep 2023)", ko: "…"}
             en: "One or two plain sentences on the documented mechanism."
             ko: "같은 내용을 해라체로."
             sources: [7]
             checked: 2026-10-25
   ```

   Rules: 2–4 items; each names one figure exactly as the page shows it (same product, period, rounding) and
   gives the mechanism in one or two sentences, under about 60 words; English and Korean say the same thing (KO
   in 해라체, like the rest of the page); no hedging filler, no "may partly reflect"; every sentence traceable to a
   listed source; new sources are appended with the next free `n` (never renumber: the timeline cites by `n`);
   `checked` is the date the numbers were recomputed. A `window` line where the audit found the window captures
   anticipation ("Jul–Sep 2023 is the quarter before the Dutch deadline; a +12-month view would show the settled
   effect").
3. **Fix the labelling issues** that are local to this event: a product's short name in `config/names.yaml`, a
   duplicate product in the event's `products`, a timeline wording. Shared code (`page.tsx` labels, the product
   switch) changes every page: propose in the critique and apply only with the user's agreement.
4. **Rebuild**: `uv run scripts/build_stories.py --only <slug>` (a title or dek change needs the full run for
   `index.json`; `--meta-only` on `build_snapshots.py` after a names.yaml change).
5. Do not touch the wording of the measurement sections ("says what moved, not why").

## Step D — Verify

- Run `event_numbers.py <slug>` again and check every number in `reading` against it, in both languages.
- `check_links.py <slug>`: every source resolves (bot walls opened by hand).
- Build or serve, open both languages at desktop and 375 px with `shots.sh`, read the tiles: the section sits after
  the key charts and before "Partner shares, economy by economy"; citations jump to the sources list; nothing else
  changed (`git diff --stat` shows only `config/events.yaml`, `notes/`, and on the first run the wiring files).
- After `pnpm build`: `pnpm --filter @trade-flow/web test:html` still passes.
- Finish with the table: **event | counterintuitive findings | mechanisms added | window change (y / n /
  proposed) | open questions**. For a batch, one row per event.

## The reference page

`references/example-us-chip-controls-2022.md` is the worked example with verified numbers: Netherlands → China
10.6% → 46.6% of Dutch exports and $510m → $2.7bn; China's imports +30.8% while world trade fell 9.0%; Japan →
China +16.4 pp in share but only +$209m in value (Japan → Taiwan −$1.1bn: a denominator effect); the US −34.2% on
exports. It also lists the mechanisms to source (Dutch rule announced 8 Mar 2023, published 30 Jun, effective
1 Sep 2023, licences for contracted shipments to end-2023; ASML's China share of system sales by quarter; the US
rule's advanced-node scope; the 2023 memory downturn), the window verdict (anticipation; propose +12 months), and
the two labelling bugs. The draft task quoted 10.2% → 46.9% and "+19 pp": those are the chip-tools stage's series
on a different tab, which is why step 0 comes first.

## Never

- Put an unsourced explanation, or your own inference, on the page.
- Retype a number from memory or from a draft; every figure in `reading` comes from `event_numbers.py` today.
- Change `view.base`/`view.t`, shared page code or the pipeline without the user's agreement.
- Renumber sources or drop one the timeline cites.
- Soften or remove the measurement sections' stance, or present the new section as part of the measurements.
- Leave a dev or production server running (stop by PID).
