import { DatabaseService } from '../database.service.js';
import { AbcService } from '../abc/abc.service.js';
import { parseFilters } from '../filters/filters.js';
const abc = {
  referencesInClass: async () => undefined,
} as unknown as AbcService;
const defaults = { basis: 'lines' as const, thresholds: { a: 80, b: 95 } };
import { WaveSplitService } from './wave-split.service.js';

function serviceReturning(row: Record<string, number>) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  const service = new WaveSplitService(
    { query } as unknown as DatabaseService,
    abc,
  );
  return { service, query };
}

describe('WaveSplitService', () => {
  it('computes M3 and X2 from the counts', async () => {
    const { service } = serviceReturning({
      orders: 3,
      waves: 2,
      lines: 5,
      pairs: 3,
      split_orders: 1,
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result).toMatchObject({
      source: 'Customer_Order',
      orders: 3,
      waves: 2,
      lines: 5,
      waveOrderPairs: 3,
      splitOrders: 1,
      m3AverageOrdersPerWave: 1.5,
    });
    expect(result.x2SplitOrdersPercent).toBeCloseTo(100 / 3);
  });

  it('gives nulls when nothing matches', async () => {
    const { service } = serviceReturning({
      orders: 0,
      waves: 0,
      lines: 0,
      pairs: 0,
      split_orders: 0,
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result.m3AverageOrdersPerWave).toBeNull();
    expect(result.x2SplitOrdersPercent).toBeNull();
  });

  it('passes the filter parameters to the query', async () => {
    const { service, query } = serviceReturning({
      orders: 0,
      waves: 0,
      lines: 0,
      pairs: 0,
      split_orders: 0,
    });
    await service.compute(
      parseFilters({ from: '2023-01-05', reference: 'A' }),
      defaults,
    );
    expect(query.mock.calls[0][1]).toEqual(['2023-01-05', 'A']);
  });
});
