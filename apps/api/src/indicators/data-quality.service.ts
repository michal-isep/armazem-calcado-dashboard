import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export interface DataQuality {
  // Whole files, not affected by the filters: these are facts about the load.
  customerOrder: {
    rows: number;
    // Quantity 0 (spec rule 3): kept in the table, excluded from indicators.
    excludedQuantityZero: number;
    blankSizeUnknown: number;
    // Every repeat after the first row identical in all columns (rule 5).
    exactDuplicates: number;
  };
  pickingWave: { rows: number; units: number };
  // The two files do not reconcile and are not reconciled (ADR 0004).
  sourceDisagreement: {
    wavesInOrders: number;
    wavesInPicking: number;
    wavesMissingFromPicking: number;
    orderUnits: number;
    pickUnits: number;
    unitsDifference: number;
  };
}

@Injectable()
export class DataQualityService {
  constructor(private readonly database: DatabaseService) {}

  async compute(): Promise<DataQuality> {
    const { rows } = await this.database.query<Record<string, number>>(
      `WITH order_waves AS (
         SELECT DISTINCT wave_number FROM customer_order_line WHERE is_valid),
       pick_waves AS (SELECT DISTINCT wave_number FROM picking_wave_pick)
       SELECT
         (SELECT count(*) FROM customer_order_line)::int AS order_rows,
         (SELECT count(*) FROM customer_order_line WHERE NOT is_valid)::int AS excluded,
         (SELECT count(*) FROM customer_order_line WHERE size = 'unknown')::int AS blank_size,
         (SELECT count(*) FROM customer_order_line WHERE is_duplicate)::int AS duplicates,
         (SELECT count(*) FROM picking_wave_pick)::int AS pick_rows,
         (SELECT coalesce(sum(quantity), 0) FROM picking_wave_pick)::int AS pick_units,
         (SELECT coalesce(sum(quantity), 0) FROM customer_order_line WHERE is_valid)::int AS order_units,
         (SELECT count(*) FROM order_waves)::int AS order_wave_count,
         (SELECT count(*) FROM pick_waves)::int AS pick_wave_count,
         (SELECT count(*) FROM order_waves
           WHERE wave_number NOT IN (SELECT wave_number FROM pick_waves))::int AS missing_waves`,
    );
    const r = rows[0];
    return {
      customerOrder: {
        rows: r.order_rows,
        excludedQuantityZero: r.excluded,
        blankSizeUnknown: r.blank_size,
        exactDuplicates: r.duplicates,
      },
      pickingWave: { rows: r.pick_rows, units: r.pick_units },
      sourceDisagreement: {
        wavesInOrders: r.order_wave_count,
        wavesInPicking: r.pick_wave_count,
        wavesMissingFromPicking: r.missing_waves,
        orderUnits: r.order_units,
        pickUnits: r.pick_units,
        unitsDifference: r.order_units - r.pick_units,
      },
    };
  }
}
