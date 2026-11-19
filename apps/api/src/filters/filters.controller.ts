import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export interface FilterOptions {
  /** First and last day with a valid order line; null on an empty database. */
  period: { from: string; to: string } | null;
  abcClasses: ['A', 'B', 'C'];
  references: string[];
  customers: string[];
  operators: string[];
  aisles: string[];
}

@Controller('filters')
export class FiltersController {
  constructor(private readonly database: DatabaseService) {}

  /** Values for the filter bar. Not affected by the filters themselves. */
  @Get('options')
  async options(): Promise<FilterOptions> {
    const col = async (sql: string) =>
      (await this.database.query<{ v: string }>(sql)).rows.map((r) => r.v);

    const [period, references, customers, operators, aisles] =
      await Promise.all([
        this.database.query<{ from: string | null; to: string | null }>(
          `SELECT to_char(MIN(created_at), 'YYYY-MM-DD') AS "from",
                  to_char(MAX(created_at), 'YYYY-MM-DD') AS "to"
           FROM customer_order_line WHERE is_valid`,
        ),
        col('SELECT reference AS v FROM product ORDER BY 1'),
        col(
          'SELECT DISTINCT customer AS v FROM customer_order_line ORDER BY 1',
        ),
        col(
          `SELECT v FROM (
             SELECT operator AS v FROM customer_order_line
             UNION SELECT operator FROM picking_wave_pick
           ) o ORDER BY 1`,
        ),
        col(
          `SELECT DISTINCT aisle AS v FROM picking_wave_pick
           WHERE aisle <> '' ORDER BY 1`,
        ),
      ]);

    const p = period.rows[0];
    return {
      period: p?.from && p.to ? { from: p.from, to: p.to } : null,
      abcClasses: ['A', 'B', 'C'],
      references,
      customers,
      operators,
      aisles,
    };
  }
}
