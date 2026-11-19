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

describe.skipIf(!url)('M1 ABC (spec fixture 2)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Spec fixture 2: P 8 lines, Q 6, R 3, S 2, T 1, V one quantity-0 line.
    // Every line is its own order. P also has a line in February, outside the
    // January range used by most tests. Customers: T is ordered by C2 only.
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
        const operator = ref === 'T' ? 'Op2' : 'Op1';
        co += `${customer}   ;O${n};1;${ref};9;1;05/01/2023 08:00;W1;${operator}\r\n`;
      }
    }
    co += 'C1   ;O100;1;V;9;0;05/01/2023 08:00;W1;Op1\r\n'; // quantity 0
    co += 'C1   ;O101;1;P;9;1;10/02/2023 08:00;W2;Op1\r\n'; // February
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      'W1;P;9.0;1;H-06-13     ;Op1\r\n';
    const pr =
      'Reference;ABCCOD;Sector\r\n' +
      ['P', 'Q', 'R', 'S', 'T', 'V'].map((r) => `${r};A;PF      \r\n`).join('');
    const dir = mkdtempSync(join(tmpdir(), 'abc-fixture-'));
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

  const january = { from: '2023-01-05', to: '2023-01-31' };
  const abc = (query: object) =>
    request(app.getHttpServer()).get('/indicators/abc').query(query);
  const classes = (body: {
    references: { reference: string; abcClass: string }[];
  }) => body.references.map((r) => [r.reference, r.abcClass]);

  it('classifies the fixture, leaving out the quantity-0 reference', async () => {
    const res = await abc(january).expect(200);
    expect(res.body).toMatchObject({
      source: 'Customer_Order',
      basis: 'lines',
      thresholds: { a: 80, b: 95 },
      ranked: { references: 5, lines: 20, units: 20 },
    });
    expect(classes(res.body)).toEqual([
      ['P', 'A'],
      ['Q', 'A'],
      ['R', 'A'],
      ['S', 'B'],
      ['T', 'C'],
    ]);
    expect(
      res.body.classes.map((c: { references: number }) => c.references),
    ).toEqual([3, 1, 1]);
  });

  it('scoping: reference = T still gives class C', async () => {
    const res = await abc({ ...january, reference: 'T' }).expect(200);
    expect(classes(res.body)).toEqual([['T', 'C']]);
    expect(res.body.references[0].cumulativeBeforePercent).toBe(95);
    expect(res.body.filters.applied).toContain('reference');
  });

  it('scoping: customer and operator select without changing the class', async () => {
    const byCustomer = await abc({ ...january, customer: 'C2' }).expect(200);
    expect(classes(byCustomer.body)).toEqual([['T', 'C']]);
    const byOperator = await abc({ ...january, operator: 'Op2' }).expect(200);
    expect(classes(byOperator.body)).toEqual([['T', 'C']]);
  });

  it('filter-selects: abcClass = A returns P, Q and R', async () => {
    const res = await abc({ ...january, abcClass: 'A' }).expect(200);
    expect(classes(res.body)).toEqual([
      ['P', 'A'],
      ['Q', 'A'],
      ['R', 'A'],
    ]);
  });

  it('computes on the date range only: February changes the ranking', async () => {
    // Whole period: P has 9 lines of 21; S has 2 -> cumulative before 18 of 21.
    const res = await abc({}).expect(200);
    expect(res.body.ranked.lines).toBe(21);
    expect(classes(res.body)).toEqual([
      ['P', 'A'],
      ['Q', 'A'],
      ['R', 'A'],
      ['S', 'B'],
      ['T', 'C'],
    ]);
    const feb = await abc({ from: '2023-02-01', to: '2023-02-28' }).expect(200);
    expect(classes(feb.body)).toEqual([['P', 'A']]);
  });

  it('reports aisle as not applied', async () => {
    const res = await abc({ ...january, aisle: 'H' }).expect(200);
    expect(
      res.body.filters.notApplied.map((f: { filter: string }) => f.filter),
    ).toEqual(['aisle']);
    expect(res.body.references).toHaveLength(5);
  });

  it('supports the units basis and custom thresholds', async () => {
    const res = await abc({
      ...january,
      basis: 'units',
      thresholdA: '40',
      thresholdB: '70',
    }).expect(200);
    expect(res.body.basis).toBe('units');
    expect(classes(res.body)).toEqual([
      ['P', 'A'],
      ['Q', 'B'],
      ['R', 'C'],
      ['S', 'C'],
      ['T', 'C'],
    ]);
  });

  it('returns an empty ranking, not an error, when nothing matches', async () => {
    const res = await abc({ from: '2024-01-01', to: '2024-01-31' }).expect(200);
    expect(res.body.references).toEqual([]);
    expect(res.body.ranked).toEqual({ references: 0, lines: 0, units: 0 });
  });

  it('rejects bad input with 400', async () => {
    await abc({ basis: 'orders' }).expect(400);
    await abc({ thresholdA: '95', thresholdB: '80' }).expect(400);
    await abc({ abcClass: 'D' }).expect(400);
  });
});
