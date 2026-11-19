import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('M4 and M5 (fixture from spec section 8)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // O1-O3 are the spec fixture (January); sectors S1 and S2 are fictional.
    // O4 is added in February with one S1 line and an exact duplicate of it.
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
        ('C3','O3','2','D','9',0,'2023-01-06 10:30','W2','Op2',false,false),
        ('C4','O4','1','A','9',1,'2023-02-01 08:00','W3','Op1',true,false),
        ('C4','O4','1','A','9',1,'2023-02-01 08:00','W3','Op1',true,true);`);
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
    request(app.getHttpServer()).get(`/indicators/sector${query}`);

  it('gives M4 S1 = 40%, S2 = 60% and M5 = 33.3% on the spec fixture', async () => {
    const { body } = await get('?to=2023-01-31').expect(200);
    // The quantity-0 line (D) is excluded: 10 units, 3 orders, 4 lines.
    expect(body).toMatchObject({
      source: 'Product + Customer_Order',
      orders: 3,
      lines: 4,
      units: 10,
      multiSectorOrders: 1,
      notInformative: false,
      m4SectorShare: [
        { sector: 'S1', units: 4, lines: 2, orders: 2, sharePercent: 40 },
        { sector: 'S2', units: 6, lines: 2, orders: 2, sharePercent: 60 },
      ],
    });
    expect(body.m5MultiSectorOrdersPercent).toBeCloseTo(100 / 3);
  });

  it('gives M4 = 100% and M5 = 0% with a single sector, flagged not informative', async () => {
    const { body } = await get('?reference=A&to=2023-01-31').expect(200);
    expect(body).toMatchObject({
      orders: 2,
      lines: 2,
      units: 4,
      multiSectorOrders: 0,
      m5MultiSectorOrdersPercent: 0,
      notInformative: true,
      m4SectorShare: [
        { sector: 'S1', units: 4, lines: 2, orders: 2, sharePercent: 100 },
      ],
    });
  });

  it('respects the date filter and the duplicates toggle', async () => {
    const all = (await get('').expect(200)).body;
    expect(all).toMatchObject({ orders: 4, lines: 6, units: 12 });
    const dedup = (await get('?excludeDuplicates=true').expect(200)).body;
    expect(dedup).toMatchObject({ orders: 4, lines: 5, units: 11 });
  });

  it('returns nulls for an empty result and 400 for bad input', async () => {
    const { body } = await get('?reference=NOPE').expect(200);
    expect(body).toMatchObject({
      orders: 0,
      lines: 0,
      units: 0,
      m4SectorShare: [],
      m5MultiSectorOrdersPercent: null,
    });
    await get('?from=nonsense').expect(400);
  });
});
