import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { OrderFilters, orderFilterSql } from './filters.js';

export interface WaveSplitIndicators {
  source: 'Customer_Order';
  filters: OrderFilters;
  orders: number;
  waves: number;
  lines: number;
  // Distinct (wave, order) pairs: an order split across waves counts once in
  // each wave.
  waveOrderPairs: number;
  splitOrders: number;
  // M3 = (wave, order) pairs / distinct waves; X2 = percentage of orders that
  // appear in more than one wave. null when no order matches the filters.
  m3AverageOrdersPerWave: number | null;
  x2SplitOrdersPercent: number | null;
}

@Injectable()
export class WaveSplitService {
  constructor(private readonly database: DatabaseService) {}

  async compute(filters: OrderFilters): Promise<WaveSplitIndicators> {
    const { where, params } = orderFilterSql(filters);
    const { rows } = await this.database.query<{
      orders: number;
      waves: number;
      lines: number;
      pairs: number;
      split_orders: number;
    }>(
      `WITH filtered AS (
         SELECT order_number, wave_number
           FROM customer_order_line
          WHERE ${where}),
       per_order AS (
         SELECT order_number, count(DISTINCT wave_number) AS order_waves
           FROM filtered
          GROUP BY order_number)
       SELECT (SELECT count(*) FROM per_order)::int AS orders,
              (SELECT count(DISTINCT wave_number) FROM filtered)::int AS waves,
              (SELECT count(*) FROM filtered)::int AS lines,
              (SELECT coalesce(sum(order_waves), 0) FROM per_order)::int AS pairs,
              (SELECT count(*) FROM per_order WHERE order_waves > 1)::int AS split_orders`,
      params,
    );
    const { orders, waves, lines, pairs, split_orders: splitOrders } = rows[0];
    return {
      source: 'Customer_Order',
      filters,
      orders,
      waves,
      lines,
      waveOrderPairs: pairs,
      splitOrders,
      m3AverageOrdersPerWave: waves > 0 ? pairs / waves : null,
      x2SplitOrdersPercent: orders > 0 ? (splitOrders / orders) * 100 : null,
    };
  }
}
