// The one monthly rule's grid and decoding: window ends that
// keep January and February together, months always read from snap/W, the CIF/FOB factor on an exporter's report,
// ranks among economies only.
import { describe, expect, it } from 'vitest';
import { decodeSnap, lensWindow, periodsOf, snapPath, stepWindow, validEnd, type Meta, type MetaProduct } from '../src/core';

describe('window grid', () => {
  it('has no 12-month end in January and no 3-month end in January or April', () => {
    expect([...Array(12)].map((_, i) => i + 1).filter((m) => !validEnd(2025 * 100 + m, 12))).toEqual([1]);
    expect([...Array(12)].map((_, i) => i + 1).filter((m) => !validEnd(2025 * 100 + m, 3))).toEqual([1, 4]);
    expect(stepWindow(202512, 12)).toBe(202602);
    expect(stepWindow(202603, 3)).toBe(202605);
    expect(lensWindow('M')).toBe(3);
    expect(lensWindow('L')).toBe(12);
  });
  it('lists the months of a lens on the windows grid and reads them from snap/W', () => {
    const p = { id: 'TOTAL', slug: 'TOTAL', kind: 'total', en: '', ko: '', A: [2020, 2025], M: [202512, 202606] } as unknown as MetaProduct;
    expect(periodsOf(p, 'M', 'M')).toEqual([202512, 202602, 202603, 202605, 202606]);
    expect(periodsOf(p, 'M', 'L')).toEqual([202512, 202602, 202603, 202604, 202605, 202606]);
    expect(snapPath(p, 'M', 202605, { lens: 'M' })).toBe('snap/W/TOTAL/2026.w3.json');
    expect(snapPath(p, 'M', 202605)).toBe('snap/W/TOTAL/2026.w12.json');
  });
});

describe('decoding', () => {
  const meta = {
    nodes: [{ id: 'AAA' }, { id: 'S19', nes: true }, { id: 'BBB' }],
    windows: { cif_fob: 1.06 },
  } as unknown as Meta;
  const raw = {
    t: 2024, world: 1000,
    nodes: [[0, 0.5, 0.1], [1, 0.4, 0.0], [2, 0.1, 0.9]],
    edges: [[0, 2, 0.53, 1, 1, 0.9, 0], [1, 2, 0.4, 1, 2, null, 1]],
  };
  const snap = decodeSnap(raw as never, { meta, product: 'TOTAL', freq: 'A', lens: null, rule: 'mirror', ncols: ['i', 'x', 'm'], ecols: ['s', 't', 'w', 'ro', 'ri', 'mr', 'src'] });
  it('reads an exporter-drawn annual flow as the exporter report times 1.06', () => {
    const e = snap.edges[0];
    expect(e.vx).toBeCloseTo(530 / 1.06);
    expect(e.vm).toBeCloseTo((530 / 1.06) * 0.9);
  });
  it('ranks Asia, n.e.s. as any partner and flags it', () => {
    const [a, nes, b] = snap.nodes;
    expect(nes.nes).toBe(true);
    expect(a.rankExports).toBe(1);
    expect(nes.rankExports).toBe(2);
    expect(b.rankExports).toBe(3);
  });
});
