import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import type { AbcBasis, AbcThresholds } from './abc.js';
import {
  ABCCOD_NOTE,
  NOT_RANKED_NOTE,
  compareAbc,
  summarise,
  type ComparisonRow,
  type ComparisonSummary,
} from './abc-comparison.js';
import { AbcService, type AbcParams } from './abc.service.js';

export interface AbcComparisonResult {
  source: 'Customer_Order + Product';
  basis: AbcBasis;
  thresholds: AbcThresholds;
  /** The UI shows this: where Product.ABCCOD comes from is unknown. */
  abccodNote: string;
  /** How products with no order line in the range are treated. */
  notRankedNote: string;
  filters: FilterReport;
  summary: ComparisonSummary;
  references: ComparisonRow[];
}

@Injectable()
export class AbcComparisonService {
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  async compute(
    filters: Filters,
    params: AbcParams,
  ): Promise<AbcComparisonResult> {
    // The computed class comes from the date range only (ADR 0002). Reference,
    // ABC class, customer and operator only select which products are listed.
    const ranking = await this.abc.rank(filters, params);

    const { rows: products } = await this.database.query<{
      reference: string;
      abccod: string;
    }>('SELECT reference, abccod FROM product');

    let rows = compareAbc(products, ranking);

    if (filters.reference) {
      rows = rows.filter((r) => r.reference === filters.reference);
    }
    if (filters.customer || filters.operator) {
      // Only products with an order line from that customer or operator in
      // the date range can be selected.
      const sel = buildWhere(filters, 'customer_order');
      const { rows: refs } = await this.database.query<{ reference: string }>(
        `SELECT DISTINCT reference FROM customer_order_line ${sel.sql}`,
        sel.params,
      );
      const keep = new Set(refs.map((r) => r.reference));
      rows = rows.filter((r) => keep.has(r.reference));
    }
    if (filters.abcClass) {
      rows = rows.filter((r) => r.computedClass === filters.abcClass);
    }

    return {
      source: 'Customer_Order + Product',
      basis: params.basis,
      thresholds: params.thresholds,
      abccodNote: ABCCOD_NOTE,
      notRankedNote: NOT_RANKED_NOTE,
      filters: describeFilters(filters, 'customer_order'),
      summary: summarise(rows),
      references: rows,
    };
  }
}
