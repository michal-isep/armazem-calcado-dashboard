import { BadRequestException } from '@nestjs/common';
import type { DatabaseService } from '../database.service.js';
import { parseFilters } from '../filters/filters.js';
import { AbcSizesService } from './abc-sizes.service.js';

function setup() {
  const query = vi.fn(async () => ({
    rows: [
      { size: '9', lines: 6, units: 6 },
      { size: '8', lines: 3, units: 4 },
      { size: 'unknown', lines: 1, units: 0 },
    ],
  }));
  return {
    query,
    service: new AbcSizesService({ query } as unknown as DatabaseService),
  };
}

describe('AbcSizesService', () => {
  it('requires a reference', async () => {
    const { service } = setup();
    await expect(service.compute(parseFilters({}), 'lines')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns the sizes with totals and the share on the active basis', async () => {
    const { service } = setup();
    const r = await service.compute(parseFilters({ reference: 'P' }), 'lines');
    expect(r.reference).toBe('P');
    expect(r.lines).toBe(10);
    expect(r.units).toBe(10);
    expect(r.sizes.map((s) => s.sharePercent)).toEqual([60, 30, 10]);
  });

  it('uses units for the share and the ordering when asked', async () => {
    const { service, query } = setup();
    const r = await service.compute(parseFilters({ reference: 'P' }), 'units');
    expect(r.sizes[0].sharePercent).toBe(60);
    expect(r.sizes[1].sharePercent).toBe(40);
    const sql = (query.mock.calls[0] as unknown as [string])[0];
    expect(sql).toContain('ORDER BY units DESC');
  });

  it('applies the date range, reference and the duplicates toggle', async () => {
    const { service, query } = setup();
    await service.compute(
      parseFilters({
        reference: 'P',
        from: '2023-01-05',
        excludeDuplicates: 'true',
      }),
      'lines',
    );
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('NOT is_duplicate');
    expect(sql).toContain('reference = $2');
    expect(params).toEqual(['2023-01-05', 'P']);
  });
});
