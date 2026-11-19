import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('monthly trend and comparison', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // O1-O3 are the spec fixture (January, data starts on the 5th). O4 is in
    // February, split across W1 and W3. March has no orders. O5 is on 10 April,
    // where the data ends.
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
        ('C4','O4','2','C','9',2,'2023-02-01 08:00','W3','Op1',true,false),
        ('C5','O5','1','A','9',5,'2023-04-10 16:00','W4','Op2',true,false);`);
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
    request(app.getHttpServer()).get(`/indicators/monthly-trend${query}`);

  it('gives the spec fixture ratios for January with the days covered', async () => {
    const { body } = await get('').expect(200);
    expect(body.source).toBe('Customer_Order');
    expect(body.dataRange).toEqual({ from: '2023-01-05', to: '2023-04-10' });
    expect(body.months.map((m: { month: string }) => m.month)).toEqual([
      '2023-01',
      '2023-02',
      '2023-03',
      '2023-04',
    ]);
    // The exact duplicate is kept by default: 5 lines, 11 units.
    expect(body.months[0]).toMatchObject({
      month: '2023-01',
      from: '2023-01-05',
      to: '2023-01-31',
      daysCovered: 27,
      daysInMonth: 31,
      partial: true,
      orders: 3,
      lines: 5,
      units: 11,
      waves: 2,
      m3AverageOrdersPerWave: 1.5,
      x2SplitOrdersPercent: 0,
    });
    expect(body.months[0].m2AverageOrderSize).toBeCloseTo(11 / 3);
    expect(body.months[0].x1LinesPerOrder).toBeCloseTo(5 / 3);
  });

  it('flags only the months the data does not fully cover', async () => {
    const { body } = await get('').expect(200);
    expect(body.months.map((m: { partial: boolean }) => m.partial)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(body.months[3]).toMatchObject({
      from: '2023-04-01',
      to: '2023-04-10',
      daysCovered: 10,
    });
  });

  it('measures X2 inside the month and gives null for a month without orders', async () => {
    const { body } = await get('').expect(200);
    expect(body.months[1]).toMatchObject({
      orders: 1,
      waves: 2,
      m3AverageOrdersPerWave: 1,
      x2SplitOrdersPercent: 100,
      m2AverageOrderSize: 3,
    });
    expect(body.months[2]).toMatchObject({
      orders: 0,
      lines: 0,
      units: 0,
      m2AverageOrderSize: null,
      m3AverageOrdersPerWave: null,
      x1LinesPerOrder: null,
      x2SplitOrdersPercent: null,
    });
  });

  it('limits the months and the days covered to the selected range', async () => {
    const { body } = await get('?from=2023-01-20&to=2023-02-10').expect(200);
    expect(body.months).toHaveLength(2);
    expect(body.months[0]).toMatchObject({
      from: '2023-01-20',
      to: '2023-01-31',
      daysCovered: 12,
      orders: 0,
    });
    expect(body.months[1]).toMatchObject({
      from: '2023-02-01',
      to: '2023-02-10',
      daysCovered: 10,
      orders: 1,
    });
  });

  it('compares with the previous period of equal length', async () => {
    const { body } = await get('?from=2023-03-01&to=2023-04-10').expect(200);
    // 41 days, so the previous period is 2023-01-19 to 2023-02-28 (only O4).
    expect(body.period).toEqual({
      from: '2023-03-01',
      to: '2023-04-10',
      days: 41,
    });
    expect(body.current).toMatchObject({ orders: 1, units: 5 });
    expect(body.comparison).toMatchObject({
      status: 'ok',
      from: '2023-01-19',
      to: '2023-02-28',
      indicators: {
        orders: 1,
        units: 3,
        m2AverageOrderSize: 3,
        x2SplitOrdersPercent: 100,
      },
    });
  });

  it('says no data, never zero, when the previous period starts before the data', async () => {
    const { body } = await get('?from=2023-02-01&to=2023-03-31').expect(200);
    expect(body.comparison).toEqual({
      status: 'no-data',
      reason: 'before-data-start',
      from: '2022-12-04',
      to: '2023-01-31',
      indicators: null,
    });
    // The whole data range has nothing before it either.
    const all = (await get('').expect(200)).body;
    expect(all.comparison).toMatchObject({
      status: 'no-data',
      indicators: null,
    });
  });

  it('says no data when the previous period has no matching order', async () => {
    const { body } = await get(
      '?from=2023-03-01&to=2023-04-10&reference=B',
    ).expect(200);
    expect(body.comparison).toMatchObject({
      status: 'no-data',
      reason: 'no-matching-orders',
      indicators: null,
    });
  });

  it('respects the reference and duplicate filters', async () => {
    const dedup = (await get('?excludeDuplicates=true').expect(200)).body;
    expect(dedup.months[0]).toMatchObject({ lines: 4, units: 10 });
    expect(dedup.months[0].m2AverageOrderSize).toBeCloseTo(10 / 3);
    const ref = (await get('?reference=C').expect(200)).body;
    expect(ref.months[0]).toMatchObject({ orders: 1, units: 4 });
    expect(ref.months[3]).toMatchObject({
      orders: 0,
      m2AverageOrderSize: null,
    });
  });

  it('returns 400 for bad input', async () => {
    await get('?from=nonsense').expect(400);
  });
});
