import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { OrderFilters, orderFilterSql } from './filters.js';

// Ratio indicators with the counts behind them (spec section 5: trend charts
// show only M2, M3, X1 and X2; counts and units go in the tooltip). Ratios
// are null when no order matches, never zero.
export interface PeriodIndicators {
  orders: number;
  lines: number;
  units: number;
  waves: number;
  m2AverageOrderSize: number | null;
  m3AverageOrdersPerWave: number | null;
  x1LinesPerOrder: number | null;
  x2SplitOrdersPercent: number | null;
}

export interface MonthIndicators extends PeriodIndicators {
  month: string; // YYYY-MM
  // Part of the month inside the selected range and the data range.
  from: string;
  to: string;
  daysCovered: number;
  daysInMonth: number;
  // True when the data does not cover the whole calendar month (January and
  // October in the current data).
  partial: boolean;
}

export type ComparisonStatus = 'ok' | 'no-data';

export interface MonthlyTrend {
  source: 'Customer_Order';
  filters: OrderFilters;
  // First and last order date in the data; null when there are no orders.
  dataRange: { from: string; to: string } | null;
  months: MonthIndicators[];
  // The selected range (filters, or the data range when absent) and its
  // indicators over the whole range.
  period: { from: string; to: string; days: number } | null;
  current: PeriodIndicators | null;
  // Previous period of equal length, immediately before the selected range.
  // "no-data" when it starts before the data does or has no matching order;
  // the indicators are then null, never zero.
  comparison: {
    status: ComparisonStatus;
    reason?: 'before-data-start' | 'no-matching-orders';
    from: string | null;
    to: string | null;
    indicators: PeriodIndicators | null;
  };
}

interface Row {
  period: string;
  orders: number;
  waves: number;
  lines: number;
  units: number;
  pairs: number;
  split_orders: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((toTime(to) - toTime(from)) / DAY_MS) + 1;
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

function lastDayOfMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return toDate(Date.UTC(year, number, 0));
}

function nextMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return toDate(Date.UTC(year, number, 1)).slice(0, 7);
}

const EMPTY_ROW: Omit<Row, 'period'> = {
  orders: 0,
  waves: 0,
  lines: 0,
  units: 0,
  pairs: 0,
  split_orders: 0,
};

function indicators(row: Omit<Row, 'period'>): PeriodIndicators {
  const { orders, waves, lines, units, pairs, split_orders } = row;
  return {
    orders,
    lines,
    units,
    waves,
    m2AverageOrderSize: orders > 0 ? units / orders : null,
    m3AverageOrdersPerWave: waves > 0 ? pairs / waves : null,
    x1LinesPerOrder: orders > 0 ? lines / orders : null,
    x2SplitOrdersPercent: orders > 0 ? (split_orders / orders) * 100 : null,
  };
}

@Injectable()
export class MonthlyTrendService {
  constructor(private readonly database: DatabaseService) {}

  async compute(filters: OrderFilters): Promise<MonthlyTrend> {
    const dataRange = await this.dataRange();
    if (!dataRange) {
      return {
        source: 'Customer_Order',
        filters,
        dataRange: null,
        months: [],
        period: null,
        current: null,
        comparison: {
          status: 'no-data',
          reason: 'no-matching-orders',
          from: null,
          to: null,
          indicators: null,
        },
      };
    }

    const from = filters.from ?? dataRange.from;
    const to = filters.to ?? dataRange.to;
    const days = daysBetween(from, to);

    const [byMonth, current] = await Promise.all([
      this.aggregate(filters, true),
      this.aggregate(filters, false),
    ]);
    const monthRows = new Map(byMonth.map((row) => [row.period, row]));

    // One entry per month between the selected range and the data range, so a
    // month without matching orders shows as null rather than disappearing.
    const months: MonthIndicators[] = [];
    const first = later(from, dataRange.from);
    const last = earlier(to, dataRange.to);
    for (
      let month = first.slice(0, 7);
      month <= last.slice(0, 7);
      month = nextMonth(month)
    ) {
      const monthStart = `${month}-01`;
      const monthEnd = lastDayOfMonth(month);
      const covered = {
        from: later(monthStart, first),
        to: earlier(monthEnd, last),
      };
      months.push({
        month,
        ...covered,
        daysCovered: daysBetween(covered.from, covered.to),
        daysInMonth: daysBetween(monthStart, monthEnd),
        partial: dataRange.from > monthStart || dataRange.to < monthEnd,
        ...indicators(monthRows.get(month) ?? EMPTY_ROW),
      });
    }

    return {
      source: 'Customer_Order',
      filters,
      dataRange,
      months,
      period: { from, to, days },
      current: indicators(current[0] ?? EMPTY_ROW),
      comparison: await this.compare(filters, from, days, dataRange.from),
    };
  }

  private async compare(
    filters: OrderFilters,
    from: string,
    days: number,
    dataStart: string,
  ): Promise<MonthlyTrend['comparison']> {
    const previousTo = toDate(toTime(from) - DAY_MS);
    const previousFrom = toDate(toTime(from) - days * DAY_MS);
    const noData = (reason: 'before-data-start' | 'no-matching-orders') => ({
      status: 'no-data' as const,
      reason,
      from: previousFrom,
      to: previousTo,
      indicators: null,
    });
    if (previousFrom < dataStart) return noData('before-data-start');

    const rows = await this.aggregate(
      { ...filters, from: previousFrom, to: previousTo },
      false,
    );
    const previous = indicators(rows[0] ?? EMPTY_ROW);
    if (previous.orders === 0) return noData('no-matching-orders');
    return {
      status: 'ok',
      from: previousFrom,
      to: previousTo,
      indicators: previous,
    };
  }

  // The data range ignores the filters: it is what the files cover.
  private async dataRange(): Promise<{ from: string; to: string } | null> {
    const { rows } = await this.database.query<{
      first: string | null;
      last: string | null;
    }>(
      `SELECT to_char(min(created_at), 'YYYY-MM-DD') AS first,
              to_char(max(created_at), 'YYYY-MM-DD') AS last
         FROM customer_order_line`,
    );
    const { first, last } = rows[0];
    return first && last ? { from: first, to: last } : null;
  }

  // Counts per calendar month (YYYY-MM) or, without byMonth, one row for the
  // whole filtered range. An order is counted in the month of its created_at.
  private async aggregate(
    filters: OrderFilters,
    byMonth: boolean,
  ): Promise<Row[]> {
    const { where, params } = orderFilterSql(filters);
    const period = byMonth ? "to_char(created_at, 'YYYY-MM')" : "'all'";
    const { rows } = await this.database.query<Row>(
      `WITH filtered AS (
         SELECT ${period} AS period, order_number, wave_number, quantity
           FROM customer_order_line
          WHERE ${where}),
       per_order AS (
         SELECT period, order_number, count(DISTINCT wave_number) AS order_waves
           FROM filtered
          GROUP BY period, order_number),
       order_totals AS (
         SELECT period,
                count(*)::int AS orders,
                sum(order_waves)::int AS pairs,
                (count(*) FILTER (WHERE order_waves > 1))::int AS split_orders
           FROM per_order
          GROUP BY period),
       line_totals AS (
         SELECT period,
                count(DISTINCT wave_number)::int AS waves,
                count(*)::int AS lines,
                sum(quantity)::int AS units
           FROM filtered
          GROUP BY period)
       SELECT period, orders, waves, lines, units, pairs, split_orders
         FROM order_totals
         JOIN line_totals USING (period)
        ORDER BY period`,
      params,
    );
    return rows;
  }
}
