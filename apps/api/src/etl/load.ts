import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import pg from 'pg';
import { SCHEMA_SQL } from './schema.js';
import {
  toOrderLine,
  toPick,
  toProduct,
  type OrderLine,
  type Pick,
  type ProductRow,
  type StorageLocationRow,
  toStorageLocation,
} from './transform.js';

export interface EtlPaths {
  customerOrder: string;
  pickingWave: string;
  product: string;
  /** Storage_Location.csv (`,`-separated). Optional so small test fixtures can skip it. */
  storageLocation?: string;
}

export type EtlSummary = Record<string, number>;

const BATCH = 5000;

/** Streams a CSV with the given separator (BOM stripped) as objects keyed by header. */
async function* readCsv(
  path: string,
  delimiter: string,
): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(path).pipe(
    parse({
      delimiter,
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    }),
  );
  for await (const row of parser) yield row as Record<string, string>;
}

async function insertBatches<T>(
  rows: AsyncIterable<T>,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  let batch: T[] = [];
  let total = 0;
  for await (const r of rows) {
    batch.push(r);
    total++;
    if (batch.length >= BATCH) {
      await flush(batch);
      batch = [];
    }
  }
  if (batch.length) await flush(batch);
  return total;
}

async function* mapRows<T>(
  path: string,
  fn: (row: Record<string, string>) => T,
  delimiter = ';',
): AsyncGenerator<T> {
  let n = 1; // header is line 1
  for await (const row of readCsv(path, delimiter)) {
    n++;
    try {
      yield fn(row);
    } catch (e) {
      throw new Error(`${path} row ${n}: ${(e as Error).message}`);
    }
  }
}

/**
 * Empties and reloads all tables from the three CSVs, in one transaction.
 * The CSV files are only read. Returns the counts that are also stored in
 * `etl_run_summary`.
 */
export async function runEtl(
  pool: pg.Pool,
  paths: EtlPaths,
): Promise<EtlSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA_SQL);

    await insertBatches<ProductRow>(
      mapRows(paths.product, toProduct),
      (b) =>
        client
          .query(
            `INSERT INTO product (reference, abccod, sector)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[])`,
            [
              b.map((r) => r.reference),
              b.map((r) => r.abccod),
              b.map((r) => r.sector),
            ],
          )
          .then(() => undefined),
    );

    await insertBatches<OrderLine>(
      mapRows(paths.customerOrder, toOrderLine),
      (b) =>
        client
          .query(
            `INSERT INTO customer_order_line
               (customer, order_number, order_to_collect, reference, size,
                quantity, created_at, wave_number, operator, is_valid)
             SELECT c, o, oc, r, s, q, d::timestamp, w, op, q > 0
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                         $5::text[], $6::int[], $7::text[], $8::text[],
                         $9::text[])
               AS t(c, o, oc, r, s, q, d, w, op)`,
            [
              b.map((r) => r.customer),
              b.map((r) => r.orderNumber),
              b.map((r) => r.orderToCollect),
              b.map((r) => r.reference),
              b.map((r) => r.size),
              b.map((r) => r.quantity),
              b.map((r) => r.createdAt),
              b.map((r) => r.waveNumber),
              b.map((r) => r.operator),
            ],
          )
          .then(() => undefined),
    );

    // Flag repeats: every row after the first one identical in all columns
    // (this gives the 2,559 of the data profile). Rows are kept; the API
    // toggle decides whether to count them (ADR 0003).
    await client.query(`
      UPDATE customer_order_line l SET is_duplicate = true
      FROM (
        SELECT id, row_number() OVER (
          PARTITION BY customer, order_number, order_to_collect, reference,
                       size, quantity, created_at, wave_number, operator
          ORDER BY id
        ) AS rn
        FROM customer_order_line
      ) d
      WHERE l.id = d.id AND d.rn > 1`);

    await insertBatches<Pick>(
      mapRows(paths.pickingWave, toPick),
      (b) =>
        client
          .query(
            `INSERT INTO picking_wave_pick
               (wave_number, reference, size, quantity, location, aisle, operator)
             SELECT * FROM unnest($1::text[], $2::text[], $3::text[],
                                  $4::int[], $5::text[], $6::text[], $7::text[])`,
            [
              b.map((r) => r.waveNumber),
              b.map((r) => r.reference),
              b.map((r) => r.size),
              b.map((r) => r.quantity),
              b.map((r) => r.location),
              b.map((r) => r.aisle),
              b.map((r) => r.operator),
            ],
          )
          .then(() => undefined),
    );

    if (paths.storageLocation) {
      await insertBatches<StorageLocationRow>(
        mapRows(paths.storageLocation, toStorageLocation, ','),
        (b) =>
          client
            .query(
              `INSERT INTO storage_location (location, x, y, z)
               SELECT * FROM unnest($1::text[], $2::numeric[], $3::numeric[], $4::int[])`,
              [
                b.map((r) => r.location),
                b.map((r) => r.x),
                b.map((r) => r.y),
                b.map((r) => r.z),
              ],
            )
            .then(() => undefined),
      );
    }

    await client.query(`
      INSERT INTO etl_run_summary (metric, value)
      SELECT * FROM (VALUES
        ('product_rows', (SELECT count(*) FROM product)),
        ('customer_order_rows', (SELECT count(*) FROM customer_order_line)),
        ('customer_order_excluded_quantity_0',
           (SELECT count(*) FROM customer_order_line WHERE NOT is_valid)),
        ('customer_order_blank_size_unknown',
           (SELECT count(*) FROM customer_order_line WHERE size = 'unknown')),
        ('customer_order_exact_duplicates_flagged',
           (SELECT count(*) FROM customer_order_line WHERE is_duplicate)),
        ('customer_order_valid_rows',
           (SELECT count(*) FROM customer_order_line WHERE is_valid)),
        ('orders_before_exclusion',
           (SELECT count(DISTINCT order_number) FROM customer_order_line)),
        ('orders_after_exclusion',
           (SELECT count(DISTINCT order_number) FROM customer_order_line WHERE is_valid)),
        ('customer_order_units',
           (SELECT coalesce(sum(quantity), 0) FROM customer_order_line)),
        ('picking_wave_rows', (SELECT count(*) FROM picking_wave_pick)),
        ('picking_wave_units',
           (SELECT coalesce(sum(quantity), 0) FROM picking_wave_pick)),
        ('storage_location_rows', (SELECT count(*) FROM storage_location)),
        ('picks_with_coordinates',
           (SELECT count(*) FROM picking_wave_pick p
             WHERE EXISTS (SELECT 1 FROM storage_location s WHERE s.location = p.location))),
        ('picks_without_coordinates',
           (SELECT count(*) FROM picking_wave_pick p
             WHERE NOT EXISTS (SELECT 1 FROM storage_location s WHERE s.location = p.location)))
      ) AS v(metric, value)`);

    const { rows } = await client.query<{ metric: string; value: string }>(
      'SELECT metric, value FROM etl_run_summary ORDER BY metric',
    );
    await client.query('COMMIT');
    return Object.fromEntries(rows.map((r) => [r.metric, Number(r.value)]));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
