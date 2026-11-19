import { NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database.service.js';
import type { AbcService } from '../abc/abc.service.js';
import { parseFilters } from '../filters/filters.js';
import { WavesService } from './waves.service.js';

const lineRows = [
  {
    orderNumber: 'O1',
    customer: 'C1',
    createdAt: '2023-01-05T08:00:00',
    operator: 'Op1',
    reference: 'A',
    size: '9',
    quantity: 2,
  },
];
const pickRows = [
  {
    reference: 'A',
    size: '9.0',
    quantity: 3,
    location: 'H-06-13',
    aisle: 'H',
    operator: 'Op1',
  },
];

// Queries run in this order: order lines, picks, order-file existence.
function setup(lines: unknown[], picks: unknown[], inOrders: boolean) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: lines })
    .mockResolvedValueOnce({ rows: picks })
    .mockResolvedValueOnce({ rows: [{ found: inOrders }] });
  const service = new WavesService(
    { query } as unknown as DatabaseService,
    {} as AbcService,
  );
  return { service, query };
}

describe('WavesService', () => {
  it('returns both lists labelled with their source and flags a mismatch', async () => {
    const { service } = setup(lineRows, pickRows, true);
    const r = await service.detail('10001', parseFilters({}));
    expect(r.orders).toMatchObject({
      source: 'Customer_Order',
      inFile: true,
      totals: { orders: 1, lines: 1, units: 2 },
    });
    expect(r.picks).toMatchObject({
      source: 'Picking_Wave',
      inFile: true,
      totals: { picks: 1, units: 3 },
    });
    expect(r.unitCheck).toMatchObject({ status: 'mismatch', difference: 1 });
    expect(r.coverageNote).toContain('not reconciled');
    expect(r.linkNote).toContain('ADR 0005');
  });

  it('gives an empty picks list, not an error, for a wave only in Customer_Order', async () => {
    const { service } = setup(lineRows, [], true);
    const r = await service.detail('10002', parseFilters({}));
    expect(r.picks).toMatchObject({ inFile: false, picks: [] });
    expect(r.picks.note).toContain('77 waves');
    expect(r.unitCheck.status).toBe('not-comparable');
  });

  it('gives an empty orders list for a wave only in Picking_Wave', async () => {
    const { service } = setup([], pickRows, false);
    const r = await service.detail('10003', parseFilters({}));
    expect(r.orders).toMatchObject({ inFile: false, orders: [] });
    expect(r.orders.note).toContain('only in Picking_Wave');
  });

  it('is not a 404 when the wave only has quantity 0 lines', async () => {
    const { service } = setup([], [], true);
    const r = await service.detail('10004', parseFilters({}));
    expect(r.orders).toMatchObject({ inFile: true, orders: [] });
    expect(r.orders.note).toContain('excluded');
  });

  it('throws not found when neither file has the wave', async () => {
    const { service } = setup([], [], false);
    await expect(
      service.detail('99999', parseFilters({})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies the duplicates toggle to the order query only', async () => {
    const off = setup(lineRows, pickRows, true);
    await off.service.detail('10001', parseFilters({}));
    expect(off.query.mock.calls[0][0]).not.toContain('NOT is_duplicate');

    const on = setup(lineRows, pickRows, true);
    const r = await on.service.detail(
      '10001',
      parseFilters({ excludeDuplicates: 'true' }),
    );
    expect(on.query.mock.calls[0][0]).toContain('NOT is_duplicate');
    expect(on.query.mock.calls[0][1]).toEqual(['10001']);
    expect(on.query.mock.calls[1][0]).not.toContain('is_duplicate');
    expect(r.filters.excludeDuplicates.requested).toBe(true);
  });

  it('reports the global filters it does not apply', async () => {
    const { service, query } = setup(lineRows, pickRows, true);
    const r = await service.detail(
      '10001',
      parseFilters({ reference: 'A', customer: 'C1' }),
    );
    expect(r.filters.notApplied.map((n) => n.filter)).toEqual([
      'reference',
      'customer',
    ]);
    expect(query.mock.calls[0][0]).not.toContain('reference =');
  });
});

describe('WavesService.list', () => {
  const params = {
    page: 2,
    pageSize: 10,
    sort: 'waveNumber',
    order: 'asc',
  } as const;
  const abcParams = { basis: 'lines', thresholds: { a: 80, b: 95 } } as const;

  function setupList(total: number, waves: unknown[], references?: string[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total }] })
      .mockResolvedValueOnce({ rows: waves });
    const referencesInClass = vi.fn().mockResolvedValue(references);
    const service = new WavesService(
      { query } as unknown as DatabaseService,
      { referencesInClass } as unknown as AbcService,
    );
    return { service, query, referencesInClass };
  }

  it('returns the page, the total and the source', async () => {
    const wave = {
      waveNumber: '10001',
      orders: 2,
      lines: 4,
      units: 6,
      firstCreatedAt: '2023-01-05T08:00:00',
      lastCreatedAt: '2023-01-05T08:00:00',
    };
    const { service, query } = setupList(11, [wave]);
    const r = await service.list(parseFilters({}), abcParams, params);
    expect(r).toMatchObject({
      source: 'Customer_Order',
      total: 11,
      page: 2,
      pageSize: 10,
      waves: [wave],
    });
    expect(query.mock.calls[1][0]).toContain('LIMIT 10 OFFSET 10');
    expect(query.mock.calls[1][0]).toContain('length(wave_number) ASC');
  });

  it('applies the shared filters and the duplicates toggle in SQL', async () => {
    const { service, query } = setupList(0, [], ['A']);
    const r = await service.list(
      parseFilters({
        reference: 'A',
        abcClass: 'A',
        excludeDuplicates: 'true',
        aisle: 'H',
      }),
      abcParams,
      params,
    );
    expect(query.mock.calls[0][0]).toContain('is_valid');
    expect(query.mock.calls[0][0]).toContain('NOT is_duplicate');
    expect(query.mock.calls[0][1]).toEqual(['A', ['A']]);
    expect(r.filters.notApplied.map((n) => n.filter)).toEqual(['aisle']);
    expect(r.filters.applied).toEqual(['abcClass', 'reference']);
  });

  it('sorts by first creation date, then by wave number', async () => {
    const { service, query } = setupList(0, []);
    await service.list(parseFilters({}), abcParams, {
      ...params,
      sort: 'firstCreatedAt',
      order: 'desc',
    });
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY first_created_at DESC, length(wave_number) DESC, wave_number DESC',
    );
  });
});
