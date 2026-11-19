import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('M3 and X2 (fixture from spec section 8)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // O1-O3 are the spec fixture (January). O4 is added in February and is
    // split across waves W1 and W3, to exercise X2.
    await pool.query(`
      DROP TABLE IF EXISTS customer_order_line;
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
        ('C2','O2','1','A','9',1,'2023-01-05 09:00','W1','Op1',true,true),
        ('C3','O3','1','C','unknown',4,'2023-01-06 10:30','W2','Op2',true,false),
        ('C3','O3','2','D','9',0,'2023-01-06 10:30','W2','Op2',false,false),
        ('C4','O4','1','A','9',1,'2023-02-01 08:00','W1','Op1',true,false),
        ('C4','O4','2','C','9',2,'2023-02-01 08:00','W3','Op1',true,false);`);
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

  const get = (query: string) =>
    request(app.getHttpServer()).get(`/indicators/wave-split${query}`);

  it('gives M3 = 1.5 and X2 = 0 on the spec fixture', async () => {
    const { body } = await get('?to=2023-01-31').expect(200);
    // pairs (W1,O1) (W1,O2) (W2,O3) = 3; waves W1, W2; the duplicate and the
    // quantity-0 line change nothing.
    expect(body).toMatchObject({
      source: 'Customer_Order',
      orders: 3,
      waves: 2,
      lines: 5,
      waveOrderPairs: 3,
      splitOrders: 0,
      m3AverageOrdersPerWave: 1.5,
      x2SplitOrdersPercent: 0,
    });
  });

  it('counts an order split across waves once in each wave', async () => {
    const { body } = await get('').expect(200);
    // pairs add (W1,O4) and (W3,O4): 5 pairs over W1, W2, W3; 1 of 4 orders
    expect(body).toMatchObject({
      orders: 4,
      waves: 3,
      waveOrderPairs: 5,
      splitOrders: 1,
      x2SplitOrdersPercent: 25,
    });
    expect(body.m3AverageOrdersPerWave).toBeCloseTo(5 / 3);
  });

  it('respects the reference and duplicate filters', async () => {
    const ref = (await get('?reference=C').expect(200)).body;
    // C is in O3 (W2) and O4 (W3): 2 pairs, 2 waves, no order split
    expect(ref).toMatchObject({
      orders: 2,
      waves: 2,
      m3AverageOrdersPerWave: 1,
      splitOrders: 0,
    });
    const dedup = (await get('?excludeDuplicates=true').expect(200)).body;
    expect(dedup).toMatchObject({ lines: 6, waveOrderPairs: 5 });
  });

  it('returns nulls for an empty result and 400 for bad input', async () => {
    const { body } = await get('?reference=NOPE').expect(200);
    expect(body).toMatchObject({
      orders: 0,
      waves: 0,
      lines: 0,
      m3AverageOrdersPerWave: null,
      x2SplitOrdersPercent: null,
    });
    await get('?from=nonsense').expect(400);
  });
});
