import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { OrderFilters, orderFilterSql } from './filters.js';

export interface SectorShare {
  sector: string;
  units: number;
  lines: number;
  orders: number;
  // M4 for this sector: units / total units, as a percentage 0-100.
  sharePercent: number;
}

export interface SectorIndicators {
  source: 'Product + Customer_Order';
  filters: OrderFilters;
  orders: number;
  lines: number;
  units: number;
  multiSectorOrders: number;
  // M4: one entry per Sector, ordered by sector. Empty when no order matches.
  m4SectorShare: SectorShare[];
  // M5 = orders with more than one distinct Sector / orders, as a percentage
  // 0-100. null when no order matches the filters.
  m5MultiSectorOrdersPercent: number | null;
  // True when at most one sector is present, so M4 and M5 cannot tell
  // anything apart (ADR 0006: today every product is PF). The UI shows the
  // "not informative" badge from this flag.
  notInformative: boolean;
}

@Injectable()
export class SectorService {
  constructor(private readonly database: DatabaseService) {}

  async compute(filters: OrderFilters): Promise<SectorIndicators> {
    // The filters are applied to customer_order_line alone, before the join:
    // orderFilterSql uses unqualified column names and `reference` exists in
    // both tables, so filtering after the join would be ambiguous.
    const { where, params } = orderFilterSql(filters);
    const { rows } = await this.database.query<{
      orders: number;
      lines: number;
      units: number;
      multi_sector_orders: number;
      sectors: {
        sector: string;
        units: number;
        lines: number;
        orders: number;
      }[];
    }>(
      `WITH filtered AS (
         SELECT order_number, reference, quantity
           FROM customer_order_line
          WHERE ${where}),
       joined AS (
         SELECT f.order_number, f.quantity, p.sector
           FROM filtered f
           JOIN product p ON p.reference = f.reference),
       per_order AS (
         SELECT order_number, count(DISTINCT sector) AS order_sectors
           FROM joined
          GROUP BY order_number)
       SELECT (SELECT count(*) FROM per_order)::int AS orders,
              (SELECT count(*) FROM joined)::int AS lines,
              (SELECT coalesce(sum(quantity), 0) FROM joined)::int AS units,
              (SELECT count(*) FROM per_order WHERE order_sectors > 1)::int AS multi_sector_orders,
              coalesce((SELECT json_agg(s ORDER BY s.sector)
                          FROM (SELECT sector,
                                       sum(quantity)::int AS units,
                                       count(*)::int AS lines,
                                       count(DISTINCT order_number)::int AS orders
                                  FROM joined
                                 GROUP BY sector) s), '[]'::json) AS sectors`,
      params,
    );
    const {
      orders,
      lines,
      units,
      multi_sector_orders: multiSectorOrders,
      sectors,
    } = rows[0];
    return {
      source: 'Product + Customer_Order',
      filters,
      orders,
      lines,
      units,
      multiSectorOrders,
      m4SectorShare: sectors.map((s) => ({
        ...s,
        sharePercent: (s.units / units) * 100,
      })),
      m5MultiSectorOrdersPercent:
        orders > 0 ? (multiSectorOrders / orders) * 100 : null,
      notInformative: sectors.length <= 1,
    };
  }
}
