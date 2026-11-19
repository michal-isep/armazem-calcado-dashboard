import { DatabaseService } from '../database.service.js';
import { AbcService } from '../abc/abc.service.js';
import { parseFilters } from '../filters/filters.js';
const abc = {
  referencesInClass: async () => undefined,
} as unknown as AbcService;
const defaults = { basis: 'lines' as const, thresholds: { a: 80, b: 95 } };
import { SectorService } from './sector.service.js';

function serviceReturning(row: Record<string, unknown>) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  const service = new SectorService(
    { query } as unknown as DatabaseService,
    abc,
  );
  return { service, query };
}

describe('SectorService', () => {
  it('computes M4 and M5 on the spec fixture', async () => {
    const { service } = serviceReturning({
      orders: 3,
      lines: 4,
      units: 10,
      multi_sector_orders: 1,
      sectors: [
        { sector: 'S1', units: 4, lines: 2, orders: 2 },
        { sector: 'S2', units: 6, lines: 2, orders: 2 },
      ],
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result).toMatchObject({
      source: 'Product + Customer_Order',
      orders: 3,
      lines: 4,
      units: 10,
      multiSectorOrders: 1,
      notInformative: false,
    });
    expect(result.m4SectorShare.map((s) => [s.sector, s.sharePercent])).toEqual(
      [
        ['S1', 40],
        ['S2', 60],
      ],
    );
    expect(result.m5MultiSectorOrdersPercent).toBeCloseTo(100 / 3);
  });

  it('flags a single sector as not informative (M4 100%, M5 0%)', async () => {
    const { service } = serviceReturning({
      orders: 2,
      lines: 3,
      units: 7,
      multi_sector_orders: 0,
      sectors: [{ sector: 'PF', units: 7, lines: 3, orders: 2 }],
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result.m4SectorShare).toEqual([
      { sector: 'PF', units: 7, lines: 3, orders: 2, sharePercent: 100 },
    ]);
    expect(result.m5MultiSectorOrdersPercent).toBe(0);
    expect(result.notInformative).toBe(true);
  });

  it('gives nulls and no sectors when nothing matches', async () => {
    const { service } = serviceReturning({
      orders: 0,
      lines: 0,
      units: 0,
      multi_sector_orders: 0,
      sectors: [],
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result.m4SectorShare).toEqual([]);
    expect(result.m5MultiSectorOrdersPercent).toBeNull();
  });

  it('passes the filter parameters to the query', async () => {
    const { service, query } = serviceReturning({
      orders: 0,
      lines: 0,
      units: 0,
      multi_sector_orders: 0,
      sectors: [],
    });
    await service.compute(
      parseFilters({ from: '2023-01-05', reference: 'A' }),
      defaults,
    );
    expect(query.mock.calls[0][1]).toEqual(['2023-01-05', 'A']);
  });
});
