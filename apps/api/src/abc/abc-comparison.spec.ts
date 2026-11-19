import { classify } from './abc.js';
import { compareAbc, summarise } from './abc-comparison.js';

// Spec fixture 2 (lines basis, 80/95): P, Q, R = A, S = B, T = C.
const ranking = classify(
  [
    { reference: 'P', lines: 8, units: 8 },
    { reference: 'Q', lines: 6, units: 6 },
    { reference: 'R', lines: 3, units: 3 },
    { reference: 'S', lines: 2, units: 2 },
    { reference: 'T', lines: 1, units: 1 },
  ],
  'lines',
);

const products = [
  { reference: 'T', abccod: 'A' }, // mismatch (computed C)
  { reference: 'P', abccod: 'A' }, // match
  { reference: 'Q', abccod: 'B' }, // mismatch (computed A)
  { reference: 'S', abccod: 'B' }, // match
  { reference: 'X', abccod: 'C' }, // no order line: not ranked
];

describe('compareAbc', () => {
  const rows = compareAbc(products, ranking);
  const by = (ref: string) => rows.find((r) => r.reference === ref)!;

  it('lists one row per product, ordered by reference', () => {
    expect(rows.map((r) => r.reference)).toEqual(['P', 'Q', 'S', 'T', 'X']);
  });

  it('marks match and mismatch from the computed class', () => {
    expect(by('P')).toMatchObject({
      computedClass: 'A',
      abccod: 'A',
      status: 'match',
      rank: 1,
      lines: 8,
    });
    expect(by('Q')).toMatchObject({
      computedClass: 'A',
      abccod: 'B',
      status: 'mismatch',
    });
    expect(by('S').status).toBe('match');
    expect(by('T')).toMatchObject({ computedClass: 'C', status: 'mismatch' });
  });

  it('reports a product with no order line as not-ranked, not a mismatch', () => {
    expect(by('X')).toEqual({
      reference: 'X',
      computedClass: null,
      abccod: 'C',
      status: 'not-ranked',
      rank: null,
      lines: 0,
      units: 0,
    });
  });

  it('compares ABCCOD ignoring case and padding', () => {
    const r = compareAbc([{ reference: 'P', abccod: ' a ' }], ranking);
    expect(r[0]!.status).toBe('match');
  });
});

describe('summarise', () => {
  it('counts over the compared products only', () => {
    const s = summarise(compareAbc(products, ranking));
    expect(s).toEqual({
      products: 5,
      compared: 4,
      matches: 2,
      mismatches: 2,
      notRanked: 1,
      matchPercent: 50,
    });
  });

  it('gives a null percentage when nothing was compared', () => {
    const s = summarise(compareAbc(products, []));
    expect(s).toMatchObject({
      products: 5,
      compared: 0,
      notRanked: 5,
      matchPercent: null,
    });
  });

  it('handles no products at all', () => {
    expect(summarise([])).toMatchObject({ products: 0, matchPercent: null });
  });
});
