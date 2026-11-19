import { DatabaseService } from '../database.service.js';
import { AbcService } from '../abc/abc.service.js';
import { parseFilters } from '../filters/filters.js';
const abc = {
  referencesInClass: async () => undefined,
} as unknown as AbcService;
const defaults = { basis: 'lines' as const, thresholds: { a: 80, b: 95 } };
import { MonthlyTrendService } from './monthly-trend.service.js';

const row = (period: string, orders: number, units: number) => ({
  period,
  orders,
  waves: orders,
  lines: orders * 2,
  units,
  pairs: orders,
  split_orders: 0,
});

// The service sends the date-range query (no GROUP BY period) and then the
// monthly and whole-range aggregates, told apart by their SQL.
function serviceWith(options: {
  range: { first: string | null; last: string | null };
  monthly?: ReturnType<typeof row>[];
  whole?: ReturnType<typeof row>[];
}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('min(created_at)')) return { rows: [options.range] };
    if (sql.includes("to_char(created_at, 'YYYY-MM') AS period")) {
      return { rows: options.monthly ?? [] };
    }
    return { rows: options.whole ?? [] };
  });
  const service = new MonthlyTrendService(
    {
      query,
    } as unknown as DatabaseService,
    abc,
  );
  return { service, query };
}

describe('MonthlyTrendService', () => {
  it('returns empty results when there are no orders', async () => {
    const { service } = serviceWith({ range: { first: null, last: null } });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result).toMatchObject({
      dataRange: null,
      months: [],
      period: null,
      current: null,
      comparison: { status: 'no-data', indicators: null },
    });
  });

  it('builds a month per calendar month and flags partial ones', async () => {
    const { service } = serviceWith({
      range: { first: '2023-01-05', last: '2023-03-31' },
      monthly: [row('2023-01', 2, 10), row('2023-03', 4, 8)],
      whole: [row('all', 6, 18)],
    });
    const result = await service.compute(parseFilters({}), defaults);
    expect(result.months.map((m) => [m.month, m.partial])).toEqual([
      ['2023-01', true],
      ['2023-02', false],
      ['2023-03', false],
    ]);
    expect(result.months[0]).toMatchObject({
      daysCovered: 27,
      daysInMonth: 31,
      m2AverageOrderSize: 5,
    });
    // February has no row: null ratios, not zero.
    expect(result.months[1]).toMatchObject({
      orders: 0,
      m2AverageOrderSize: null,
      x2SplitOrdersPercent: null,
    });
  });

  it('gives no data for a previous period before the data start', async () => {
    const { service, query } = serviceWith({
      range: { first: '2023-01-05', last: '2023-10-19' },
      monthly: [],
      whole: [row('all', 1, 1)],
    });
    const result = await service.compute(
      parseFilters({ from: '2023-01-10', to: '2023-01-20' }),
      defaults,
    );
    // 11 days: the previous period is 2022-12-30 to 2023-01-09.
    expect(result.comparison).toEqual({
      status: 'no-data',
      reason: 'before-data-start',
      from: '2022-12-30',
      to: '2023-01-09',
      indicators: null,
    });
    // No query is spent on a period that cannot have data.
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('computes the previous period of equal length', async () => {
    const { service, query } = serviceWith({
      range: { first: '2023-01-05', last: '2023-10-19' },
      whole: [row('all', 2, 6)],
    });
    const result = await service.compute(
      parseFilters({ from: '2023-03-01', to: '2023-03-31' }),
      defaults,
    );
    // 31 days: the previous period is 2023-01-29 to 2023-02-28.
    expect(result.comparison).toMatchObject({
      status: 'ok',
      from: '2023-01-29',
      to: '2023-02-28',
      indicators: { orders: 2, m2AverageOrderSize: 3 },
    });
    const previousParams = query.mock.calls.at(-1) as unknown as [
      string,
      string[],
    ];
    expect(previousParams[1]).toEqual(['2023-01-29', '2023-02-28']);
  });
});
