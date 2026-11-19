import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  OrderFilters,
  describeOrderFilters,
  orderFilterSql,
} from './filters.js';
import type { FilterReport } from '../filters/filters.js';

export interface OrderSizeIndicators {
  source: 'Customer_Order';
  filters: FilterReport;
  orders: number;
  lines: number;
  units: number;
  // M2 = units / distinct orders; X1 = lines / distinct orders.
  // null when no order matches the filters.
  m2AverageOrderSize: number | null;
  x1LinesPerOrder: number | null;
}

@Injectable()
export class OrderSizeService {
  constructor(private readonly database: DatabaseService) {}

  async compute(filters: OrderFilters): Promise<OrderSizeIndicators> {
    const { where, params } = orderFilterSql(filters);
    const { rows } = await this.database.query<{
      orders: number;
      lines: number;
      units: number;
    }>(
      `SELECT count(DISTINCT order_number)::int AS orders,
              count(*)::int AS lines,
              coalesce(sum(quantity), 0)::int AS units
         FROM customer_order_line
        WHERE ${where}`,
      params,
    );
    const { orders, lines, units } = rows[0];
    return {
      source: 'Customer_Order',
      filters: describeOrderFilters(filters),
      orders,
      lines,
      units,
      m2AverageOrderSize: orders > 0 ? units / orders : null,
      x1LinesPerOrder: orders > 0 ? lines / orders : null,
    };
  }
}
