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

describe.skipIf(!url)('X4 computed ABC vs ABCCOD (fixture)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Spec fixture 2 in January (P 8, Q 6, R 3, S 2, T 1 lines): P, Q, R = A,
    // S = B, T = C. U has one line, in February only. X is never ordered.
    const counts: [string, number, string][] = [
      ['P', 8, 'C1'],
      ['Q', 6, 'C2'],
      ['R', 3, 'C1'],
      ['S', 2, 'C1'],
      ['T', 1, 'C1'],
    ];
    let n = 0;
    let co =
      '﻿codCustomer;orderNumber;orderToCollect;Reference;Size (US);quantity (units);creationDate;waveNumber;operator\r\n';
    for (const [ref, lines, customer] of counts) {
      for (let i = 0; i < lines; i++) {
        n++;
        co += `${customer}   ;O${n};1;${ref};9;1;05/01/2023 08:00;W1;Op1\r\n`;
      }
    }
    co += 'C1   ;O101;1;U;9;1;10/02/2023 08:00;W2;Op1\r\n';

    // ABCCOD: P, R, S match; Q (computed A) and T (computed C) do not.
    const abccod: Record<string, string> = {
      P: 'A',
      Q: 'B',
      R: 'A',
      S: 'B',
      T: 'A',
      U: 'C',
      X: 'C',
    };
    const pr =
      'Reference;ABCCOD;Sector\r\n' +
      Object.entries(abccod)
        .map(([r, c]) => `${r};${c};PF      \r\n`)
        .join('');
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      'W1;P;9.0;1;H-06-13     ;Op1\r\n';
    const dir = mkdtempSync(join(tmpdir(), 'abc-comparison-fixture-'));
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
  const get = (query: object = {}) =>
    request(app.getHttpServer()).get('/indicators/abc-comparison').query(query);
  type Body = {
    summary: Record<string, number | null>;
    references: {
      reference: string;
      computedClass: string | null;
      abccod: string;
      status: string;
    }[];
  };
  const rows = (b: Body) =>
    b.references.map((r) => [r.reference, r.computedClass, r.abccod, r.status]);

  it('gives the class, ABCCOD, status and the match count per reference', async () => {
    const res = await get(january).expect(200);
    expect(res.body).toMatchObject({
      source: 'Customer_Order + Product',
      basis: 'lines',
      thresholds: { a: 80, b: 95 },
      summary: {
        products: 7,
        compared: 5,
        matches: 3,
        mismatches: 2,
        notRanked: 2,
        matchPercent: 60,
      },
    });
    expect(rows(res.body)).toEqual([
      ['P', 'A', 'A', 'match'],
      ['Q', 'A', 'B', 'mismatch'],
      ['R', 'A', 'A', 'match'],
      ['S', 'B', 'B', 'match'],
      ['T', 'C', 'A', 'mismatch'],
      ['U', null, 'C', 'not-ranked'],
      ['X', null, 'C', 'not-ranked'],
    ]);
  });

  it('states that the origin of ABCCOD is unknown and how unranked products count', async () => {
    const res = await get(january).expect(200);
    expect(res.body.abccodNote).toContain(
      'origin of Product.ABCCOD is unknown',
    );
    expect(res.body.notRankedNote).toContain('neither a match nor a mismatch');
  });

  it('ranks the whole selected period when there is no date range', async () => {
    // U now has a line, so only X is not ranked.
    const res = await get().expect(200);
    expect(res.body.summary).toMatchObject({ products: 7, notRanked: 1 });
    const u = res.body.references.find(
      (r: { reference: string }) => r.reference === 'U',
    );
    expect(u.computedClass).not.toBeNull();
  });

  it('keeps the computed class when a reference is selected (ADR 0002)', async () => {
    const res = await get({ ...january, reference: 'T' }).expect(200);
    expect(rows(res.body)).toEqual([['T', 'C', 'A', 'mismatch']]);
    expect(res.body.summary).toMatchObject({ products: 1, matchPercent: 0 });
  });

  it('selects by computed class', async () => {
    const res = await get({ ...january, abcClass: 'A' }).expect(200);
    expect(
      res.body.references.map((r: { reference: string }) => r.reference),
    ).toEqual(['P', 'Q', 'R']);
    expect(res.body.summary).toMatchObject({
      compared: 3,
      matches: 2,
      notRanked: 0,
    });
  });

  it('selects by customer without changing the classes', async () => {
    // C2 only ordered Q, which is still class A.
    const res = await get({ ...january, customer: 'C2' }).expect(200);
    expect(rows(res.body)).toEqual([['Q', 'A', 'B', 'mismatch']]);
  });

  it('follows the basis and thresholds', async () => {
    // 50/60: P (before 0%) is A, Q (before 40%) is A, R (before 70%) is C.
    const res = await get({
      ...january,
      thresholdA: '50',
      thresholdB: '60',
    }).expect(200);
    expect(res.body.thresholds).toEqual({ a: 50, b: 60 });
    const r = res.body.references.find(
      (x: { reference: string }) => x.reference === 'R',
    );
    expect(r.computedClass).toBe('C');
    const units = await get({ ...january, basis: 'units' }).expect(200);
    expect(units.body.basis).toBe('units');
  });

  it('reports aisle as not applied and rejects bad input', async () => {
    const res = await get({ ...january, aisle: 'H' }).expect(200);
    expect(res.body.filters.notApplied).toEqual([
      expect.objectContaining({ filter: 'aisle' }),
    ]);
    await get({ basis: 'weight' }).expect(400);
    await get({ abcClass: 'Z' }).expect(400);
  });

  it('returns an empty comparison, not an error, outside the data', async () => {
    const res = await get({ from: '2020-01-01', to: '2020-01-31' }).expect(200);
    expect(res.body.summary).toMatchObject({
      products: 7,
      compared: 0,
      notRanked: 7,
      matchPercent: null,
    });
  });
});
