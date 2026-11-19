import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('M2 and X1 (fixture from spec section 8)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
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

  const get = (query: string) =>
    request(app.getHttpServer()).get(`/indicators/order-size${query}`);

  it('excludes quantity-0 lines and keeps duplicates by default', async () => {
    const { body } = await get('').expect(200);
    // 11 units (duplicate kept) / 3 orders; 5 lines / 3 orders
    expect(body).toMatchObject({
      source: 'Customer_Order',
      orders: 3,
      lines: 5,
      units: 11,
    });
    expect(body.m2AverageOrderSize).toBeCloseTo(11 / 3);
    expect(body.x1LinesPerOrder).toBeCloseTo(5 / 3);
  });

  it('excludes duplicates when the toggle is on', async () => {
    const { body } = await get('?excludeDuplicates=true').expect(200);
    expect(body).toMatchObject({ orders: 3, lines: 4, units: 10 });
    expect(body.m2AverageOrderSize).toBeCloseTo(10 / 3); // spec: 3.333
  });

  it('respects the date range and reference filters', async () => {
    const day = (await get('?from=2023-01-06&to=2023-01-06').expect(200)).body;
    expect(day).toMatchObject({
      orders: 1,
      lines: 1,
      units: 4,
      m2AverageOrderSize: 4,
    });
    const ref = (await get('?reference=A').expect(200)).body;
    expect(ref).toMatchObject({ orders: 2, lines: 3, units: 5 });
  });

  it('applies customer and operator and reports the filters it did not apply', async () => {
    const { body } = await get(
      '?customer=C3&operator=Op2&aisle=H&abcClass=B',
    ).expect(200);
    // C is class B here (lines A 3, B 1, C 1), so the class keeps C3's line.
    expect(body).toMatchObject({ orders: 1, lines: 1, units: 4 });
    expect(body.filters.applied).toEqual(['abcClass', 'operator', 'customer']);
    expect(
      body.filters.notApplied.map((n: { filter: string }) => n.filter),
    ).toEqual(['aisle']);
  });

  it('returns nulls for an empty result and 400 for bad input', async () => {
    const { body } = await get('?reference=NOPE').expect(200);
    expect(body).toMatchObject({
      orders: 0,
      lines: 0,
      units: 0,
      m2AverageOrderSize: null,
      x1LinesPerOrder: null,
    });
    await get('?from=nonsense').expect(400);
  });
});
