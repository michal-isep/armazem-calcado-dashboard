import type { AbcService } from '../abc/abc.service.js';
import { DEFAULT_THRESHOLDS } from '../abc/abc.js';
import type { DatabaseService } from '../database.service.js';
import { parseFilters } from '../filters/filters.js';
import { AisleService } from './aisle.service.js';

function setup(pickRows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows: pickRows });
  const compute = vi.fn().mockResolvedValue({
    references: [
      { reference: 'P', abcClass: 'A' },
      { reference: 'T', abcClass: 'C' },
    ],
  });
  const service = new AisleService(
    { query } as unknown as DatabaseService,
    { compute } as unknown as AbcService,
  );
  return { service, query, compute };
}

const picks = [
  { aisle: 'H', reference: 'P', picks: 2, units: 3 },
  { aisle: 'H', reference: 'T', picks: 1, units: 1 },
  { aisle: 'C', reference: 'P', picks: 1, units: 1 },
];

describe('AisleService', () => {
  it('labels the response as a proxy and carries the coverage note', async () => {
    const { service } = setup(picks);
    const r = await service.compute(
      parseFilters({}),
      'lines',
      DEFAULT_THRESHOLDS,
    );
    expect(r.source).toBe('Picking_Wave');
    expect(r.label).toBe('proxy, not Sector');
    expect(r.coverageNote).toContain('94%');
    expect(r.totals).toEqual({ picks: 4, units: 5 });
    expect(r.unknownAisles.picks).toBe(1);
  });

  it('computes the classes on the date range only (ADR 0002)', async () => {
    const { service, compute } = setup(picks);
    await service.compute(
      parseFilters({
        from: '2023-01-05',
        to: '2023-01-31',
        reference: 'T',
        operator: 'Op1',
        aisle: 'H',
        abcClass: 'C',
        excludeDuplicates: 'true',
      }),
      'units',
      { a: 70, b: 90 },
    );
    expect(compute).toHaveBeenCalledWith(
      { from: '2023-01-05', to: '2023-01-31', excludeDuplicates: true },
      'units',
      { a: 70, b: 90 },
    );
  });

  it('sends the other filters to the picks query', async () => {
    const { service, query } = setup([]);
    await service.compute(
      parseFilters({ reference: 'T', operator: 'Op1', aisle: 'h' }),
      'lines',
      DEFAULT_THRESHOLDS,
    );
    const [sql, params] = query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain('picking_wave_pick');
    expect(params).toEqual(['T', 'Op1', 'H']);
  });

  it('selects the abcClass after classifying', async () => {
    const { service } = setup(picks);
    const r = await service.compute(
      parseFilters({ abcClass: 'C' }),
      'lines',
      DEFAULT_THRESHOLDS,
    );
    expect(r.totals).toEqual({ picks: 1, units: 1 });
    expect(r.filters.applied).toContain('abcClass');
  });

  it('reports customer and the duplicates toggle as not applied to picks', async () => {
    const { service } = setup(picks);
    const r = await service.compute(
      parseFilters({ customer: 'C1', excludeDuplicates: 'true' }),
      'lines',
      DEFAULT_THRESHOLDS,
    );
    expect(r.filters.notApplied.map((f) => f.filter)).toEqual(['customer']);
    expect(r.filters.excludeDuplicates).toEqual({
      requested: true,
      applied: false,
    });
  });

  it('gives empty lists, not an error, when there are no picks', async () => {
    const { service } = setup([]);
    const r = await service.compute(
      parseFilters({}),
      'lines',
      DEFAULT_THRESHOLDS,
    );
    expect(r.aisles).toEqual([]);
    expect(r.unknownAisles.aisles).toEqual([]);
    expect(r.totals).toEqual({ picks: 0, units: 0 });
  });
});
