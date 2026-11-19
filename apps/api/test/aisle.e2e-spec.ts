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

describe.skipIf(!url)('X3 and A1 picks by aisle (fixture)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Order lines are spec fixture 2 (P 8, Q 6, R 3, S 2, T 1 lines in January
    // wave W1, so P, Q, R = A, S = B, T = C), plus a February line for P in W2.
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
        co += `C1   ;O${n};1;${ref};9;1;05/01/2023 08:00;W1;Op1\r\n`;
      }
    }
    co += 'C1   ;O101;1;P;9;1;10/02/2023 08:00;W2;Op1\r\n';

    // Picks (aisle, reference, picks, units) in January wave W1:
    //   H: P 3 picks 6 units, Q 2/2, T 1/1, X 1/1 (X is never ordered)
    //   I: P 1/1, S 1/3
    //   C: R 1/1 and Z: S 1/1 (unknown aisles)
    // and one pick of P in H in February wave W2.
    const pick = (
      w: string,
      ref: string,
      qty: number,
      loc: string,
      op = 'Op1',
    ) => `${w};${ref};9.0;${qty};${loc.padEnd(12)};${op}\r\n`;
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      pick('W1', 'P', 2, 'H-06-13').repeat(3) +
      pick('W1', 'P', 1, 'I-01-01') +
      pick('W1', 'Q', 1, 'H-06-14').repeat(2) +
      pick('W1', 'S', 3, 'I-02-01', 'Op2') +
      pick('W1', 'T', 1, 'H-06-15', 'Op2') +
      pick('W1', 'R', 1, 'C-102') +
      pick('W1', 'S', 1, 'ZN-COR') +
      pick('W1', 'X', 1, 'H-06-16') +
      pick('W2', 'P', 1, 'H-06-13');
    const pr =
      'Reference;ABCCOD;Sector\r\n' +
      ['P', 'Q', 'R', 'S', 'T', 'X'].map((r) => `${r};A;PF      \r\n`).join('');
    const dir = mkdtempSync(join(tmpdir(), 'aisle-fixture-'));
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
  const get = (query: object) =>
    request(app.getHttpServer()).get('/indicators/aisle-picks').query(query);
  type Body = {
    aisles: { aisle: string; picks: number; units: number }[];
    unknownAisles: { aisles: { aisle: string }[] };
    classes: { abcClass: string; picks: number }[];
  };
  const perAisle = (b: Body) =>
    b.aisles.map((a) => [a.aisle, a.picks, a.units]);
  const perClass = (b: Body) => b.classes.map((c) => [c.abcClass, c.picks]);

  it('counts picks and units per aisle with the A1 share', async () => {
    const res = await get(january).expect(200);
    expect(res.body).toMatchObject({
      source: 'Picking_Wave',
      label: 'proxy, not Sector',
      totals: { picks: 11, units: 16 },
    });
    expect(perAisle(res.body)).toEqual([
      ['H', 7, 10],
      ['I', 2, 4],
    ]);
    expect(res.body.aisles[0].sharePercent).toBeCloseTo((7 / 11) * 100);
    expect(res.body.aisles[1].sharePercent).toBeCloseTo((2 / 11) * 100);
  });

  it('keeps the unknown aisles in their own bucket', async () => {
    const res = await get(january).expect(200);
    expect(res.body.unknownAisles).toMatchObject({ picks: 2, units: 2 });
    expect(res.body.unknownAisles.label).toMatch(/unknown/);
    expect(
      res.body.unknownAisles.aisles.map((a: { aisle: string }) => a.aisle),
    ).toEqual(['C', 'Z']);
    expect(res.body.unknownAisles.sharePercent).toBeCloseTo((2 / 11) * 100);
  });

  it('splits picks by ABC class through the reference', async () => {
    const res = await get(january).expect(200);
    expect(perClass(res.body)).toEqual([
      ['A', 7],
      ['B', 2],
      ['C', 1],
      ['unclassified', 1],
    ]);
    expect(res.body.aisles[0].byClass.A).toEqual({ picks: 5, units: 8 });
    expect(res.body.aisles[1].byClass.B).toEqual({ picks: 1, units: 3 });
  });

  it('scoping: reference = T selects its picks but T stays class C', async () => {
    const res = await get({ ...january, reference: 'T' }).expect(200);
    expect(perClass(res.body)).toEqual([
      ['A', 0],
      ['B', 0],
      ['C', 1],
      ['unclassified', 0],
    ]);
    expect(res.body.filters.applied).toContain('reference');
    // The same for S, which is B and not A.
    const s = await get({ ...january, reference: 'S' }).expect(200);
    expect(perClass(s.body)).toEqual([
      ['A', 0],
      ['B', 2],
      ['C', 0],
      ['unclassified', 0],
    ]);
  });

  it('abcClass = A selects the class A picks', async () => {
    const res = await get({ ...january, abcClass: 'A' }).expect(200);
    expect(res.body.totals).toEqual({ picks: 7, units: 10 });
    expect(perAisle(res.body)).toEqual([
      ['H', 5, 8],
      ['I', 1, 1],
    ]);
  });

  it('aisle and operator select picks without changing classes', async () => {
    const h = await get({ ...january, aisle: 'h' }).expect(200);
    expect(perAisle(h.body)).toEqual([['H', 7, 10]]);
    expect(h.body.unknownAisles.aisles).toEqual([]);
    const c = await get({ ...january, aisle: 'C' }).expect(200);
    expect(c.body.aisles).toEqual([]);
    expect(c.body.unknownAisles.picks).toBe(1);
    const op = await get({ ...january, operator: 'Op2' }).expect(200);
    expect(perClass(op.body)).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 1],
      ['unclassified', 0],
    ]);
  });

  it('selects picks by wave start and classes by the same date range', async () => {
    const feb = await get({ from: '2023-02-01', to: '2023-02-28' }).expect(200);
    expect(perAisle(feb.body)).toEqual([['H', 1, 1]]);
    expect(perClass(feb.body)).toEqual([
      ['A', 1],
      ['B', 0],
      ['C', 0],
      ['unclassified', 0],
    ]);
    const all = await get({}).expect(200);
    expect(all.body.totals.picks).toBe(12);
  });

  it('carries the coverage note and the filter report', async () => {
    const res = await get({
      ...january,
      customer: 'C1',
      excludeDuplicates: 'true',
    }).expect(200);
    expect(res.body.coverageNote).toContain('94%');
    expect(res.body.filters.applied).toEqual(['from', 'to']);
    expect(
      res.body.filters.notApplied.map((f: { filter: string }) => f.filter),
    ).toEqual(['customer']);
    expect(res.body.filters.excludeDuplicates).toEqual({
      requested: true,
      applied: false,
    });
  });

  it('returns empty lists, not an error, when nothing matches', async () => {
    const res = await get({ from: '2024-01-01', to: '2024-01-31' }).expect(200);
    expect(res.body.aisles).toEqual([]);
    expect(res.body.unknownAisles).toMatchObject({ picks: 0, aisles: [] });
    expect(res.body.totals).toEqual({ picks: 0, units: 0 });
    expect(res.body.coverageNote).toContain('94%');
    const none = await get({ ...january, reference: 'ZZZ' }).expect(200);
    expect(none.body.totals).toEqual({ picks: 0, units: 0 });
  });

  it('rejects bad input with 400', async () => {
    await get({ aisle: 'HH' }).expect(400);
    await get({ abcClass: 'D' }).expect(400);
    await get({ from: 'garbage' }).expect(400);
    await get({ from: '2023-02-01', to: '2023-01-01' }).expect(400);
    await get({ basis: 'orders' }).expect(400);
    await get({ thresholdA: '95', thresholdB: '80' }).expect(400);
  });
});
