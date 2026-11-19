import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  buildWhere,
  describeFilters,
  type AbcClass,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import {
  classify,
  type AbcBasis,
  type AbcRow,
  type AbcThresholds,
} from './abc.js';

export interface AbcClassSummary {
  abcClass: AbcClass;
  references: number;
  lines: number;
  units: number;
  /** Share of the active basis over all ranked references, 0-100. */
  sharePercent: number;
}

export interface AbcResult {
  source: 'Customer_Order';
  basis: AbcBasis;
  thresholds: AbcThresholds;
  filters: FilterReport;
  /** Everything ABC was computed on: the date range only (ADR 0002). */
  ranked: { references: number; lines: number; units: number };
  /** One entry per class, over the selected references. */
  classes: AbcClassSummary[];
  /**
   * The selected references, in rank order. Their class and cumulative share
   * come from the full ranking, whatever the reference, ABC class, customer
   * or operator filter selects.
   */
  references: AbcRow[];
}

@Injectable()
export class AbcService {
  constructor(private readonly database: DatabaseService) {}

  async compute(
    filters: Filters,
    basis: AbcBasis,
    thresholds: AbcThresholds,
  ): Promise<AbcResult> {
    // ABC sees the date range only; the other filters select afterwards.
    const base = buildWhere(filters, 'customer_order', { scope: 'dateOnly' });
    const { rows } = await this.database.query<{
      reference: string;
      lines: number;
      units: number;
    }>(
      `SELECT reference, count(*)::int AS lines, sum(quantity)::int AS units
         FROM customer_order_line ${base.sql}
        GROUP BY reference`,
      base.params,
    );
    const ranking = classify(rows, basis, thresholds);

    let selected = ranking;
    if (filters.reference || filters.customer || filters.operator) {
      const sel = buildWhere(filters, 'customer_order');
      const { rows: refs } = await this.database.query<{ reference: string }>(
        `SELECT DISTINCT reference FROM customer_order_line ${sel.sql}`,
        sel.params,
      );
      const keep = new Set(refs.map((r) => r.reference));
      selected = selected.filter((r) => keep.has(r.reference));
    }
    if (filters.abcClass) {
      selected = selected.filter((r) => r.abcClass === filters.abcClass);
    }

    const total = ranking.reduce((sum, r) => sum + r[basis], 0);
    const classes = (['A', 'B', 'C'] as const).map((abcClass) => {
      const own = selected.filter((r) => r.abcClass === abcClass);
      const sum = (key: 'lines' | 'units') =>
        own.reduce((s, r) => s + r[key], 0);
      return {
        abcClass,
        references: own.length,
        lines: sum('lines'),
        units: sum('units'),
        sharePercent: total > 0 ? (sum(basis) / total) * 100 : 0,
      };
    });

    return {
      source: 'Customer_Order',
      basis,
      thresholds,
      filters: describeFilters(filters, 'customer_order'),
      ranked: {
        references: ranking.length,
        lines: ranking.reduce((s, r) => s + r.lines, 0),
        units: ranking.reduce((s, r) => s + r.units, 0),
      },
      classes,
      references: selected,
    };
  }
}
