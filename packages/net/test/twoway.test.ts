// The two-way and report-gap measures (src/twoway.ts) and their decoding from a snapshot row (src/decode.ts).
import { describe, expect, it } from 'vitest';
import { decodeSnap } from '../src/decode';
import { DISAGREE, TWO_WAY, gapFromRatio, grubelLloyd, isTwoWay, reportGap, reportsDisagree } from '../src/twoway';
import type { Meta } from '../src/types';

describe('grubelLloyd', () => {
  it('is 1 for balanced trade and 0 for one-way trade', () => {
    expect(grubelLloyd(100, 100)).toBe(1);
    expect(grubelLloyd(100, 0)).toBe(0);
    expect(grubelLloyd(0, 100)).toBe(0);
    expect(grubelLloyd(0, 0)).toBeNull();
  });
  it('matches quartz, China 2024 (exports $215m, imports $957m)', () => {
    expect(grubelLloyd(215, 957)).toBeCloseTo(1 - 742 / 1172, 10);
  });
  it('is symmetric', () => {
    expect(grubelLloyd(1, 3)).toBeCloseTo(0.5, 12);
    expect(grubelLloyd(3, 1)).toBeCloseTo(0.5, 12);
  });
});

describe('isTwoWay', () => {
  it('flags at the thresholds, inclusive', () => {
    expect(isTwoWay(0.1302, 0.5797)).toBe(true);
    expect(isTwoWay(TWO_WAY.share, TWO_WAY.share)).toBe(true);
    expect(isTwoWay(TWO_WAY.share - 0.001, 0.03)).toBe(false);
    expect(isTwoWay(0.03, TWO_WAY.share - 0.001)).toBe(false);
  });
  it('needs a GL of at least 0.3', () => {
    // x = 0.02, m = 0.2: GL = 1 − 0.18 / 0.22 ≈ 0.18
    expect(isTwoWay(0.02, 0.2)).toBe(false);
  });
});

describe('reportGap', () => {
  it('is |vm − vx| over the larger report', () => {
    expect(reportGap(100, 100)).toBe(0);
    expect(reportGap(100, 50)).toBeCloseTo(0.5, 12);
    expect(reportGap(50, 100)).toBeCloseTo(0.5, 12);
    expect(reportGap(null, 100)).toBeNull();
    expect(reportGap(100, 0)).toBeNull();
  });
  it('equals the gap from the mirror ratio', () => {
    for (const [vx, vm] of [[1, 17.2], [17.2, 1], [3, 2], [5, 5]]) {
      expect(gapFromRatio(vm / vx)).toBeCloseTo(reportGap(vx, vm)!, 12);
    }
    expect(gapFromRatio(null)).toBeNull();
    expect(gapFromRatio(0)).toBeNull();
  });
  it('marks a disagreement only on large enough flows', () => {
    expect(reportsDisagree(0.6, DISAGREE.share)).toBe(true);
    expect(reportsDisagree(0.6, DISAGREE.share - 0.001)).toBe(false);
    expect(reportsDisagree(DISAGREE.asym, 0.5)).toBe(false);
    expect(reportsDisagree(null, 0.5)).toBe(false);
  });
});

describe('decodeSnap', () => {
  const meta = { nodes: [{ id: 'CHN' }, { id: 'USA' }, { id: 'NOR' }] } as unknown as Meta;
  const raw = {
    t: 2024, win: null, world: 1000, comm: null,
    tot: { nodes: 3, edges: 2, reporters: 3, hhi: null, top1: null, top1_id: 1, top5: null, hhi_sup: null, density: null, imp_rep: null, exporters: 2 },
    nodes: [[0, 0.2, 0.6, 1, 1, null, null, 1, 0.5, 1, 0, 0, null, null, null, 0, 0.35, 1.06], [1, 0.5, 0, 1, 0, null, null, -1, null, 1, 0, 0, null, null, null, 0, 7.8, null]],
    edges: [[1, 0, 0.32, 1, 1, 17.2, 1, 12.2], [2, 0, 0.005, 1, 2, 3, 1, null]],
  };
  const snap = decodeSnap(raw, {
    meta, product: 'C:semiconductors:quartz', freq: 'A', lens: null, rule: 'mirror',
    ncols: ['i', 'x', 'm', 'od', 'id', 'hs', 'hm', 'ts', 'tss', 'r', 'd10', 's10', 'pv', 'pb', 'bt', 'c', 'ux', 'um'],
    ecols: ['s', 't', 'w', 'ro', 'ri', 'mr', 'src', 'uv'],
  });
  it('derives net, GL and unit values of economies', () => {
    const chn = snap.byIndex.get(0)!;
    expect(chn.net).toBeCloseTo(-400, 9);
    expect(chn.gl).toBeCloseTo(1 - 0.4 / 0.8, 12);
    expect(chn.ux).toBe(0.35);
    expect(chn.um).toBe(1.06);
    expect(snap.byIndex.get(1)!.um).toBeNull();
  });
  it('derives the report gap, the marker and the unit value of flows', () => {
    const [big, small] = snap.edges;
    expect(big.asym).toBeCloseTo(1 - 1 / 17.2, 12);
    expect(big.disagree).toBe(true);
    expect(big.uv).toBe(12.2);
    expect(small.asym).toBeCloseTo(2 / 3, 12);
    expect(small.disagree).toBe(false);   // 0.5% of world trade
    expect(small.uv).toBeNull();
  });
});
