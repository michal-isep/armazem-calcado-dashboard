import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { runEtl } from '../src/etl/load.js';

// The ETL drops and recreates tables, so it only runs against a database
// named explicitly in TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('ETL (fixture from spec section 8)', () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(() => pool.end());

  function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'etl-fixture-'));
    const co =
      '﻿codCustomer;orderNumber;orderToCollect;Reference;Size (US);quantity (units);creationDate;waveNumber;operator\r\n' +
      'C1   ;O1;1;A;9;3;05/01/2023 08:00;W1;Op1\r\n' +
      'C1   ;O1;2;B;10;2;05/01/2023 08:00;W1;Op1\r\n' +
      'C2   ;O2;1;A;9;1;05/01/2023 09:00;W1;Op1\r\n' +
      'C2   ;O2;1;A;9;1;05/01/2023 09:00;W1;Op1\r\n' + // exact duplicate
      'C3   ;O3;1;C;;4;06/01/2023 10:30;W2;Op2\r\n' + // blank size
      'C3   ;O3;2;D;9;0;06/01/2023 10:30;W2;Op2\r\n'; // quantity 0
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      'W1;A;9.0;4;H-06-13     ;Op1\r\n' +
      'W2;C;9.0;4;ZN-COR     ;Op2\r\n';
    const pr = 'Reference;ABCCOD;Sector\r\nA;A;PF      \r\nB;B;PF      \r\n';
    writeFileSync(join(dir, 'co.csv'), co);
    writeFileSync(join(dir, 'pw.csv'), pw);
    const sl =
      '﻿originalLocation,position,x,y,z\r\n' +
      'H-06-13,"100, 20, 2",100,20,2\r\n';
    writeFileSync(join(dir, 'pr.csv'), pr);
    writeFileSync(join(dir, 'sl.csv'), sl);
    return {
      customerOrder: join(dir, 'co.csv'),
      pickingWave: join(dir, 'pw.csv'),
      product: join(dir, 'pr.csv'),
      storageLocation: join(dir, 'sl.csv'),
    };
  }

  it('applies the data rules and reports counts', async () => {
    const s = await runEtl(pool, fixture());
    expect(s.customer_order_rows).toBe(6);
    expect(s.customer_order_excluded_quantity_0).toBe(1);
    expect(s.customer_order_blank_size_unknown).toBe(1);
    expect(s.customer_order_exact_duplicates_flagged).toBe(1);
    expect(s.orders_before_exclusion).toBe(3);
    expect(s.orders_after_exclusion).toBe(3);
    expect(s.picking_wave_rows).toBe(2);
    expect(s.product_rows).toBe(2);
    expect(s.storage_location_rows).toBe(1);
    expect(s.picks_with_coordinates).toBe(1); // H-06-13
    expect(s.picks_without_coordinates).toBe(1); // ZN-COR

    const { rows } = await pool.query(
      `SELECT sum(quantity)::int AS units FROM customer_order_line WHERE is_valid`,
    );
    expect(rows[0].units).toBe(11); // duplicate kept
    const aisles = await pool.query(
      'SELECT aisle FROM picking_wave_pick ORDER BY id',
    );
    expect(aisles.rows.map((r) => r.aisle)).toEqual(['H', 'Z']);
  });

  it('is re-runnable with the same result', async () => {
    const a = await runEtl(pool, fixture());
    const b = await runEtl(pool, fixture());
    expect(b).toEqual(a);
  });
});
