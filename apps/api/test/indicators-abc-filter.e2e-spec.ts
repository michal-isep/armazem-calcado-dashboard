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

// Loads the ETL, which wipes the tables, so it only runs against a database
// named explicitly in TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

// Spec fixture 2 (lines basis, 80/95): P 8 lines, Q 6, R 3, S 2, T 1 are
// classes A, A, A, B, C. Every line is its own order; P has one more line in
// February. T is the only reference of customer C2.
describe.skipIf(!url)('abcClass filter on the indicator endpoints', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    const counts: [string, number][] = [
      ['P', 8],
      ['Q', 6],
      ['R', 3],
      ['S', 2],
      ['T', 1],
    ];
    let n = 0;
    let co =
      '﻿codCustomer;orderNumber;orderToCollect;Reference;Size (US);quantity (units);creationDate;waveNumber;operator\r\n';
    for (const [ref, lines] of counts) {
      for (let i = 0; i < lines; i++) {
        n++;
        const customer = ref === 'T' ? 'C2' : 'C1';
        co += `${customer}   ;O${n};1;${ref};9;2;05/01/2023 08:00;W1;Op1\r\n`;
      }
    }
    co += 'C1   ;O101;1;P;9;2;10/02/2023 08:00;W2;Op1\r\n';
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      'W1;P;9.0;1;H-06-13     ;Op1\r\n';
    const pr =
      'Reference;ABCCOD;Sector\r\n' +
      ['P', 'Q', 'R', 'S', 'T'].map((r) => `${r};A;PF      \r\n`).join('');
    const dir = mkdtempSync(join(tmpdir(), 'abc-filter-'));
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
          pool.query(text, params),
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const get = (path: string, query: object) =>
    request(app.getHttpServer()).get(`/indicators/${path}`).query(query);
  const january = { from: '2023-01-05', to: '2023-01-31' };

  it('order-size: class A is P, Q and R; class C is T', async () => {
    const a = await get('order-size', { ...january, abcClass: 'A' }).expect(
      200,
    );
    expect(a.body).toMatchObject({
      orders: 17,
      lines: 17,
      units: 34,
      m2AverageOrderSize: 2,
      x1LinesPerOrder: 1,
    });
    expect(a.body.filters.applied).toContain('abcClass');
    const c = await get('order-size', { ...january, abcClass: 'C' }).expect(
      200,
    );
    expect(c.body).toMatchObject({ orders: 1, lines: 1, units: 2 });
  });

  it('the class does not change when reference is also set (scoping)', async () => {
    // T is class C on the whole range, so class A with reference T is empty.
    const none = await get('order-size', {
      ...january,
      abcClass: 'A',
      reference: 'T',
    }).expect(200);
    expect(none.body).toMatchObject({ orders: 0, m2AverageOrderSize: null });
    const some = await get('order-size', {
      ...january,
      abcClass: 'C',
      reference: 'T',
    }).expect(200);
    expect(some.body.orders).toBe(1);
  });

  it('wave-split: class A lines are all in wave W1', async () => {
    const res = await get('wave-split', { ...january, abcClass: 'A' }).expect(
      200,
    );
    expect(res.body).toMatchObject({
      orders: 17,
      waves: 1,
      waveOrderPairs: 17,
      m3AverageOrdersPerWave: 17,
      x2SplitOrdersPercent: 0,
    });
  });

  it('sector: class B is S, 100% PF and not informative', async () => {
    const res = await get('sector', { ...january, abcClass: 'B' }).expect(200);
    expect(res.body).toMatchObject({
      orders: 2,
      lines: 2,
      units: 4,
      notInformative: true,
    });
    expect(res.body.m4SectorShare).toHaveLength(1);
  });

  it('monthly-trend: class C months and comparison use the same class', async () => {
    const res = await get('monthly-trend', { abcClass: 'C' }).expect(200);
    expect(
      res.body.months.map((m: { month: string; orders: number }) => [
        m.month,
        m.orders,
      ]),
    ).toEqual([
      ['2023-01', 1],
      ['2023-02', 0],
    ]);
    expect(res.body.current.orders).toBe(1);
  });

  it('no abcClass leaves the indicators unchanged', async () => {
    const res = await get('order-size', january).expect(200);
    expect(res.body).toMatchObject({ orders: 20, lines: 20, units: 40 });
  });

  it('takes the ABC basis and thresholds of the M1 endpoint', async () => {
    // 40/70 on lines: P is A, Q is B, R, S and T are C.
    const res = await get('order-size', {
      ...january,
      abcClass: 'B',
      thresholdA: '40',
      thresholdB: '70',
    }).expect(200);
    expect(res.body.lines).toBe(6);
    await get('order-size', { basis: 'orders' }).expect(400);
    await get('order-size', { abcClass: 'D' }).expect(400);
  });
});
