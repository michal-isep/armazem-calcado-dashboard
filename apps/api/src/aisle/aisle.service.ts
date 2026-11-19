import { Injectable } from '@nestjs/common';
import { AbcService } from '../abc/abc.service.js';
import type { AbcBasis, AbcThresholds } from '../abc/abc.js';
import { DatabaseService } from '../database.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import {
  COVERAGE_NOTE,
  PROXY_LABEL,
  summarisePicks,
  type AislePicks,
  type PickRow,
} from './aisle.js';

export interface AisleResult extends AislePicks {
  source: 'Picking_Wave';
  /** Aisle is a proxy for where the work happens, never Sector (ADR 0006). */
  label: typeof PROXY_LABEL;
  /** Permanent note: the picking file covers about 94% of ordered units. */
  coverageNote: string;
  /** How the classes were computed (the same ABC as M1, date range only). */
  abc: { basis: AbcBasis; thresholds: AbcThresholds };
  filters: FilterReport;
}

@Injectable()
export class AisleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  async compute(
    filters: Filters,
    basis: AbcBasis,
    thresholds: AbcThresholds,
  ): Promise<AisleResult> {
    // The class comes from the date range only (ADR 0002): reference, customer,
    // operator, aisle and abcClass select picks, they never change a class.
    const ranking = await this.abc.rank(
      {
        from: filters.from,
        to: filters.to,
        excludeDuplicates: filters.excludeDuplicates,
      },
      { basis, thresholds },
    );
    const classOf = new Map(ranking.map((r) => [r.reference, r.abcClass]));

    // Picks selected by wave start, reference, operator and aisle.
    const where = buildWhere(filters, 'picking_wave');
    const { rows } = await this.database.query<PickRow>(
      `SELECT aisle, reference, count(*)::int AS picks,
              coalesce(sum(quantity), 0)::int AS units
         FROM picking_wave_pick ${where.sql}
        GROUP BY aisle, reference`,
      where.params,
    );

    return {
      source: 'Picking_Wave',
      label: PROXY_LABEL,
      coverageNote: COVERAGE_NOTE,
      abc: { basis, thresholds },
      filters: describeFilters(filters, 'picking_wave'),
      ...summarisePicks(rows, classOf, filters.abcClass),
    };
  }
}
