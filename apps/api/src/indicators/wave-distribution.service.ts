import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { AbcService, type AbcParams } from '../abc/abc.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import {
  summariseDistribution,
  type CountRow,
  type WaveDistribution,
} from './wave-distribution.js';

export interface WaveDistributionResult extends WaveDistribution {
  source: 'Customer_Order';
  filters: FilterReport;
}

@Injectable()
export class WaveDistributionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  async compute(
    filters: Filters,
    abcParams: AbcParams,
  ): Promise<WaveDistributionResult> {
    const abcReferences = await this.abc.referencesInClass(filters, abcParams);
    const { sql, params } = buildWhere(filters, 'customer_order', {
      abcReferences,
    });
    const { rows } = await this.database.query<{
      kind: 'wave' | 'order' | 'units';
      size: number;
      count: number;
    }>(
      `WITH filtered AS (
         SELECT order_number, wave_number, quantity
           FROM customer_order_line
          ${sql}),
       per_wave AS (
         SELECT count(DISTINCT order_number)::int AS size
           FROM filtered GROUP BY wave_number),
       per_order AS (
         SELECT count(DISTINCT wave_number)::int AS size
           FROM filtered GROUP BY order_number),
       per_units AS (
         SELECT sum(quantity)::int AS size
           FROM filtered GROUP BY wave_number)
       SELECT 'wave' AS kind, size, count(*)::int AS count
         FROM per_wave GROUP BY size
       UNION ALL
       SELECT 'order' AS kind, size, count(*)::int AS count
         FROM per_order GROUP BY size
       UNION ALL
       SELECT 'units' AS kind, size, count(*)::int AS count
         FROM per_units GROUP BY size`,
      params,
    );
    const pick = (kind: string): CountRow[] =>
      rows
        .filter((r) => r.kind === kind)
        .map((r) => ({ size: r.size, count: r.count }));

    return {
      source: 'Customer_Order',
      filters: describeFilters(filters, 'customer_order'),
      ...summariseDistribution(pick('wave'), pick('order'), pick('units')),
    };
  }
}
