import type { DatabaseService } from '../database.service.js';
import { parseFilters } from '../filters/filters.js';
import { classify, DEFAULT_THRESHOLDS } from './abc.js';
import type { AbcService } from './abc.service.js';
import { AbcComparisonService } from './abc-comparison.service.js';

const ranking = classify(
  [
    { reference: 'P', lines: 8, units: 8 },
    { reference: 'T', lines: 1, units: 1 },
  ],
  'lines',
);

function setup(selectedReferences: string[] = []) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes('FROM product')
      ? [
          { reference: 'P', abccod: 'A' },
          { reference: 'T', abccod: 'A' },
          { reference: 'X', abccod: 'C' },
        ]
      : selectedReferences.map((reference) => ({ reference })),
  }));
  const rank = vi.fn().mockResolvedValue(ranking);
  const service = new AbcComparisonService(
    { query } as unknown as DatabaseService,
    { rank } as unknown as AbcService,
  );
  const params = { basis: 'lines' as const, thresholds: DEFAULT_THRESHOLDS };
  return { service, query, rank, params };
}

describe('AbcComparisonService', () => {
  it('returns the notes, the summary and one row per product', async () => {
    const { service, params } = setup();
    const r = await service.compute(parseFilters({}), params);
    expect(r.abccodNote).toContain('origin of Product.ABCCOD is unknown');
    expect(r.notRankedNote).toContain('neither a match nor a mismatch');
    expect(r.summary).toEqual({
      products: 3,
      compared: 2,
      matches: 1,
      mismatches: 1,
      notRanked: 1,
      matchPercent: 50,
    });
    expect(r.references.map((x) => x.status)).toEqual([
      'match',
      'mismatch',
      'not-ranked',
    ]);
  });

  it('ranks on the date range only (ADR 0002)', async () => {
    const { service, rank, params } = setup(['P']);
    await service.compute(
      parseFilters({
        from: '2023-01-05',
        to: '2023-01-31',
        reference: 'T',
        customer: 'C1',
        operator: 'Op1',
        abcClass: 'C',
        excludeDuplicates: 'true',
      }),
      params,
    );
    // The full filters reach rank; dateOnly scoping is inside AbcService.rank,
    // which is covered by the abc tests. The comparison must not drop them.
    expect(rank).toHaveBeenCalledTimes(1);
    expect(rank.mock.calls[0]![1]).toEqual(params);
  });

  it('selects by reference without changing the computed class', async () => {
    const { service, params } = setup();
    const r = await service.compute(parseFilters({ reference: 'T' }), params);
    expect(r.references).toHaveLength(1);
    expect(r.references[0]).toMatchObject({
      reference: 'T',
      computedClass: 'B', // 8 of 9 lines before T (88.9%): B, not A
    });
  });

  it('selects by computed class and drops unranked products', async () => {
    const { service, params } = setup();
    const r = await service.compute(parseFilters({ abcClass: 'A' }), params);
    expect(r.references.map((x) => x.reference)).toEqual(['P']);
    expect(r.summary.notRanked).toBe(0);
  });

  it('selects by customer or operator through the order lines', async () => {
    const { service, query, params } = setup(['T']);
    const r = await service.compute(parseFilters({ customer: 'C1' }), params);
    expect(r.references.map((x) => x.reference)).toEqual(['T']);
    const [sql, p] = query.mock.calls.find(([s]) =>
      s.includes('customer_order_line'),
    )! as unknown as [string, unknown[]];
    expect(sql).toContain('customer_order_line');
    expect(p).toEqual(['C1']);
  });

  it('reports aisle as not applied', async () => {
    const { service, params } = setup();
    const r = await service.compute(parseFilters({ aisle: 'h' }), params);
    expect(r.filters.notApplied.map((f) => f.filter)).toEqual(['aisle']);
  });
});
