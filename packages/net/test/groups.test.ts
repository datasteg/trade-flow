// Membership at a date (src/groups.ts): period ends, dated members, blocs in the reader's order, clubs, lists.
import { describe, expect, it } from 'vitest';
import { memberOn, membersOn, periodEnd, resolveColouring, type GroupDef, type GroupsFile } from '../src/groups';

const g = (kind: GroupDef['kind'], colour: string, members: GroupDef['members']): GroupDef =>
  ({ kind, en: '', ko: '', colour, note: null, members, sources: [] });

const file: GroupsFile = {
  v: 1,
  schemes: { region: ['EUR', 'EAS'], bloc: ['EU', 'ASEAN', 'EAEU', 'MERCOSUR', 'X'], club: ['G7', 'BRICS'] },
  custom: { en: 'Custom', ko: '', colour: 'viz-3' },
  groups: {
    EUR: g('region', 'viz-5', [['GBR', null, null], ['FRA', null, null], ['DEU', null, null]]),
    EAS: g('region', 'viz-4', [['CHN', null, null], ['JPN', null, null]]),
    EU: g('bloc', 'viz-5', [['FRA', '1958-01-01', null], ['DEU', '1958-01-01', null], ['GBR', '1973-01-01', '2020-01-31'], ['HRV', '2013-07-01', null]]),
    ASEAN: g('bloc', 'viz-4', [['IDN', '1967-08-08', null], ['TLS', '2025-10-26', null]]),
    MERCOSUR: g('bloc', 'viz-6', [['PRY', '1991-11-29', '2012-06-28'], ['PRY', '2013-08-15', null], ['VEN', '2012-07-31', '2016-12-01']]),
    // a made-up bloc that overlaps the EU, for the first-wins rule
    X: g('bloc', 'viz-7', [['FRA', '2000-01-01', null], ['IDN', '2000-01-01', null]]),
    G7: g('club', 'viz-3', [['USA', '1975-11-15', null], ['CAN', '1976-06-27', null]]),
    BRICS: g('club', 'viz-4', [['CHN', '2009-06-16', null], ['ARE', '2024-01-01', null]]),
  },
};

describe('periodEnd', () => {
  it('ends a year on 31 December and a month on its last day', () => {
    expect(periodEnd(2020, 'A')).toBe('2020-12-31');
    expect(periodEnd(202001, 'M')).toBe('2020-01-31');
    expect(periodEnd(202002, 'M')).toBe('2020-02-29');
    expect(periodEnd(202302, 'M')).toBe('2023-02-28');
    expect(periodEnd(202412, 'M')).toBe('2024-12-31');
  });
});

describe('memberOn', () => {
  const eu = file.groups.EU;
  it('takes both dates as inclusive', () => {
    expect(memberOn(eu, 'GBR', '1972-12-31')).toBe(false);
    expect(memberOn(eu, 'GBR', '1973-01-01')).toBe(true);
    expect(memberOn(eu, 'GBR', '2020-01-31')).toBe(true);
    expect(memberOn(eu, 'GBR', '2020-02-01')).toBe(false);
  });
  it('moves the UK out of the EU between 2019 and 2020 (years) and after January 2020 (months)', () => {
    expect(memberOn(eu, 'GBR', periodEnd(2019, 'A'))).toBe(true);
    expect(memberOn(eu, 'GBR', periodEnd(2020, 'A'))).toBe(false);
    expect(memberOn(eu, 'GBR', periodEnd(202001, 'M'))).toBe(true);
    expect(memberOn(eu, 'GBR', periodEnd(202002, 'M'))).toBe(false);
  });
  it('counts a year in which an economy joined (membership at the end of the period)', () => {
    expect(memberOn(eu, 'HRV', periodEnd(2012, 'A'))).toBe(false);
    expect(memberOn(eu, 'HRV', periodEnd(2013, 'A'))).toBe(true);
    expect(memberOn(eu, 'HRV', periodEnd(201306, 'M'))).toBe(false);
    expect(memberOn(eu, 'HRV', periodEnd(201307, 'M'))).toBe(true);
  });
  it('handles a suspension and a return (two rows)', () => {
    const m = file.groups.MERCOSUR;
    expect(memberOn(m, 'PRY', '2012-06-28')).toBe(true);
    expect(memberOn(m, 'PRY', '2013-01-31')).toBe(false);
    expect(memberOn(m, 'PRY', '2013-08-15')).toBe(true);
    expect(membersOn(m, '2014-12-31').sort()).toEqual(['PRY', 'VEN']);
    expect(membersOn(m, '2017-12-31')).toEqual(['PRY']);
  });
});

describe('resolveColouring', () => {
  it('regions: every member, no date', () => {
    const c = resolveColouring(file, 'region', { date: '2020-12-31' });
    expect(c.groupOf).toEqual({ GBR: 'EUR', FRA: 'EUR', DEU: 'EUR', CHN: 'EAS', JPN: 'EAS' });
    expect(c.keys).toEqual(['EUR', 'EAS']);
    expect(c.date).toBeNull();
  });
  it('blocs: membership at the date, the first selected bloc wins, overlaps counted', () => {
    const a = resolveColouring(file, 'bloc', { blocs: ['EU', 'X'], date: '2019-12-31' });
    expect(a.groupOf).toEqual({ FRA: 'EU', DEU: 'EU', GBR: 'EU', HRV: 'EU', IDN: 'X' });
    expect(a.overlaps).toBe(1);
    const b = resolveColouring(file, 'bloc', { blocs: ['X', 'EU'], date: '2020-12-31' });
    expect(b.groupOf.FRA).toBe('X');
    expect(b.groupOf.GBR).toBeUndefined();
    expect(b.keys).toEqual(['X', 'EU']);
    expect(b.colours).toEqual({ X: 'viz-7', EU: 'viz-5' });
  });
  it('blocs: Timor-Leste joins ASEAN in October 2025', () => {
    expect(resolveColouring(file, 'bloc', { blocs: ['ASEAN'], date: periodEnd(202509, 'M') }).groupOf.TLS).toBeUndefined();
    expect(resolveColouring(file, 'bloc', { blocs: ['ASEAN'], date: periodEnd(2025, 'A') }).groupOf.TLS).toBe('ASEAN');
  });
  it('clubs: one at a time', () => {
    const c = resolveColouring(file, 'club', { club: 'BRICS', date: '2023-12-31' });
    expect(c.groupOf).toEqual({ CHN: 'BRICS' });
    expect(resolveColouring(file, 'club', { club: 'BRICS', date: '2024-12-31' }).groupOf.ARE).toBe('BRICS');
  });
  it('custom: the reader’s list, upper-cased', () => {
    const c = resolveColouring(file, 'custom', { custom: ['usa', 'CAN'], date: '2024-12-31' });
    expect(c.groupOf).toEqual({ USA: 'custom', CAN: 'custom' });
    expect(c.colours).toEqual({ custom: 'viz-3' });
  });
  it('skips unknown keys', () => {
    expect(resolveColouring(file, 'bloc', { blocs: ['NOPE', 'EU'], date: '2024-12-31' }).keys).toEqual(['EU']);
  });
});
