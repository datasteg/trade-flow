// A snapshot test of one chain page as built (the prerendered HTML of /en and /ko/chains/semiconductors, whose first
// stage is quartz, HS 2506.10): the two-way badge and sentence for China in 2024, the split-node size control, the
// collapsed explainer, and no economy singled out without ?focus. Run after `pnpm build`:
//   pnpm test:html        (NEXT_DIST_DIR selects another build folder)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const dist = process.env.NEXT_DIST_DIR ?? '.next';
const page = (p) => readFileSync(path.join(import.meta.dirname, '..', dist, 'server', 'app', `${p}.html`), 'utf8');
// the visible text of a stage section, tags dropped
const section = (html, key) => {
  const i = html.indexOf(`id="stage-${key}"`);
  assert.ok(i > 0, `stage ${key} not on the page`);
  const j = html.indexOf('<section', i + 10);
  return html.slice(i, j > 0 ? j : undefined).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
};

test('quartz, 2024: China is badged two-way, with its imports and exports', () => {
  const q = section(page('en/chains/semiconductors'), 'quartz');
  assert.match(q, /CHN China\s+↔ two-way/);
  assert.match(q, /China imports \$957m and exports \$215m of this stage\./);
  assert.match(q, /Imports average \$1\.1\/kg, exports \$0\.35\/kg\./);
  assert.match(q, /Main suppliers: United States, Norway, India\./);
  assert.match(q, /Main buyers: Thailand, UK, Vietnam\./);
});

test('quartz, 2024: the Korean page says the same in Korean', () => {
  const q = section(page('ko/chains/semiconductors'), 'quartz');
  assert.match(q, /↔ 양방향/);
  assert.match(q, /중국: 이 단계 수입 9억 5,700만 달러, 수출 2억 1,500만 달러\./);
});

test('the map defaults to split nodes, and the explainer is collapsed', () => {
  const html = page('en/chains/semiconductors');
  assert.match(html, /aria-pressed="true"[^>]*>Split</);
  assert.match(html, /<details class="ch-why"><summary>Why do some economies both import and export the same stage\?<\/summary>/);
});

test('no economy is singled out without ?focus', () => {
  for (const p of ['en/chains/semiconductors', 'ko/chains/semiconductors', 'en/chains/batteries', 'ko/chains/batteries', 'en/chains', 'ko/chains', 'en', 'ko']) {
    // the KCS gap notice ("Korea’s customs months: cells left out") is data-driven and not a focus leak
    const html = page(p).replace(/Korea’s (customs months|records|imports here)[^<]*/g, '').replace(/한국의 (관세청|기록|수입)[^<]*/g, '');
    for (const s of ['Korea’s', "Korea's", '한국의', 'id="korea"', 'id="focus"', 'Position of', 'is-focus']) {
      assert.ok(!html.includes(s), `${p} contains ${s}`);
    }
  }
});
