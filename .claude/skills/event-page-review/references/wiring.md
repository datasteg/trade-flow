# Wiring the "Reading the numbers / 숫자 읽기" section (once)

The event pages render `data/events/<slug>.json`, which `scripts/build_stories.py` writes from `config/events.yaml`
plus the measured numbers. Every yaml key except `view` is copied through as it is
(`doc = {**{k: v for k, v in ev.items() if k != "view"}, **num}`), so a new `reading` key reaches the page with
no change to the Python. Four small edits in the web app render it. Check first whether they are already in place:
`grep -n "sec.reading" apps/web/lib/strings/events.ts`.

## 1. The data shape (`config/events.yaml`, per event)

```yaml
    reading:                 # documented context for the figures that run against the headline; sources by n
      window:                # optional, one line on what the windows capture
        en: "Jul–Sep 2023 ends on the day the Dutch licence rule took effect (1 Sep 2023): the window measures the rush before the deadline, not the settled effect."
        ko: "2023년 7~9월은 네덜란드 허가제 시행일(2023년 9월 1일)에 끝난다. 이 창은 시행 전 주문 몰림을 재는 것이지, 안정된 뒤의 효과가 아니다."
      items:
        - kind: front-loading            # front-loading | scope | substitution | rerouting | denominator | price | cycle | overlap | reporting | definition
          number: {en: "Netherlands → China: 10.6% → 46.6% of Dutch chip-equipment exports (Sep 2022 → Sep 2023)", ko: "네덜란드 → 중국: 네덜란드 반도체 제조장비 수출의 10.6% → 46.6%(2022년 9월 → 2023년 9월)"}
          en: "…one or two sentences, the documented mechanism…"
          ko: "…같은 내용…"
          sources: [7, 8]                # n in this event's `sources`; new ones are appended with the next n
          checked: 2026-10-25            # the day the number was recomputed with event_numbers.py
```

Numbers in `number` are text: they do not update when the data are rebuilt. The `checked` date says when they last
matched; after a data rebuild, run `event_numbers.py` again for every event that has a `reading` and fix any drift.

## 2. `apps/web/components/stories/types.ts`

```ts
export interface ReadingItem { kind?: string; number: Bi; en: string; ko: string; sources?: number[]; checked?: string }
export interface EventReading { window?: Bi; items: ReadingItem[] }

export interface EventDoc extends EventIndexEntry {
  // … existing fields …
  reading?: EventReading;
}
```

## 3. `apps/web/lib/strings/events.ts`

Add inside the `events` table (해라체 for the lede, nouns for labels, like the rest of the file):

```ts
  'sec.reading': { en: 'Reading the numbers', ko: '숫자 읽기' },
  'reading.lede': {
    en: 'Documented context for the figures above that run against the event’s headline. The measurements stand as they are; each item cites its sources.',
    ko: '위 수치 가운데 사건의 통념과 어긋나는 것에 대한, 출처가 있는 맥락이다. 측정값은 그대로 두고 항목마다 출처를 단다.',
  },
  'reading.kind.front-loading': { en: 'Front-loading', ko: '앞당긴 주문' },
  'reading.kind.scope': { en: 'Scope of the measure', ko: '조치의 범위' },
  'reading.kind.substitution': { en: 'Substitution', ko: '공급처 대체' },
  'reading.kind.rerouting': { en: 'Rerouting', ko: '우회 교역' },
  'reading.kind.denominator': { en: 'Share effect', ko: '분모 효과' },
  'reading.kind.price': { en: 'Prices and exchange rates', ko: '가격·환율' },
  'reading.kind.cycle': { en: 'Business cycle', ko: '경기 요인' },
  'reading.kind.overlap': { en: 'Overlapping event', ko: '겹치는 사건' },
  'reading.kind.reporting': { en: 'How the data are reported', ko: '신고 자료의 성격' },
  'reading.kind.definition': { en: 'Product definition', ko: '품목 정의' },
```

Optional, so the stance line stays true once explanations exist: append to `else.prices`
EN "Documented context for the figures that run against the headline is in “Reading the numbers”, with sources." /
KO "통념과 어긋나는 수치의 맥락은 ‘숫자 읽기’에 출처와 함께 적었다."

## 4. `apps/web/app/[lang]/events/[event]/page.tsx`

Insert between the `#numbers` section's closing `</section>` and `{sharesProducts.length ? (`:

```tsx
      {doc.reading?.items?.length ? (
        <section className="st-sec st-sec--text" aria-labelledby="reading">
          <h2 id="reading">{t(lang, 'events.sec.reading')}</h2>
          <p className="st-sec__lede">{t(lang, 'events.reading.lede')}</p>
          {doc.reading.window ? <p className="lr-prose st-reading__window">{doc.reading.window[lang]}</p> : null}
          <ol className="st-reading">
            {doc.reading.items.map((it, i) => (
              <li key={i}>
                {it.kind ? <span className="lr-kicker">{t(lang, `events.reading.kind.${it.kind}` as Parameters<typeof t>[1])}</span> : null}
                <p>
                  <b>{it.number[lang]}</b> {it[lang]}
                  {(it.sources ?? []).map((n) => <a key={n} className="st-srcref" href={`#src-${n}`}> [{n}]</a>)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
```

It sits right after the key charts (lead strip, year-on-year bars, diversion, movers) and before "Partner shares,
economy by economy", so the reader meets the explanation where the surprise is.

## 5. `apps/web/app/[lang]/cases/stories.css`

```css
.st-reading { display: grid; gap: var(--space-4); margin: 0; padding-left: 1.4em; font: 400 15px/23px var(--font-sans); }
.st-reading li p { margin: 0; }
.st-reading b { font-weight: 600; color: var(--ink); }
.st-reading .lr-kicker { display: block; margin-bottom: 2px; }
.st-reading__window { color: var(--ink-secondary); }
```

## 6. Check

- `uv run scripts/build_stories.py --only <slug>` (about two seconds; it needs the Comtrade network layer the trade
  collector builds). A changed `title` or `dek` also needs a full
  `uv run scripts/build_stories.py` to refresh `data/events/index.json`.
- `pnpm build` then `grep -c 'id="reading"' apps/web/.next/server/app/en/events/<slug>.html` → 1, and the same for
  `ko`. `pnpm --filter @trade-flow/web test:html` must still pass.
- The events index dek ("It says what changed, not why." / "원인을 단정하지 않는다") can stay: the measurements
  still do not assert causes; the reading section cites others who document them.
