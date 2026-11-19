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

describe.skipIf(!url)('wave detail (fixture)', () => {
  const pool = new pg.Pool({ connectionString: url });
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Customer_Order:
    //   wave 10001: O1 has A x2, B x1, a repeat of A x2 (exact duplicate) and
    //     a C line with quantity 0; O2 has A x1. O2 is split: its B x4 line is
    //     in wave 10002.
    //   wave 10002: O2 B x4 (not in Picking_Wave).
    //   wave 10004: one quantity 0 line only (not in Picking_Wave).
    const row = (
      order: string,
      ref: string,
      qty: number,
      wave: string,
      op = 'Op1',
    ) => `C1   ;${order};1;${ref};9;${qty};05/01/2023 08:00;${wave};${op}\r\n`;
    const co =
      '﻿codCustomer;orderNumber;orderToCollect;Reference;Size (US);quantity (units);creationDate;waveNumber;operator\r\n' +
      row('O1', 'A', 2, '10001') +
      row('O1', 'B', 1, '10001') +
      row('O1', 'A', 2, '10001') +
      row('O1', 'C', 0, '10001') +
      row('O2', 'A', 1, '10001', 'Op2') +
      row('O2', 'B', 4, '10002') +
      row('O3', 'C', 0, '10004');

    // Picking_Wave: wave 10001 has 4 units (the order file has 6, or 4 without
    // the duplicate) and wave 10003 is not in Customer_Order.
    const pick = (w: string, ref: string, qty: number, loc: string) =>
      `${w};${ref};9.0;${qty};${loc.padEnd(12)};Op1\r\n`;
    const pw =
      '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
      pick('10001', 'A', 2, 'H-06-13') +
      pick('10001', 'A', 1, 'H-06-14') +
      pick('10001', 'B', 1, 'I-01-01') +
      pick('10003', 'A', 5, 'C-102');
    const pr =
      'Reference;ABCCOD;Sector\r\n' +
      ['A', 'B', 'C'].map((r) => `${r};A;PF      \r\n`).join('');
    const dir = mkdtempSync(join(tmpdir(), 'waves-fixture-'));
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

  const get = (wave: string, query: object = {}) =>
    request(app.getHttpServer()).get(`/waves/${wave}`).query(query);
  type Order = {
    orderNumber: string;
    lines: number;
    units: number;
    items: { reference: string; size: string; quantity: number }[];
  };

  it('returns the orders and the picks of a wave found in both files', async () => {
    const res = await get('10001').expect(200);
    expect(res.body.waveNumber).toBe('10001');
    expect(res.body.orders).toMatchObject({
      source: 'Customer_Order',
      inFile: true,
      totals: { orders: 2, lines: 4, units: 6 },
    });
    const [o1, o2] = res.body.orders.orders as Order[];
    expect(o1).toMatchObject({
      orderNumber: 'O1',
      customer: 'C1',
      createdAt: '2023-01-05T08:00:00',
      operator: 'Op1',
      lines: 3,
      units: 5,
    });
    expect(o1.items).toEqual([
      { reference: 'A', size: '9', quantity: 2 },
      { reference: 'B', size: '9', quantity: 1 },
      { reference: 'A', size: '9', quantity: 2 },
    ]);
    expect(o2).toMatchObject({ orderNumber: 'O2', operator: 'Op2', units: 1 });

    expect(res.body.picks).toMatchObject({
      source: 'Picking_Wave',
      inFile: true,
      totals: { picks: 3, units: 4 },
    });
    expect(res.body.picks.picks[0]).toEqual({
      reference: 'A',
      size: '9.0',
      quantity: 2,
      location: 'H-06-13',
      aisle: 'H',
      operator: 'Op1',
    });
    expect(res.body.coverageNote).toMatch(/not reconciled/);
    expect(res.body.linkNote).toMatch(/ADR 0005/);
  });

  it('keeps the two lists apart: picks carry no order number', async () => {
    const res = await get('10001').expect(200);
    for (const p of res.body.picks.picks) {
      expect(p).not.toHaveProperty('orderNumber');
    }
  });

  it('excludes quantity 0 lines and keeps exact duplicates by default', async () => {
    const res = await get('10001').expect(200);
    const o1 = (res.body.orders.orders as Order[])[0];
    expect(o1.items.map((i) => i.reference)).toEqual(['A', 'B', 'A']);
    expect(o1.items.every((i) => i.quantity > 0)).toBe(true);
  });

  it('drops the duplicate only when excludeDuplicates is on', async () => {
    const res = await get('10001', { excludeDuplicates: 'true' }).expect(200);
    expect(res.body.orders.totals).toEqual({ orders: 2, lines: 3, units: 4 });
    expect(res.body.picks.totals.picks).toBe(3);
    expect(res.body.filters.excludeDuplicates.requested).toBe(true);
    await get('10001', { excludeDuplicates: 'false' })
      .expect(200)
      .expect((r) => expect(r.body.orders.totals.lines).toBe(4));
  });

  it('reports a unit mismatch between the files without picking a side', async () => {
    const res = await get('10001').expect(200);
    expect(res.body.unitCheck).toMatchObject({
      status: 'mismatch',
      orderUnits: 6,
      pickUnits: 4,
      difference: -2,
    });
    expect(res.body.unitCheck.note).toMatch(/neither is declared right/);

    const on = await get('10001', { excludeDuplicates: 'true' }).expect(200);
    expect(on.body.unitCheck).toMatchObject({ status: 'match', difference: 0 });
  });

  it('shows only this wave’s lines of a split order', async () => {
    const w1 = await get('10001').expect(200);
    const o2 = (w1.body.orders.orders as Order[]).find(
      (o) => o.orderNumber === 'O2',
    );
    expect(o2?.items).toEqual([{ reference: 'A', size: '9', quantity: 1 }]);

    const w2 = await get('10002').expect(200);
    expect(w2.body.orders.orders).toHaveLength(1);
    expect(w2.body.orders.orders[0]).toMatchObject({
      orderNumber: 'O2',
      lines: 1,
      units: 4,
      items: [{ reference: 'B', size: '9', quantity: 4 }],
    });
  });

  it('answers 200 with no picks for a wave only in Customer_Order', async () => {
    const res = await get('10002').expect(200);
    expect(res.body.picks).toMatchObject({
      inFile: false,
      picks: [],
      totals: { picks: 0, units: 0 },
    });
    expect(res.body.picks.note).toMatch(/not an error/i);
    expect(res.body.unitCheck.status).toBe('not-comparable');
  });

  it('answers 200 with no orders for a wave only in Picking_Wave', async () => {
    const res = await get('10003').expect(200);
    expect(res.body.orders).toMatchObject({
      inFile: false,
      orders: [],
      totals: { orders: 0, lines: 0, units: 0 },
    });
    expect(res.body.picks.totals).toEqual({ picks: 1, units: 5 });
    expect(res.body.unitCheck.status).toBe('not-comparable');
  });

  it('is not a 404 for a wave that only has quantity 0 lines', async () => {
    const res = await get('10004').expect(200);
    expect(res.body.orders).toMatchObject({ inFile: true, orders: [] });
    expect(res.body.picks.inFile).toBe(false);
  });

  it('answers 404 with a clear message for an unknown wave', async () => {
    const res = await get('99999').expect(404);
    expect(res.body.message).toBe(
      'Wave 99999 was not found in Customer_Order or Picking_Wave',
    );
  });

  it('says which global filters it does not apply', async () => {
    const res = await get('10001', {
      reference: 'A',
      from: '2023-02-01',
      aisle: 'H',
    }).expect(200);
    expect(
      res.body.filters.notApplied.map((n: { filter: string }) => n.filter),
    ).toEqual(['from', 'reference', 'aisle']);
    expect(res.body.orders.totals.lines).toBe(4);
    expect(res.body.picks.totals.picks).toBe(3);
  });

  it('answers 400 for a malformed wave number or bad filter', async () => {
    for (const wave of ['abc', 'W1', '12.5', '%20', '1234567890']) {
      await get(wave).expect(400);
    }
    await get('10001', { excludeDuplicates: 'maybe' }).expect(400);
    await get('10001', { from: 'garbage' }).expect(400);
  });
});
