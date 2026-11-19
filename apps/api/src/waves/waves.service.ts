import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { AbcService, type AbcParams } from '../abc/abc.service.js';
import {
  buildWhere,
  describeFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';
import {
  COVERAGE_NOTE,
  NO_LINK_NOTE,
  ORDERS_SOURCE,
  PICKS_SOURCE,
  checkUnits,
  groupOrders,
  notAppliedFilters,
  type OrderEntry,
  type OrderLineRow,
  type PickEntry,
  type UnitCheck,
  type WaveListEntry,
  type WaveListParams,
} from './waves.js';

export interface WaveDetail {
  waveNumber: string;
  orders: {
    source: typeof ORDERS_SOURCE;
    /** False when the wave has no row at all in Customer_Order. */
    inFile: boolean;
    totals: { orders: number; lines: number; units: number };
    orders: OrderEntry[];
    note: string | null;
  };
  picks: {
    source: typeof PICKS_SOURCE;
    /** False when the wave has no row at all in Picking_Wave. */
    inFile: boolean;
    totals: { picks: number; units: number };
    picks: PickEntry[];
    note: string | null;
  };
  unitCheck: UnitCheck;
  coverageNote: string;
  linkNote: string;
  filters: {
    /** Quantity 0 lines are always excluded; duplicates only on request. */
    excludeDuplicates: { requested: boolean; appliesTo: string };
    notApplied: { filter: string; reason: string }[];
  };
}

export interface WaveList {
  source: typeof ORDERS_SOURCE;
  filters: FilterReport;
  /** Waves matching the filters, over all pages. */
  total: number;
  page: number;
  pageSize: number;
  sort: WaveListParams['sort'];
  order: WaveListParams['order'];
  waves: WaveListEntry[];
  note: string;
}

@Injectable()
export class WavesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly abc: AbcService,
  ) {}

  // Waves of Customer_Order with their orders, lines, units and creation date
  // range, on the shared filters. A page past the end gives an empty list.
  async list(
    filters: Filters,
    abcParams: AbcParams,
    params: WaveListParams,
  ): Promise<WaveList> {
    const abcReferences = await this.abc.referencesInClass(filters, abcParams);
    const { sql, params: values } = buildWhere(filters, 'customer_order', {
      abcReferences,
    });
    const dir = params.order === 'desc' ? 'DESC' : 'ASC';
    // wave_number is text; shorter first keeps numeric order. Ties by wave.
    const byWave = `length(wave_number) ${dir}, wave_number ${dir}`;
    const orderBy =
      params.sort === 'firstCreatedAt'
        ? `first_created_at ${dir}, ${byWave}`
        : byWave;
    const grouped = `SELECT wave_number,
                count(DISTINCT order_number)::int AS orders,
                count(*)::int AS lines,
                sum(quantity)::int AS units,
                min(created_at) AS first_created_at,
                max(created_at) AS last_created_at
           FROM customer_order_line
          ${sql}
          GROUP BY wave_number`;
    const [count, page] = await Promise.all([
      this.database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM (${grouped}) w`,
        values,
      ),
      this.database.query<WaveListEntry>(
        `SELECT wave_number AS "waveNumber", orders, lines, units,
                to_char(first_created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "firstCreatedAt",
                to_char(last_created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "lastCreatedAt"
           FROM (${grouped}) w
          ORDER BY ${orderBy}
          LIMIT ${params.pageSize} OFFSET ${(params.page - 1) * params.pageSize}`,
        values,
      ),
    ]);
    return {
      source: ORDERS_SOURCE,
      filters: describeFilters(filters, 'customer_order'),
      total: count.rows[0].total,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      order: params.order,
      waves: page.rows,
      note: 'Orders, lines and units come from Customer_Order only. Picks are not tied to orders (ADR 0005) and the files are not reconciled (ADR 0004), so picks are not listed here.',
    };
  }

  async detail(waveNumber: string, filters: Filters): Promise<WaveDetail> {
    // Only the duplicates toggle applies to a single wave (ADR 0003).
    const where = buildWhere(
      { excludeDuplicates: filters.excludeDuplicates },
      'customer_order',
    );
    const waveParam = `$${where.params.length + 1}`;
    const params = [...where.params, waveNumber];

    const [lines, picks, inOrders] = await Promise.all([
      this.database.query<OrderLineRow>(
        `SELECT order_number AS "orderNumber", customer,
                to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
                operator, reference, size, quantity
           FROM customer_order_line
           ${where.sql} AND wave_number = ${waveParam}
          ORDER BY order_number, id`,
        params,
      ),
      this.database.query<PickEntry>(
        `SELECT reference, size, quantity, location, aisle, operator
           FROM picking_wave_pick WHERE wave_number = $1 ORDER BY id`,
        [waveNumber],
      ),
      // Any row counts, even one with quantity 0: the wave is in the file.
      this.database.query<{ found: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM customer_order_line
                         WHERE wave_number = $1) AS found`,
        [waveNumber],
      ),
    ]);

    const orderInFile = inOrders.rows[0]?.found === true;
    const pickInFile = picks.rows.length > 0;
    if (!orderInFile && !pickInFile) {
      throw new NotFoundException(
        `Wave ${waveNumber} was not found in ${ORDERS_SOURCE} or ${PICKS_SOURCE}`,
      );
    }

    const orders = groupOrders(lines.rows);
    const orderUnits = lines.rows.reduce((s, r) => s + r.quantity, 0);
    const pickUnits = picks.rows.reduce((s, r) => s + r.quantity, 0);

    return {
      waveNumber,
      orders: {
        source: ORDERS_SOURCE,
        inFile: orderInFile,
        totals: {
          orders: orders.length,
          lines: lines.rows.length,
          units: orderUnits,
        },
        orders,
        note: orderInFile
          ? lines.rows.length === 0
            ? 'All the lines of this wave in Customer_Order are excluded by the filters (quantity 0 or duplicates).'
            : null
          : `This wave has no rows in ${ORDERS_SOURCE}; it is only in ${PICKS_SOURCE}. Not an error (ADR 0004).`,
      },
      picks: {
        source: PICKS_SOURCE,
        inFile: pickInFile,
        totals: { picks: picks.rows.length, units: pickUnits },
        picks: picks.rows,
        note: pickInFile
          ? null
          : `This wave has no rows in ${PICKS_SOURCE} (one of the 77 waves missing from it); it is only in ${ORDERS_SOURCE}. Not an error (ADR 0004).`,
      },
      unitCheck: checkUnits(orderInFile, pickInFile, orderUnits, pickUnits),
      coverageNote: COVERAGE_NOTE,
      linkNote: NO_LINK_NOTE,
      filters: {
        excludeDuplicates: {
          requested: filters.excludeDuplicates,
          appliesTo: `${ORDERS_SOURCE} only; picks have no duplicate flag`,
        },
        notApplied: notAppliedFilters(filters),
      },
    };
  }
}
