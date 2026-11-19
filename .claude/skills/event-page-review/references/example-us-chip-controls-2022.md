# Worked example: `us-chip-controls-2022` (the reference page)

Numbers from `event_numbers.py us-chip-controls-2022 --levels --at 202403` on 25 Oct 2026 (store built
24 Oct 2026). View: Chip-making equipment [B:chip_equipment], lens M: base Sep 2022 (= Jul–Sep 2022), t Sep 2023
(= Jul–Sep 2023). The named economies' series run Sep 2021 – Mar 2024.

## Counterintuitive numbers (verified)

| # | Figure | Value |
|---|---|---|
| 1 | Diversion / Netherlands' exports: Netherlands → China | 10.6% → 46.6% (+36.1 pp); in USD $510m → $2.7bn (+436%) |
| 2 | Year-on-year bars: China imports of chip-making equipment | +30.8% ($9.2bn → $12.0bn) while world −9.0% |
| 3 | Diversion / China's imports: Netherlands → China | 5.6% → 22.7% (+17.1 pp) — the same flow as #1, the other denominator |
| 4 | Diversion / Japan's exports: Japan → China | 35.2% → 51.6% (+16.4 pp) but only +$209m (+7%) in USD |
| 5 | Diversion / Netherlands' exports: Netherlands → Taiwan | 46.4% → 20.1% (−26.3 pp); −$1.1bn |
| 6 | Year-on-year bars: United States exports | −34.2% ($7.0bn → $4.6bn); US → Taiwan −$875m, US → Korea −$593m, US → China −$183m |
| 7 | Movers: Netherlands' share of world exports | 13.9% → 18.5% (+4.6 pp); United States 20.1% → 14.5% (−5.6 pp) |

The draft that came with the task quoted 10.2% → 46.9%, Taiwan 46.8% → 20.1% and "Japan → China +19 pp". Those
are the *Chip-making machines (side input)* series (C:semiconductors:chip_tools, HS 8486.10/20/90), shown on the
partner-share charts under their own product tab, and +19.1 pp is the Netherlands' share of China's chip-tools
imports. The view product's charts (B:chip_equipment, HS 8486) show 10.6% → 46.6%, 46.4% → 20.1% and +16.4 pp.
Quote the series the reader sees in the chart you name; say which product it is.

## Mechanisms (what applies, and what to source)

All of these must be cited from documents found and verified at run time. Candidate documents, by publisher,
are listed; find the URL, check it opens and says this, then add it to `sources` with the next `n`.

