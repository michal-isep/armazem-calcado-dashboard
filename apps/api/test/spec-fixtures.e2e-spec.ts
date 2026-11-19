import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Loads the tiny fixture of spec section 8 once and checks M1-M5 together.
// It recreates the tables, so it needs a database named explicitly in
// TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('tiny fixture (spec section 8), M1 to M5', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // O1-O3 are the spec fixture; D is the quantity-0 line (is_valid = false).
    // Sectors S1 and S2 are fictional.
    await pool.query(`
      DROP TABLE IF EXISTS customer_order_line, product;
      CREATE TABLE product (reference text PRIMARY KEY, abccod text, sector text);
      INSERT INTO product VALUES
        ('A','A','S1'), ('B','B','S2'), ('C','C','S2'), ('D','C','S2');
      CREATE TABLE customer_order_line (
        customer text, order_number text, order_to_collect text, reference text,
        size text, quantity integer, created_at timestamp, wave_number text,
        operator text, is_valid boolean, is_duplicate boolean DEFAULT false);
      INSERT INTO customer_order_line
        (customer, order_number, order_to_collect, reference, size, quantity, created_at, wave_number, operator, is_valid, is_duplicate)
      VALUES
        ('C1','O1','1','A','9',3,'2023-01-05 08:00','W1','Op1',true,false),
        ('C1','O1','2','B','10',2,'2023-01-05 08:00','W1','Op1',true,false),
        ('C2','O2','1','A','9',1,'2023-01-05 09:00','W1','Op1',true,false),
        ('C3','O3','1','C','unknown',4,'2023-01-06 10:30','W2','Op2',true,false),
        ('C3','O3','2','D','9',0,'2023-01-06 10:30','W2','Op2',false,false);`);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const get = (path: string, query: object = {}) =>
    request(app.getHttpServer()).get(path).query(query);
  const abc = (query: object) => get('/indicators/abc', query);
  const classes = (body: {
    references: { reference: string; abcClass: string }[];
  }) => body.references.map((r) => [r.reference, r.abcClass]);

  it('gives M2 = 3.333 and M3 = 1.5', async () => {
    const size = await get('/indicators/order-size').expect(200);
    expect(size.body.m2AverageOrderSize).toBeCloseTo(10 / 3);
    const split = await get('/indicators/wave-split').expect(200);
    expect(split.body.m3AverageOrdersPerWave).toBe(1.5);
  });

  it('gives M4 = 40/60% and M5 = 33.3%', async () => {
    const { body } = await get('/indicators/sector').expect(200);
    expect(
      body.m4SectorShare.map((s: { sector: string; sharePercent: number }) => [
        s.sector,
        s.sharePercent,
      ]),
    ).toEqual([
      ['S1', 40],
      ['S2', 60],
    ]);
    expect(body.m5MultiSectorOrdersPercent).toBeCloseTo(100 / 3);
  });

  it('gives M1 on the units basis: A, C, B ranked, classes A, A, B', async () => {
    const { body } = await abc({ basis: 'units' }).expect(200);
    expect(classes(body)).toEqual([
      ['A', 'A'],
      ['C', 'A'],
      ['B', 'B'],
    ]);
    expect(
      body.references.map(
        (r: { cumulativeBeforePercent: number }) => r.cumulativeBeforePercent,
      ),
    ).toEqual([0, 40, 80]);
  });

  it('gives M1 on the lines basis: A, B, C ranked (tie by reference), all class A', async () => {
    const { body } = await abc({}).expect(200);
    expect(classes(body)).toEqual([
      ['A', 'A'],
      ['B', 'A'],
      ['C', 'A'],
    ]);
    expect(
      body.references.map(
        (r: { cumulativeBeforePercent: number }) => r.cumulativeBeforePercent,
      ),
    ).toEqual([0, 50, 75]);
  });

  it('gives nulls or empty lists, not errors, when no order matches', async () => {
    const none = { from: '2024-01-01', to: '2024-01-31' };
    const size = await get('/indicators/order-size', none).expect(200);
    expect(size.body.m2AverageOrderSize).toBeNull();
    const split = await get('/indicators/wave-split', none).expect(200);
    expect(split.body.m3AverageOrdersPerWave).toBeNull();
    const sector = await get('/indicators/sector', none).expect(200);
    expect(sector.body.m5MultiSectorOrdersPercent).toBeNull();
    expect(sector.body.m4SectorShare).toEqual([]);
    const ranking = await abc(none).expect(200);
    expect(ranking.body.references).toEqual([]);
  });

  it('gives M4 = 100% and M5 = 0% when only one sector is present', async () => {
    const { body } = await get('/indicators/sector', { reference: 'A' }).expect(
      200,
    );
    expect(body.m4SectorShare).toMatchObject([
      { sector: 'S1', sharePercent: 100 },
    ]);
    expect(body.m5MultiSectorOrdersPercent).toBe(0);
  });
});
