// The strip's completeness rule: where a line stops, how the table marks
// incomplete periods, and the customs citation's months.
import { describe, expect, it } from 'vitest';
import { lastComplete, stripTable, type StripOptions } from '../src/charts/strip';
import { monthRange, supplementLine, supplementRuns } from '../src/words';
import type { Meta } from '../src/types';

const base: StripOptions = {
  lang: 'en', label: 'test', periods: [202601, 202602, 202603, 202604, 202605],
  series: [{ key: 'x', label: 'Exports', values: [10, 11, 12, 6, 1] }], format: (v) => String(v),
};

describe('lastComplete', () => {
  it('draws every period without completeness', () => expect(lastComplete(base)).toBe(4));
  it('stops after the last period at or above the threshold', () =>
    expect(lastComplete({ ...base, completeness: [1, 0.95, 0.9, 0.53, 0.1] })).toBe(2));
  it('keeps a dip inside the series', () =>
    expect(lastComplete({ ...base, completeness: [1, 0.6, 0.99, 0.95, 0.92] })).toBe(4));
  it('treats null as measured complete', () =>
    expect(lastComplete({ ...base, completeness: [null, null, 0.5, null, 0.2] })).toBe(3));
});

describe('stripTable', () => {
  it('marks incomplete periods and adds the completeness column', () => {
    const tb = stripTable({ ...base, completeness: [1, 0.95, 0.9, 0.53, 0.1] });
    expect(tb.columns.map((c) => c.key)).toEqual(['t', 'x', 'cmp']);
    expect(tb.rows[3].cells.t).toBe('Apr 2026 (incomplete, 53%)');
    expect(tb.rows[2].cells.t).toBe('Mar 2026');
    expect(tb.rows[4].cells.cmp).toBe('10%');
  });
});

describe('the customs citation', () => {
  const meta = {
    nodes: [{ id: 'KOR', en: 'Korea', ko: '한국' }],
    supplements: [{ node: 0, source: 'KCS', en: 'Korea Customs Service', ko: '관세청', url: '', M: [200001, 202609],
      ranges: [[200001, 201212], [202601, 202609]], fetched: '2026-10-31' }],
  } as unknown as Meta;
  it('writes runs of months', () => {
    expect(monthRange(200001, 201212, 'en')).toBe('Jan 2000–Dec 2012');
    expect(monthRange(202601, 202609, 'en')).toBe('Jan–Sep 2026');
    expect(monthRange(202601, 202609, 'ko')).toBe('2026년 1~9월');
  });
  it('names only the months a chart reaches', () => {
    expect(supplementLine('en', meta, 201301, 202512)).toBe('');
    expect(supplementRuns(meta.supplements![0], 201006, 202603)).toEqual([[201006, 201212], [202601, 202603]]);
    expect(supplementLine('en', meta, 202501, 202612))
      .toBe('Korea, Jan–Sep 2026: Korea Customs Service, fetched 31 Oct 2026.');
    expect(supplementLine('ko', meta, 199901, 202612))
      .toBe('한국 2000년 1월~2012년 12월, 2026년 1~9월: 관세청, 2026년 10월 31일 수집.');
  });
});
