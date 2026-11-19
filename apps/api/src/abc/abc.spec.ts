import { AbcParamError, classify, parseAbcParams } from './abc.js';

const fixture2 = [
  { reference: 'P', lines: 8, units: 8 },
  { reference: 'Q', lines: 6, units: 6 },
  { reference: 'R', lines: 3, units: 3 },
  { reference: 'S', lines: 2, units: 2 },
  { reference: 'T', lines: 1, units: 1 },
];

describe('classify', () => {
  it('matches spec fixture 2 (lines basis, 80/95)', () => {
    const rows = classify(fixture2, 'lines');
    expect(rows.map((r) => [r.reference, r.abcClass])).toEqual([
      ['P', 'A'],
      ['Q', 'A'],
      ['R', 'A'],
      ['S', 'B'],
      ['T', 'C'],
    ]);
    expect(rows.map((r) => r.cumulativeBeforePercent)).toEqual([
      0, 40, 70, 85, 95,
    ]);
  });

  it('matches the spec fixture on the units basis (80% is not below 80%)', () => {
    const rows = classify(
      [
        { reference: 'A', lines: 2, units: 4 },
        { reference: 'B', lines: 1, units: 2 },
        { reference: 'C', lines: 1, units: 4 },
      ],
      'units',
    );
    expect(rows.map((r) => [r.reference, r.abcClass])).toEqual([
      ['A', 'A'],
      ['C', 'A'],
      ['B', 'B'],
    ]);
  });

  it('matches the spec fixture on the lines basis, ties by reference', () => {
    const rows = classify(
      [
        { reference: 'C', lines: 1, units: 4 },
        { reference: 'B', lines: 1, units: 2 },
        { reference: 'A', lines: 2, units: 4 },
      ],
      'lines',
    );
    expect(rows.map((r) => [r.reference, r.abcClass])).toEqual([
      ['A', 'A'],
      ['B', 'A'],
      ['C', 'A'],
    ]);
    expect(rows.map((r) => r.cumulativeBeforePercent)).toEqual([0, 50, 75]);
  });

  it('uses the thresholds it is given', () => {
    const rows = classify(fixture2, 'lines', { a: 40, b: 70 });
    expect(rows.map((r) => r.abcClass)).toEqual(['A', 'B', 'C', 'C', 'C']);
  });

  it('does not rank references with none of the basis, and handles empty', () => {
    expect(classify([{ reference: 'V', lines: 0, units: 0 }], 'lines')).toEqual(
      [],
    );
    expect(classify([], 'units')).toEqual([]);
  });
});

describe('parseAbcParams', () => {
  it('defaults to lines, 80 and 95', () => {
    expect(parseAbcParams({})).toEqual({
      basis: 'lines',
      thresholds: { a: 80, b: 95 },
    });
  });

  it('reads basis and thresholds', () => {
    expect(
      parseAbcParams({ basis: 'units', thresholdA: '70', thresholdB: '90' }),
    ).toEqual({ basis: 'units', thresholds: { a: 70, b: 90 } });
  });

  it.each([
    { basis: 'orders' },
    { thresholdA: 'x' },
    { thresholdA: '95', thresholdB: '80' },
    { thresholdA: '0' },
    { thresholdB: '101' },
    { basis: ['lines', 'units'] },
  ])('rejects %j', (query) => {
    expect(() => parseAbcParams(query)).toThrow(AbcParamError);
  });
});
