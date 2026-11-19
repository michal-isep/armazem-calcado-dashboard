import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { DatabaseService } from './../src/database.service.js';
import { runEtl } from '../src/etl/load.js';
import {
  buildWhere,
  parseFilters,
  type Source,
} from '../src/filters/filters.js';

// Loads the ETL, which wipes the tables, so it only runs against a database
// named explicitly in TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Filters (fixture)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'filters-fixture-'));
    const co =
      '﻿codCustomer;orderNumber;orderToCollect;Reference;Size (US);quantity (units);creationDate;waveNumber;operator\r\n' +
      'C1   ;O1;1;A;9;3;05/01/2023 08:00;W1;Op1\r\n' +
      'C1   ;O1;2;B;10;2;05/01/2023 08:00;W1;Op1\r\n' +
      'C2   ;O2;1;A;9;1;05/01/2023 09:00;W1;Op1\r\n' +
      'C2   ;O2;1;A;9;1;05/01/2023 09:00;W1;Op1\r\n' + // exact duplicate
      'C3   ;O3;1;C;9;4;06/02/2023 10:30;W2;Op2\r\n' +
      'C3   ;O3;2;D;9;0;06/02/2023 10:30;W2;Op2\r\n'; // quantity 0
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      'W1;A;9.0;4;H-06-13     ;Op1\r\n' +
      'W1;B;10.0;2;K-01-01     ;Op1\r\n' +
      'W2;C;9.0;4;ZN-COR     ;Op2\r\n';
    const pr =
      'Reference;ABCCOD;Sector\r\nA;A;PF      \r\nB;B;PF      \r\nC;C;PF      \r\nD;C;PF      \r\n';
    writeFileSync(join(dir, 'co.csv'), co);
    writeFileSync(join(dir, 'pw.csv'), pw);
    writeFileSync(join(dir, 'pr.csv'), pr);
    await runEtl(pool, {
      customerOrder: join(dir, 'co.csv'),
      pickingWave: join(dir, 'pw.csv'),
      product: join(dir, 'pr.csv'),
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        query: async (text: string, params: unknown[] = []) =>
          (await pool.query(text, params)).rows,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function count(table: string, source: Source, query: object) {
    const w = buildWhere(parseFilters(query), source);
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM ${table} ${w.sql}`,
      w.params,
    );
    return r.rows[0].n as number;
  }
  const lines = (q: object) =>
    count('customer_order_line', 'customer_order', q);
  const picks = (q: object) => count('picking_wave_pick', 'picking_wave', q);

  it('GET /filters/options returns the filter bar values', async () => {
    const res = await request(app.getHttpServer())
      .get('/filters/options')
      .expect(200);
    expect(res.body).toEqual({
      period: { from: '2023-01-05', to: '2023-02-06' },
      abcClasses: ['A', 'B', 'C'],
      references: ['A', 'B', 'C', 'D'],
      customers: ['C1', 'C2', 'C3'],
      operators: ['Op1', 'Op2'],
      aisles: ['H', 'K', 'Z'],
    });
  });

  it('keeps duplicates by default and drops them with the toggle', async () => {
    expect(await lines({})).toBe(5); // 6 rows - quantity 0
    expect(await lines({ excludeDuplicates: 'false' })).toBe(5);
    expect(await lines({ excludeDuplicates: 'true' })).toBe(4);
  });

  it('filters order lines by date, reference, customer and operator', async () => {
    expect(await lines({ from: '2023-02-06' })).toBe(1);
    expect(await lines({ to: '2023-01-05' })).toBe(4);
    expect(await lines({ from: '2023-01-05', to: '2023-02-06' })).toBe(5);
    expect(await lines({ reference: 'A' })).toBe(3);
    expect(await lines({ customer: 'C3' })).toBe(1);
    expect(await lines({ operator: 'Op2' })).toBe(1);
    expect(await lines({ aisle: 'H' })).toBe(5); // not applied
  });

  it('filters picks by aisle, reference, operator and wave date', async () => {
    expect(await picks({})).toBe(3);
    expect(await picks({ aisle: 'H' })).toBe(1);
    expect(await picks({ aisle: 'z' })).toBe(1);
    expect(await picks({ reference: 'B' })).toBe(1);
    expect(await picks({ operator: 'Op2' })).toBe(1);
    expect(await picks({ to: '2023-01-31' })).toBe(2); // wave W1
    expect(await picks({ from: '2023-02-01' })).toBe(1); // wave W2
    expect(await picks({ customer: 'C3' })).toBe(3); // not applied
    expect(await picks({ excludeDuplicates: 'true' })).toBe(3); // not applied
  });
});
