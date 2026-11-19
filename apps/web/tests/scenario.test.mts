// Build-time assertions on the case scenarios, run on the built data (data/cases/*.json.br) before `next build`:
//   - one stage down, the totals the sentence above the table states equal the sums of the rows they claim to cover
//     (all exporters with an exposure; the rows listed), for every case, every supplier option and both use shares
//   - a closed bloc (a supplier of several economies) never lists its own members as importers at risk, as suppliers
//     that could fill the gap, or as exporters one stage down
// Plain Node (type stripping): node --test tests/scenario.test.mts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downListed, passDown, runCut } from '../components/stories/scenario.ts';

const DATA = process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', '..', '..', 'data');
const read = (rel: string) => JSON.parse(brotliDecompressSync(readFileSync(path.join(DATA, rel))).toString('utf8'));
const meta = read('meta.json.br');
const idx = new Map<string, number>(meta.nodes.map((n: { id: string }, i: number) => [n.id, i]));
const groups = new Map<string, number[]>(meta.groups.map((g: { key: string; members: number[] }) => [g.key, g.members]));
const GULF = ['SAU', 'ARE', 'IRQ', 'KWT', 'QAT', 'IRN', 'OMN', 'BHR'];
const members = (s: unknown): number[] => {
  if (Array.isArray(s)) return [...new Set(s.flatMap(members))];
  if (s === 'GULF') return members(GULF);
  if (typeof s === 'string') return groups.get(s) ?? (idx.has(s) ? [idx.get(s)!] : []);
  return [];
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-12;

const cases = readdirSync(path.join(DATA, 'cases')).filter((f) => f.endsWith('.json.br') && f !== 'index.json.br')
  .map((f) => read(`cases/${f}`)).filter((d) => d.scenario_data?.base && !d.scenario_data.error);

test('the built data has case scenarios to check', () => assert.ok(cases.length > 0));

for (const doc of cases) {
  const spec = doc.scenario;
  const sd = doc.scenario_data;
  const options = [spec.supplier, ...(spec.alternatives ?? [])].map(members).filter((m) => m.length);
  for (const shocked of options) {
    const label = `${doc.id}, closing ${shocked.map((i) => meta.nodes[i].id).join('+')}`;
    const bloc = (spec.kind === 'cut_supplier' || spec.kind === 'cut_output') && shocked.length > 1 ? shocked : null;
    const exclude = spec.kind === 'close_route' ? shocked : bloc;
    const only = spec.importers ? members(spec.importers) : null;
    const cut = spec.cut ?? 1;
    test(`${label}: a bloc's members are never importers at risk or suppliers that fill the gap`, () => {
      if (!bloc) return;
      const B = new Set(bloc);
      for (const r of runCut(sd.base, shocked, cut, { only, exclude })) {
        if (B.has(r.i)) assert.fail(`${meta.nodes[r.i].id} is inside the bloc but listed as an importer`);
        for (const f of r.fill) if (B.has(f.i)) assert.fail(`${meta.nodes[f.i].id} is inside the bloc but fills a gap`);
      }
    });
    for (const down of sd.down ?? []) {
      for (const use of [1, 0.5]) {
        test(`${label}, ${down.product} at use ${use}: the stated totals are the sums of their rows`, () => {
          const exposure = new Map(runCut(sd.base, shocked, cut, { only, exclude }).map((r) => [r.i, r.risk]));
          for (const imp of sd.base.importers) if (!exposure.has(imp.i)) exposure.set(imp.i, 0);
          const res = passDown(down, exposure, use, spec.kind === 'close_route' ? { members: shocked, cut } : null, bloc);
          const sum = downListed(res.rows, 8, idx.get('KOR') ?? -1);
          const all = res.rows.reduce((a, r) => a + (r.passed ?? 0), 0);
          assert.ok(close(sum.total, all) && close(res.total, all), `total ${sum.total} ≠ sum of all rows ${all}`);
          assert.equal(sum.count, res.rows.filter((r) => (r.passed ?? 0) > 0).length);
          const listed = sum.listed.reduce((a, r) => a + (r.passed ?? 0), 0);
          assert.ok(close(sum.listedTotal, listed), `listed total ${sum.listedTotal} ≠ sum of listed rows ${listed}`);
          assert.ok(sum.listedTotal <= sum.total + 1e-12);
          if (bloc) for (const r of sum.listed) if (bloc.includes(r.j)) assert.fail(`${meta.nodes[r.j].id} is inside the bloc but listed one stage down`);
        });
      }
    }
  }
}
