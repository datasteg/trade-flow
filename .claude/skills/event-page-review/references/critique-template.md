# The critique file: `notes/event-critiques/<slug>.md`

Write it before touching the page. It is the audit trail for everything the "Reading the numbers" section will say,
and the place for recommendations that are not applied (window changes, shared-code fixes). Numbers come from
`event_numbers.py` (see SKILL.md, step 0), never retyped from memory.

```markdown
# <slug> · critique · <YYYY-MM-DD>

Pages: /en/events/<slug>, /ko/events/<slug>. View: <product> [<id>], <A | M lens X>, base <period> (<months>) →
t <period> (<months>). Store built <built_at>; the named economies' series run <from>–<to>.
Numbers from `event_numbers.py <slug> --levels` on <date>.

## 1. Counterintuitive numbers
| # | Figure (which chart or table) | Value | Why it surprises |
|---|---|---|---|
| 1 | Diversion: Netherlands → China, share of Dutch exports | 10.6% → 46.6% (+36.1 pp) | A control on tools for China, yet the Dutch share going to China quadrupled |

## 2. Mechanism check
One block per numbered figure. Say which mechanisms apply, which do not, and what you checked.
| Mechanism | Verdict | Evidence (data or source) |
|---|---|---|
| Front-loading before the effective date | applies | … |
| Scope gap | applies | … |
| Substitution | … | … |
| Rerouting / transshipment | does not | HKG, VNM, SGP, MYS shares of China's imports flat (−at …) |
| Share / denominator effect | applies | levels: Netherlands → Taiwan −$1.1bn while → China +$2.2bn |
| Price vs volume | cannot tell | no unit values for this product at this lens |
| Demand / cycle | … | world −9.0%; … |
| Overlapping event | … | … |
| Reporting artefact | … | reported by importer, mirror ratio 1.06 |

## 3. Window audit
Announcement <date>; effective <date(s)>; later tightenings <dates>. The base window holds …; the "after" window
holds … → it captures **anticipation | immediate impact | settled state**.
Recommendation: keep | change `view.base`/`view.t` to … | add a second window (+12 months: <period>).
A change alters every figure on the page (the view drives them all) → **proposed, not applied** unless the user asks.

## 4. Labelling issues
- …

## 5. Missing context
- …

## 6. Sources found
| n | Title | Publisher | Date | URL | Supports |
|---|---|---|---|---|---|
New sources take the next free `n` after the event's existing list; never renumber (the timeline cites by `n`).

## 7. "Reading the numbers" items (draft)
EN and KO together, ≤ 60 words each, each quoting one figure exactly as the page shows it, with `[n]` citations.
Items without a source are marked *hypothesis* and stay here; they do not go on the page.

## 8. Open questions
- …
```

## Mechanisms and how to test each one on this site's data

| Mechanism | What it looks like | Where to check |
|---|---|---|
| **Front-loading / stockpiling** | A rise between the announcement and the effective date, then a fall. | Timeline dates vs the windows; `event_numbers.py --at <period>` month by month (the series run from base −12 to t +6 months); lens S in the explorer for single months. |
| **Scope gap** | Trade in the product keeps growing because most of its codes are outside the measure. | The product's HS codes (`config/chains.yaml`, `meta.products[].codes`) against the measure's annexes; the product's `caveat` in names.yaml. |
| **Substitution** | One supplier's share falls, another's rises, the buyer's total holds. | Partner-share charts and the movers slope; `--levels` for both sides in USD. |
| **Rerouting / transshipment** | A third economy's share of the buyer's imports and of the seller's exports both rise (Gopinath et al. 2024 connector test). | The partner lists for HKG, VNM, MEX, ARE, KAZ, TUR, MYS, SGP, KGZ, ARM; the explorer's connector scatter on case pages. |
| **Share / denominator** | A share rises while the level does not; another partner's level collapsed. | `--levels`: the flow in USD, "of exporter" and "of importer" shares side by side. Always quote the level with the share. |
| **Price vs volume** | Values move with prices or FX; the page cannot separate them. | `validators/fred-*-price-m.csv` and FX files (if fetched); annual unit values (`uv`, `ux`, `um`) for chain stages only. |
| **Demand / cycle** | Every economy moves the same way; the world strip moves. | The lead strip ("World trade … change on a year earlier"); the yoy bars of economies the event did not name. |
| **Overlapping event** | Another catalogue event falls in the window. | The page's "What else changed" list; `config/events.yaml` dates. |
| **Reporting artefact** | One side's report, a late reporter, an HS revision, confidential trade. | `reported by` and the mirror ratio in `--levels`; `filed` flags; `missing`; the store limits in the page's Coverage notice (China's monthly files end Dec 2024, Korea's Dec 2025); `codes_pre2022` for products renamed in HS 2022. |
| **Product definition** | The label suggests one thing, the codes contain another (parts and accessories track the installed base; a basket mixes grades). | names.yaml caveats; chains.yaml `role`/`caveat`; the codes. |
