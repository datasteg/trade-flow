// The map layout (src/maplayout.ts): no overlaps, inside the box, the same positions every time, order kept by the
// stretch; on the built data (skipped when data/ is not built), the all-goods network of 2024 at the explorer's
// desktop and phone sizes, laid out in under 300 ms and steady from one year to the next.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeSnap } from '../src/decode';
import { anchorOf, fitProjection, worldFromTopology, type Box } from '../src/geo';
import { GAP, layoutMap, stretchedSpots, type MapItem } from '../src/maplayout';
import { buildScene, DEFAULT_CONFIG } from '../src/scene';
import type { Meta, RawAnnualSnap, RawSeries } from '../src/types';

function overlaps(items: MapItem[]): number {
  let n = 0;
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const p = items[a], q = items[b];
    if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r - 0.01) n++;
  }
  return n;
}

const inside = (items: MapItem[], box: Box) => items.every((d) => d.x - d.r >= box.x0 - 0.01 && d.x + d.r <= box.x1 + 0.01 && d.y - d.r >= box.y0 - 0.01 && d.y + d.r <= box.y1 + 0.01);

describe('layoutMap', () => {
  const box = { x0: 0, y0: 0, x1: 800, y1: 500 };
  // a dense "Europe" of 60 economies in a 60 px square, and 40 spread ones
  const anchors = [
    ...Array.from({ length: 60 }, (_, k) => ({ k, x: 300 + (k % 8) * 7, y: 100 + Math.floor(k / 8) * 7 })),
    ...Array.from({ length: 40 }, (_, k) => ({ k: 60 + k, x: 20 + k * 19, y: 250 + ((k * 37) % 200) })),
  ];
  const radii = anchors.map((a) => 2 + ((a.k * 13) % 17));
  const spots = stretchedSpots(anchors, box);
  const run = () => {
    const items = anchors.map((a) => ({ i: a.k, r: radii[a.k], x: 0, y: 0 }));
    layoutMap(items, (i) => spots.get(i)!, box);
    return items;
  };

  it('leaves no two circles overlapping, all inside the box', () => {
    const items = run();
    expect(overlaps(items)).toBe(0);
    expect(inside(items, box)).toBe(true);
  });
  it('keeps the personal space', () => {
    const items = run(), gap = GAP * 800;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      const p = items[a], q = items[b];
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(p.r + q.r + gap - 0.05);
    }
  });
  it('gives the same positions every time', () => {
    expect(run().map((d) => [d.x, d.y])).toEqual(run().map((d) => [d.x, d.y]));
  });
  it('stretches each axis without changing the order', () => {
    const byX = [...anchors].sort((a, b) => a.x - b.x || a.k - b.k).map((a) => spots.get(a.k)![0]);
    const byY = [...anchors].sort((a, b) => a.y - b.y || a.k - b.k).map((a) => spots.get(a.k)![1]);
    expect(byX).toEqual([...byX].sort((a, b) => a - b));
    expect(byY).toEqual([...byY].sort((a, b) => a - b));
  });
});

const ROOT = path.resolve(__dirname, '../../..');
const built = existsSync(path.join(ROOT, 'data', 'meta.json.br'));

describe.skipIf(!built)('layoutMap on the built data', () => {
  const rd = <T,>(p: string): T => JSON.parse(brotliDecompressSync(readFileSync(path.join(ROOT, 'data', `${p}.json.br`))).toString()) as T;
  const meta = built ? rd<Meta>('meta') : (null as unknown as Meta);
  const world = built ? worldFromTopology(JSON.parse(readFileSync(path.join(ROOT, 'apps/web/public/world-110m.json'), 'utf8'))) : null;
  const series = built ? rd<RawSeries>('series/A/TOTAL') : null;
  const ref = series ? Math.max(...(series.rows.mirror ?? []).map((r) => Number(r[series.cols.indexOf('world')]) || 0)) : null;
  // the explorer's map box at 1440 × 900 (a 1440 × 844 host under the masthead) and at a 390 × 844 phone (Explorer.tsx insets)
  const views = [
    { name: 'desktop', W: 1440, box: { x0: 344, y0: 16, x1: 1424, y1: 724 } },
    { name: 'phone', W: 390, box: { x0: 8, y0: 52, x1: 382, y1: 632 } },
  ];
  const layout = (year: number, W: number, box: Box, cfg: Partial<typeof DEFAULT_CONFIG> = {}) => {
    const raw = rd<RawAnnualSnap>(`snap/A/TOTAL/${year}`);
    const snap = decodeSnap(raw, { meta, product: 'TOTAL', freq: 'A', lens: null, rule: 'mirror', ncols: raw.ncols, ecols: raw.ecols });
    const scene = buildScene(meta, snap, { ...DEFAULT_CONFIG, ref, ...cfg }, W, new Map(), (box.x1 - box.x0) * (box.y1 - box.y0));
    const proj = fitProjection(world, box);
    const spots = stretchedSpots(meta.nodes.map((_, k) => { const [x, y] = anchorOf(meta, k, proj, box); return { k, x, y }; }), box);
    const items = scene.nodes.map((d) => ({ i: d.i, r: d.r, x: 0, y: 0 }));
    const t0 = performance.now();
    layoutMap(items, (i) => spots.get(i)!, box);
    return { items, ms: performance.now() - t0 };
  };

  for (const v of views) {
    it(`lays out the all-goods network of 2024 (${v.name}) without overlaps in under 300 ms`, () => {
      layout(2024, v.W, v.box);
      const { items, ms } = layout(2024, v.W, v.box);
      expect(items.length).toBeGreaterThan(200);
      expect(overlaps(items)).toBe(0);
      expect(inside(items, v.box)).toBe(true);
      expect(ms).toBeLessThan(300);
    });
    it(`packs the largest circles (partners, period scale) without overlaps (${v.name})`, () => {
      const { items, ms } = layout(2024, v.W, v.box, { sizeBy: 'degree', scale: 'period' });
      expect(overlaps(items)).toBe(0);
      expect(inside(items, v.box)).toBe(true);
      expect(ms).toBeLessThan(300);
    });
    it(`moves economies less than 2 px on average from 2023 to 2024 (${v.name})`, () => {
      const a = new Map(layout(2023, v.W, v.box).items.map((d) => [d.i, d]));
      const moves = layout(2024, v.W, v.box).items.flatMap((d) => { const p = a.get(d.i); return p ? [Math.hypot(d.x - p.x, d.y - p.y)] : []; });
      expect(moves.reduce((s, x) => s + x, 0) / moves.length).toBeLessThan(2);
    });
  }
});
