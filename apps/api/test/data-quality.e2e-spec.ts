import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

// Writes its own fixture rows, so it needs a database named explicitly in
// TEST_DATABASE_URL (it recreates the tables), never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('data quality', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    // W1 and W2 are ordered; only W1 is picked, and with fewer units.
    await pool.query(`
      DROP TABLE IF EXISTS customer_order_line, picking_wave_pick;
      CREATE TABLE customer_order_line (
        customer text, order_number text, order_to_collect text, reference text,
        size text, quantity integer, created_at timestamp, wave_number text,
        operator text, is_valid boolean, is_duplicate boolean DEFAULT false);
      INSERT INTO customer_order_line
        (customer, order_number, order_to_collect, reference, size, quantity, created_at, wave_number, operator, is_valid, is_duplicate)
      VALUES
        ('C1','O1','1','A','9',3,'2023-01-05 08:00','W1','Op1',true,false),
        ('C1','O1','2','B','unknown',2,'2023-01-05 08:00','W1','Op1',true,false),
        ('C2','O2','1','A','9',1,'2023-01-05 09:00','W1','Op1',true,false),
        ('C2','O2','1','A','9',1,'2023-01-05 09:00','W1','Op1',true,true),
        ('C3','O3','1','C','9',4,'2023-01-06 10:30','W2','Op2',true,false),
        ('C3','O3','2','D','9',0,'2023-01-06 10:30','W2','Op2',false,false);
      CREATE TABLE picking_wave_pick (
        wave_number text, reference text, size text, quantity integer,
        location text, aisle text, operator text);
      INSERT INTO picking_wave_pick VALUES
        ('W1','A','9',3,'H-1','H','Op1'),
        ('W1','B','9',2,'H-2','H','Op1');`);
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

  it('counts excluded and flagged rows and the source disagreement', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/indicators/data-quality')
      .expect(200);
    expect(body.customerOrder).toEqual({
      rows: 6,
      excludedQuantityZero: 1,
      blankSizeUnknown: 1,
      exactDuplicates: 1,
    });
    expect(body.pickingWave).toEqual({ rows: 2, units: 5 });
    // Valid order units: 3 + 2 + 1 + 1 + 4 = 11 (the duplicate is kept).
    expect(body.sourceDisagreement).toEqual({
      wavesInOrders: 2,
      wavesInPicking: 1,
      wavesMissingFromPicking: 1,
      orderUnits: 11,
      pickUnits: 5,
      unitsDifference: 6,
    });
  });
});
