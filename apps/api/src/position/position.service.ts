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
  POSITION_LABEL,
  POSITION_NOTE,
  summariseCoverage,
  summarisePosition,
  Y_BAND_COUNT,
  Y_BAND_SIZE,
  type CoverageRow,
  type LocationCoverage,
  type PositionRow,
  type ShelfPosition,
} from './position.js';

export interface ShelfPositionResult extends ShelfPosition {
  source: 'Picking_Wave + Storage_Location';
  /** A proxy for where picks happen in the layout, never a distance (ADR 0010). */
  label: typeof POSITION_LABEL;
  note: string;
  /** Picks without coordinates are left out here and counted by X8. */
  picksWithoutCoordinatesLeftOut: number;
  /** How the classes were computed (the same ABC as M1, date range only). */
  abc: { basis: AbcBasis; thresholds: AbcThresholds };
  filters: FilterReport;
}

export interface LocationCoverageResult extends LocationCoverage {
  source: 'Picking_Wave + Storage_Location';
  note: string;
  filters: FilterReport;
}

@Injectable()
export class PositionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  async shelfPosition(
    filters: Filters,
    basis: AbcBasis,
    thresholds: AbcThresholds,
  ): Promise<ShelfPositionResult> {
    // The class comes from the date range only (ADR 0002).
    const ranking = await this.abc.rank(
      {
        from: filters.from,
        to: filters.to,
        excludeDuplicates: filters.excludeDuplicates,
      },
      { basis, thresholds },
    );
    const classOf = new Map(ranking.map((r) => [r.reference, r.abcClass]));

    const where = buildWhere(filters, 'picking_wave');
    const { rows } = await this.database.query<PositionRow>(
      `SELECT least(floor(s.y / ${Y_BAND_SIZE}), ${Y_BAND_COUNT - 1})::int AS band,
              s.z AS level, p.reference,
              count(*)::int AS picks,
              coalesce(sum(p.quantity), 0)::int AS units
         FROM (SELECT * FROM picking_wave_pick ${where.sql}) p
         JOIN storage_location s ON s.location = p.location
        GROUP BY 1, 2, 3`,
      where.params,
    );
    // Picks left out for lack of coordinates, counted for the same class
    // selection as the picks shown.
    const left = await this.database.query<{ reference: string; n: number }>(
      `SELECT p.reference, count(*)::int AS n
         FROM (SELECT * FROM picking_wave_pick ${where.sql}) p
        WHERE NOT EXISTS (SELECT 1 FROM storage_location s WHERE s.location = p.location)
        GROUP BY p.reference`,
      where.params,
    );
    const leftOut = left.rows
      .filter(
        (r) =>
          !filters.abcClass || classOf.get(r.reference) === filters.abcClass,
      )
      .reduce((sum, r) => sum + r.n, 0);

    return {
      source: 'Picking_Wave + Storage_Location',
      label: POSITION_LABEL,
      note: POSITION_NOTE,
      picksWithoutCoordinatesLeftOut: leftOut,
      abc: { basis, thresholds },
      filters: describeFilters(filters, 'picking_wave'),
      ...summarisePosition(rows, classOf, filters.abcClass),
    };
  }

  async locationCoverage(
    filters: Filters,
    basis: AbcBasis,
    thresholds: AbcThresholds,
  ): Promise<LocationCoverageResult> {
    const ranking = await this.abc.rank(
      {
        from: filters.from,
        to: filters.to,
        excludeDuplicates: filters.excludeDuplicates,
      },
      { basis, thresholds },
    );
    const classOf = new Map(ranking.map((r) => [r.reference, r.abcClass]));
    const where = buildWhere(filters, 'picking_wave');
    const { rows } = await this.database.query<CoverageRow>(
      `SELECT p.aisle, p.location, p.reference,
              (s.location IS NOT NULL) AS "hasCoordinates",
              count(*)::int AS picks,
              coalesce(sum(p.quantity), 0)::int AS units
         FROM (SELECT * FROM picking_wave_pick ${where.sql}) p
         LEFT JOIN storage_location s ON s.location = p.location
        GROUP BY p.aisle, p.location, p.reference, 4`,
      where.params,
    );
    return {
      source: 'Picking_Wave + Storage_Location',
      note: COVERAGE_NOTE,
      filters: describeFilters(filters, 'picking_wave'),
      ...summariseCoverage(rows, classOf, filters.abcClass),
    };
  }
}
