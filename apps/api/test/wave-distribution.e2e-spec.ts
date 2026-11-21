import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('X6 wave size distribution (fixture)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // January waves (distinct orders): W1 O1 O2 O4 O5 (4), W2 O3 (1),
    // W3 O4 O5 (2), W4 O5 (1), W5 O6-O11 (6), W6 O12-O22 (11).
    // O4 is split over 2 waves and O5 over 3. A quantity-0 line of O3 in W7
    // and a line of O23 in February (wave W1) must not change January.
    await pool.query(`
      DROP TABLE IF EXISTS customer_order_line;
      CREATE TABLE customer_order_line (
        customer text, order_number text, order_to_collect text, reference text,
        size text, quantity integer, created_at timestamp, wave_number text,
        operator text, is_valid boolean, is_duplicate boolean DEFAULT false);
      INSERT INTO customer_order_line
        (customer, order_number, order_to_collect, reference, size, quantity, created_at, wave_number, operator, is_valid)
      VALUES
        ('C','O1','1','A','9',1,'2023-01-05 08:00','W1','Op1',true),
        ('C','O2','1','A','9',1,'2023-01-05 08:00','W1','Op1',true),
        ('C','O4','1','A','9',1,'2023-01-05 08:00','W1','Op1',true),
        ('C','O5','1','A','9',1,'2023-01-05 08:00','W1','Op1',true),
        ('C','O3','1','A','9',1,'2023-01-05 08:00','W2','Op1',true),
        ('C','O4','2','A','9',1,'2023-01-05 08:00','W3','Op1',true),
        ('C','O5','2','A','9',1,'2023-01-05 08:00','W3','Op1',true),
        ('C','O5','3','A','9',1,'2023-01-05 08:00','W4','Op1',true),
        ('C','O3','2','A','9',0,'2023-01-05 08:00','W7','Op1',false),
        ('C','O23','1','A','9',1,'2023-02-01 08:00','W1','Op1',true);
      INSERT INTO customer_order_line
        (customer, order_number, order_to_collect, reference, size, quantity, created_at, wave_number, operator, is_valid)
      SELECT 'C', 'O' || g, '1', 'A', '9', 1, '2023-01-06 08:00',
             CASE WHEN g <= 11 THEN 'W5' ELSE 'W6' END, 'Op1', true
        FROM generate_series(6, 22) g;`);
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

  const january = '?from=2023-01-05&to=2023-01-31';
  const get = (path: string, query: string) =>
    request(app.getHttpServer()).get(`/indicators/${path}${query}`);

  it('spreads the waves over the five size buckets', async () => {
    const { body } = await get('wave-distribution', january).expect(200);
    expect(body).toMatchObject({
      source: 'Customer_Order',
      waves: 6,
      orders: 22,
      waveOrderPairs: 25,
    });
    expect(
      body.sizes.map((b: { label: string; waves: number }) => [
        b.label,
        b.waves,
      ]),
    ).toEqual([
      ['1 order', 2],
      ['2 to 3 orders', 1],
      ['4 to 5 orders', 1],
      ['6 to 10 orders', 1],
      ['More than 10 orders', 1],
    ]);
  });

  it('lists the most common wave sizes in units', async () => {
    const { body } = await get('wave-distribution', january).expect(200);
    // Every line is 1 unit, so a wave's units equal its lines: W1 4, W2 1,
    // W3 2, W4 1, W5 6, W6 11 (the quantity-0 line of W7 does not count).
    expect(body.unitsPerWave).toMatchObject({ minUnits: 1, maxUnits: 11 });
    expect(
      body.unitsPerWave.topSizes.map((t: { units: number; waves: number }) => [
        t.units,
        t.waves,
      ]),
    ).toEqual([
      [1, 2],
      [2, 1],
      [4, 1],
      [6, 1],
      [11, 1],
    ]);
  });

  it('spreads the split orders over 2, 3 and 4 or more waves', async () => {
    const { body } = await get('wave-distribution', january).expect(200);
    expect(body.splitOrders.total).toBe(2);
    expect(
      body.splitOrders.byWaves.map((b: { label: string; orders: number }) => [
        b.label,
        b.orders,
      ]),
    ).toEqual([
      ['2 waves', 1],
      ['3 waves', 1],
      ['4 or more waves', 0],
    ]);
  });

  it('agrees with M3 and X2 from the wave-split endpoint', async () => {
    const d = (await get('wave-distribution', january).expect(200)).body;
    const s = (await get('wave-split', january).expect(200)).body;
    expect(d.waves).toBe(s.waves);
    expect(d.orders).toBe(s.orders);
    expect(d.waveOrderPairs).toBe(s.waveOrderPairs);
    expect(d.splitOrders.total).toBe(s.splitOrders);
    expect(d.waveOrderPairs / d.waves).toBeCloseTo(s.m3AverageOrdersPerWave);
    expect(d.splitOrders.sharePercentOfOrders).toBeCloseTo(
      s.x2SplitOrdersPercent,
    );
  });

  it('applies the date range and reports the filters', async () => {
    const { body } = await get(
      'wave-distribution',
      '?from=2023-02-01&to=2023-02-28',
    ).expect(200);
    expect(body).toMatchObject({ waves: 1, orders: 1, waveOrderPairs: 1 });
    expect(body.sizes[0].waves).toBe(1);
    expect(body.filters.applied).toContain('from');
  });

  it('returns empty counts, not an error, when nothing matches', async () => {
    const { body } = await get(
      'wave-distribution',
      '?from=2024-01-01&to=2024-01-31',
    ).expect(200);
    expect(body.waves).toBe(0);
    expect(body.sizes[0].sharePercentOfWaves).toBeNull();
    expect(body.splitOrders.sharePercentOfOrders).toBeNull();
  });

  it('rejects bad input with 400', async () => {
    await get('wave-distribution', '?from=garbage').expect(400);
    await get('wave-distribution', '?thresholdA=90&thresholdB=80').expect(400);
  });
});
