import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import type { AbcBasis } from './abc.js';

export interface SizeRow {
  size: string;
  lines: number;
  units: number;
  /** Share of this reference on the active basis, 0-100. */
  sharePercent: number;
}

export interface AbcSizesResult {
  source: 'Customer_Order';
  reference: string;
  basis: AbcBasis;
  filters: FilterReport;
  lines: number;
  units: number;
  /** Sizes of the reference, largest on the active basis first. */
  sizes: SizeRow[];
}

/** Last drill-down level of the Products page: the sizes of one reference. */
@Injectable()
export class AbcSizesService {
  constructor(private readonly database: DatabaseService) {}

  async compute(filters: Filters, basis: AbcBasis): Promise<AbcSizesResult> {
    if (!filters.reference) {
      throw new BadRequestException('reference is required');
    }
    // The class never narrows one reference: it is the caller's drill-down
    // step, so abcClass is not passed on as `abcReferences`.
    const where = buildWhere(filters, 'customer_order');
    const { rows } = await this.database.query<{
      size: string;
      lines: number;
      units: number;
    }>(
      `SELECT size, count(*)::int AS lines, sum(quantity)::int AS units
         FROM customer_order_line ${where.sql}
        GROUP BY size
        ORDER BY ${basis} DESC, size ASC`,
      where.params,
    );
    const lines = rows.reduce((s, r) => s + r.lines, 0);
    const units = rows.reduce((s, r) => s + r.units, 0);
    const total = basis === 'lines' ? lines : units;
    return {
      source: 'Customer_Order',
      reference: filters.reference,
      basis,
      filters: describeFilters(filters, 'customer_order'),
      lines,
      units,
      sizes: rows.map((r) => ({
        ...r,
        sharePercent: total > 0 ? (r[basis] / total) * 100 : 0,
      })),
    };
  }
}