- **Front-loading** (#1, #2, #3). The Dutch licence requirement was announced on 8 March 2023, published in the
  Government Gazette on 30 June 2023 and took effect on 1 September 2023 (Government of the Netherlands news
  items of 8 Mar and 30 Jun 2023; the existing source [4] is the Sep 2024 extension). Shipments contracted before
  the effective date could still be delivered under licences granted into end-2023 (ASML Q3 2023 results, Oct
  2023). ASML reported China at about 46% of system sales in Q3 2023 against about 24% in Q2 2023 (ASML
  quarterly results, 18 Oct 2023 and 19 Jul 2023: verify the exact percentages in the statements before quoting).
  The Jul–Sep 2023 window ends on the Dutch effective date: it measures the rush, not the settled effect.
- **Scope** (#2). The 7 Oct 2022 US rule (source [1], and the BIS interim final rule 87 FR 62186) targets
  advanced-node logic, DRAM and NAND tools and US-origin items; mature-node tools, including DUV lithography,
  stayed outside it while China added mature-node capacity. HS 8486 covers all tools for wafer processing, so
  the product on the page is far wider than the measure.
- **Substitution** (#4, #6, #7). US exporters' sales to China fell (US → China −12% in USD; the US lost 5.6 pp
  of world exports) while Japan's and the Netherlands' shares of China's purchases rose; Japan's controls on 23
  items only took effect on 23 July 2023 (source [3]) and the Dutch rule on 1 Sep 2023.
- **Share / denominator** (#4, #5, #7). The 2023 memory downturn cut Taiwanese and Korean tool purchases:
  Taiwan's imports −$4.3bn (−55%), Japan → Taiwan −$1.1bn, Netherlands → Taiwan −$1.1bn, US → Korea −$593m.
  Japan → China's share rose 16 pp on a $209m rise; Netherlands → China's share rose partly because
  Netherlands → Taiwan halved. Sources: WSTS/SIA 2023 market figures; Samsung Electronics and SK hynix 2023
  capex statements; TSMC 2023 capex guidance (verify).
- **Product definition.** The chain stage "Chip-making machines (side input)" (KO 반도체 제조장비(부수 투입재))
  includes 8486.90 parts and accessories, which track the installed base rather than new tool sales
  (names.yaml caveat). The two products differ only by codes 8486.30/40 (flat-panel and other tools).
- **Reporting.** Netherlands → China is the importer's report with a mirror ratio of 1.06: both sides agree.
  China's own monthly files end in Dec 2024 in the store; after that its trade is seen through partners.

## Window audit

Announcement 7 Oct 2022 (US); tightenings 23 Jul 2023 (Japan), 1 Sep 2023 (Netherlands), 17 Oct 2023 (US),
7 Sep 2024 (Netherlands), 2 Dec 2024 (US). Base Jul–Sep 2022 is before everything; "after" Jul–Sep 2023 ends on
the Dutch effective date and sits on the rush → **anticipation**. At +6 months (Mar 2024, the last period in the
series) China's imports were +69.1% on a year earlier and the Netherlands held 20.0% of them. A +12-month view
(Sep 2024) needs the series extended past t + 6 months (`event_numbers` cannot show it; `build_stories.py`
`hi = t + 6` months) → propose a second window in the critique; do not change `view.t`, which would redraw every
figure on the page.

## Labelling issues

- "Netherlands → China" appears twice in the diversion list (+36.1 pp as a share of Dutch exports, +17.1 pp as a
  share of China's imports). The bar label gives the flow but not whose share; the table's "Share of" column does.
  Fix in `page.tsx` (shared by all events): add the role to the bar label, e.g. "Netherlands → China · of Dutch
  exports". Propose it in the critique; apply only if the user agrees to a shared change.
- The partner-share product switch strips trailing parentheses, so "반도체 제조장비(부수 투입재)" and
  "반도체 제조장비" both show as "반도체 제조장비" (and "집적회로" twice, since C:semiconductors:ics and B:chips_ic
  share a name). In English, "Integrated circuits" appears twice. Fix: a distinct KO/EN short name for the chain
  stage in `config/names.yaml` (local, apply), or drop the duplicate product from the event's `products`.
- Two slope charts both titled "Who gained and lost share of world chip-making … exports" for products that
  differ by two codes: say which codes, or keep one.

## Reading items (draft shape; ≤ 60 words each, sources to be added)

1. *front-loading* — **Netherlands → China: 10.6% → 46.6% of Dutch chip-equipment exports (Sep 2022 → Sep 2023).**
   The Dutch licence requirement, announced on 8 March 2023, took effect on 1 September 2023, and deliveries
   contracted before then were still allowed through 2023; Jul–Sep 2023 is the quarter before the deadline. [n]
2. *denominator* — **Japan → China: 35.2% → 51.6% of Japan's exports, but +$209m in value.** Japan's sales to
   Taiwan fell $1.1bn as Taiwanese chipmakers cut purchases in the 2023 downturn; most of the share gain is the
   denominator shrinking. [n]
3. *scope* — **China's chip-equipment imports +30.8% while world trade fell 9.0%.** The October 2022 US rules
   cover advanced-node tools; HS 8486 includes every wafer tool, and mature-node tools stayed licensable. [1][n]
4. *window* line — Jul–Sep 2023 captures the pre-deadline rush; a +12-month view would show the settled effect.
