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

describe.skipIf(!url)(
  'X7 shelf position and X8 location coverage (fixture)',
  () => {
    const pool = new pg.Pool({ connectionString: url });
    let app: INestApplication<App>;

    beforeAll(async () => {
      // Order lines: spec fixture 2 (P 8, Q 6, R 3, S 2, T 1 lines in January
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

      // Coordinates (y, level z): H-06-13 (100, 1), H-06-14 (300, 2),
      // H-06-15 (250, 1), I-01-01 (1440, 1), I-02-01 (1200, 3).
      // Picks in January wave W1 (picks / units):
      //   H-06-13 P 3/6, H-06-14 Q 2/2, H-06-15 T 1/1, I-01-01 P 1/1, I-02-01 S 1/3
      //   no coordinates: RC-01 R 4/4, ZN-COR S 1/1, H-06-16 X 1/1
      // and in February wave W2: H-06-13 P 1/1.
      const pick = (w: string, ref: string, qty: number, loc: string) =>
        `${w};${ref};9.0;${qty};${loc.padEnd(12)};Op1\r\n`;
      const pw =
        '﻿waveNumber;reference;Size (US);quantityToPick (units);locations;operator\r\n' +
        pick('W1', 'P', 2, 'H-06-13').repeat(3) +
        pick('W1', 'Q', 1, 'H-06-14').repeat(2) +
        pick('W1', 'T', 1, 'H-06-15') +
        pick('W1', 'P', 1, 'I-01-01') +
        pick('W1', 'S', 3, 'I-02-01') +
        pick('W1', 'R', 1, 'RC-01').repeat(4) +
        pick('W1', 'S', 1, 'ZN-COR') +
        pick('W1', 'X', 1, 'H-06-16') +
        pick('W2', 'P', 1, 'H-06-13');
      const pr =
        'Reference;ABCCOD;Sector\r\n' +
        ['P', 'Q', 'R', 'S', 'T', 'X']
          .map((r) => `${r};A;PF      \r\n`)
          .join('');
      const sl =
        '﻿originalLocation,position,x,y,z\r\n' +
        'H-06-13,"100, 100, 1",100,100,1\r\n' +
        'H-06-14,"100, 300, 2",100,300,2\r\n' +
        'H-06-15,"100, 250, 1",100,250,1\r\n' +
        'I-01-01,"200, 1440, 1",200,1440,1\r\n' +
        'I-02-01,"200, 1200, 3",200,1200,3\r\n';
      const dir = mkdtempSync(join(tmpdir(), 'position-fixture-'));
      writeFileSync(join(dir, 'co.csv'), co);
      writeFileSync(join(dir, 'pw.csv'), pw);
      writeFileSync(join(dir, 'pr.csv'), pr);
      writeFileSync(join(dir, 'sl.csv'), sl);
      await runEtl(pool, {
        customerOrder: join(dir, 'co.csv'),
        pickingWave: join(dir, 'pw.csv'),
        product: join(dir, 'pr.csv'),
        storageLocation: join(dir, 'sl.csv'),
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
    const position = (query: object) =>
      request(app.getHttpServer())
        .get('/indicators/shelf-position')
        .query(query);
    const coverage = (query: object) =>
      request(app.getHttpServer())
        .get('/indicators/location-coverage')
        .query(query);

    type Entry = { picks: number; units: number; sharePercent: number | null };
    type Position = {
      totals: Entry;
      bands: (Entry & { band: number; byClass: Record<string, Entry> })[];
      levels: (Entry & { level: number })[];
      picksWithoutCoordinatesLeftOut: number;
    };

    it('counts picks by y band and level, labelled as a proxy', async () => {
      const res = await position(january).expect(200);
      const b = res.body as Position;
      expect(res.body).toMatchObject({
        source: 'Picking_Wave + Storage_Location',
        label: 'proxy, not distance',
        picksWithoutCoordinatesLeftOut: 6,
      });
      expect(b.totals).toMatchObject({ picks: 8, units: 13 });
      expect(b.bands.map((x) => [x.band, x.picks, x.units])).toEqual([
        [0, 3, 6],
        [1, 3, 3],
        [2, 0, 0],
        [3, 0, 0],
        [4, 0, 0],
        [5, 2, 4], // y = 1,200 and y = 1,440 (the last band is closed)
      ]);
      expect(b.bands[0].sharePercent).toBeCloseTo(37.5);
      expect(b.bands[1].byClass.A.picks).toBe(2);
      expect(b.bands[1].byClass.C.picks).toBe(1);
      expect(b.levels.map((x) => [x.level, x.picks, x.units])).toEqual([
        [1, 5, 8],
        [2, 2, 2],
        [3, 1, 3],
      ]);
    });

    it('selects from the computed classes with abcClass and never changes one', async () => {
      const res = await position({ ...january, abcClass: 'A' }).expect(200);
      const b = res.body as Position;
      expect(b.totals).toMatchObject({ picks: 6, units: 9 });
      expect(b.bands.map((x) => x.picks)).toEqual([3, 2, 0, 0, 0, 1]);
      // Only class A picks without coordinates count as left out (RC-01).
      expect(b.picksWithoutCoordinatesLeftOut).toBe(4);
      // T stays class C on the range, also when one reference is selected.
      const t = await position({ ...january, reference: 'T' }).expect(200);
      expect((t.body as Position).bands[1].byClass.C.picks).toBe(1);
    });

    it('uses the wave start for the date range', async () => {
      const res = await position({
        from: '2023-02-01',
        to: '2023-02-28',
      }).expect(200);
      expect((res.body as Position).totals.picks).toBe(1);
    });

    it('reports picks with and without coordinates and the codes without', async () => {
      const res = await coverage(january).expect(200);
      expect(res.body).toMatchObject({
        source: 'Picking_Wave + Storage_Location',
        totals: { picks: 14, units: 19 },
        withCoordinates: { picks: 8, units: 13 },
        withoutCoordinates: { picks: 6, units: 6 },
        topWithoutCoordinates: [
          { location: 'RC-01', aisle: 'R', picks: 4 },
          { location: 'H-06-16', aisle: 'H', picks: 1 },
          { location: 'ZN-COR', aisle: 'Z', picks: 1 },
        ],
        aislesAffected: [
          {
            aisle: 'R',
            picks: 4,
            picksWithoutCoordinates: 4,
            sharePercentWithout: 100,
          },
          { aisle: 'H', picks: 7, picksWithoutCoordinates: 1 },
          {
            aisle: 'Z',
            picks: 1,
            picksWithoutCoordinates: 1,
            sharePercentWithout: 100,
          },
        ],
      });
      expect(res.body.withCoordinates.sharePercent).toBeCloseTo(57.142857, 4);
    });

    it('applies the aisle and class filters to coverage', async () => {
      const res = await coverage({ ...january, aisle: 'R' }).expect(200);
      expect(res.body.totals.picks).toBe(4);
      expect(res.body.filters.applied).toContain('aisle');
      // P (3 + 1 picks), Q (2) and R (4) are class A: 10 picks, 4 without
      // coordinates (RC-01).
      const a = await coverage({ ...january, abcClass: 'A' }).expect(200);
      expect(a.body.totals.picks).toBe(10);
      expect(a.body.withoutCoordinates.picks).toBe(4);
    });

    it('rejects bad input with 400', async () => {
      await position({ thresholdA: '90', thresholdB: '80' }).expect(400);
      await coverage({ from: 'garbage' }).expect(400);
    });
  },
);
