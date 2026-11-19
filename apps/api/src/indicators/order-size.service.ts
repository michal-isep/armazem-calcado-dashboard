import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { AbcService, type AbcParams } from '../abc/abc.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';

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
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  async compute(
    filters: Filters,
    abcParams: AbcParams,
  ): Promise<OrderSizeIndicators> {
    const abcReferences = await this.abc.referencesInClass(filters, abcParams);
    const { sql, params } = buildWhere(filters, 'customer_order', {
      abcReferences,
    });
    const { rows } = await this.database.query<{
      orders: number;
      lines: number;
      units: number;
    }>(
      `SELECT count(DISTINCT order_number)::int AS orders,
              count(*)::int AS lines,
              coalesce(sum(quantity), 0)::int AS units
         FROM customer_order_line
       ${sql}`,
      params,
    );
    const { orders, lines, units } = rows[0];
    return {
      source: 'Customer_Order',
      filters: describeFilters(filters, 'customer_order'),
      orders,
      lines,
      units,
      m2AverageOrderSize: orders > 0 ? units / orders : null,
      x1LinesPerOrder: orders > 0 ? lines / orders : null,
    };
  }
}
