// Wave detail (issue #15): the orders of one wave from Customer_Order and its
// picks from Picking_Wave. Pure functions with no Nest or database imports.
//
// The two lists are never merged or linked: Picking_Wave has no order number
// (ADR 0005), and the two files are not reconciled (ADR 0004).

import type { FilterName, Filters } from '../filters/filters.js';

export class WaveParamError extends Error {}

/** Wave numbers are 5-digit numbers in both files; accept 1 to 9 digits. */
const WAVE_NUMBER = /^\d{1,9}$/;

export function parseWaveNumber(raw: string): string {
  const waveNumber = raw.trim();
  if (!WAVE_NUMBER.test(waveNumber)) {
    throw new WaveParamError(
      'waveNumber must be a number of 1 to 9 digits, for example 33168',
    );
  }
  return waveNumber;
}

export const ORDERS_SOURCE = 'Customer_Order';
export const PICKS_SOURCE = 'Picking_Wave';

export const COVERAGE_NOTE =
  'Customer_Order and Picking_Wave are not reconciled (ADR 0004): 77 waves of Customer_Order are missing from Picking_Wave and Picking_Wave has about 6% fewer units. Each list shows what its own file has; neither file is declared right.';
export const NO_LINK_NOTE =
  'Picking_Wave has no order number, so picks cannot be tied to orders (ADR 0005). The two lists are separate and are not matched line by line.';

/** One valid order line of the wave, as read from customer_order_line. */
export interface OrderLineRow {
  orderNumber: string;
  customer: string;
  createdAt: string;
  operator: string;
  reference: string;
  size: string;
  quantity: number;
}

export interface OrderEntry {
  orderNumber: string;
  customer: string;
  createdAt: string;
  /** The operator on the order's lines in this wave; null if they differ. */
  operator: string | null;
  operators: string[];
  lines: number;
  units: number;
  items: { reference: string; size: string; quantity: number }[];
}

/**
 * Groups the lines by order number, in the order of the rows. Only the lines
 * of this wave are passed in, so a split order shows only this wave's lines.
 */
export function groupOrders(rows: OrderLineRow[]): OrderEntry[] {
  const byOrder = new Map<string, OrderEntry>();
  for (const r of rows) {
    let order = byOrder.get(r.orderNumber);
    if (!order) {
      order = {
        orderNumber: r.orderNumber,
        customer: r.customer,
        createdAt: r.createdAt,
        operator: null,
        operators: [],
        lines: 0,
        units: 0,
        items: [],
      };
      byOrder.set(r.orderNumber, order);
    }
    if (!order.operators.includes(r.operator)) order.operators.push(r.operator);
    order.lines += 1;
    order.units += r.quantity;
    order.items.push({
      reference: r.reference,
      size: r.size,
      quantity: r.quantity,
    });
  }
  const orders = [...byOrder.values()];
  for (const o of orders) {
    o.operator = o.operators.length === 1 ? o.operators[0] : null;
  }
  return orders;
}

export interface PickEntry {
  reference: string;
  size: string;
  quantity: number;
  location: string;
  aisle: string;
  operator: string;
}

export interface UnitCheck {
  status: 'match' | 'mismatch' | 'not-comparable';
  orderUnits: number;
  pickUnits: number;
  /** Picking_Wave units minus Customer_Order units; null if not comparable. */
  difference: number | null;
  note: string;
}

/**
 * Compares the units the two files have for this wave. It only reports the
 * difference and never says which file is right (ADR 0004). A wave found in
 * one file only is not comparable.
 */
export function checkUnits(
  inOrders: boolean,
  inPicks: boolean,
  orderUnits: number,
  pickUnits: number,
): UnitCheck {
  const base = { orderUnits, pickUnits };
  if (!inOrders || !inPicks) {
    const only = inOrders ? ORDERS_SOURCE : PICKS_SOURCE;
    return {
      status: 'not-comparable',
      ...base,
      difference: null,
      note: `This wave is in ${only} only, so its units cannot be compared between the files.`,
    };
  }
  if (orderUnits === pickUnits) {
    return {
      status: 'match',
      ...base,
      difference: 0,
      note: `Both files have ${orderUnits} units for this wave.`,
    };
  }
  return {
    status: 'mismatch',
    ...base,
    difference: pickUnits - orderUnits,
    note: `${ORDERS_SOURCE} has ${orderUnits} units for this wave and ${PICKS_SOURCE} has ${pickUnits}. The files are not reconciled (ADR 0004); neither is declared right.`,
  };
}

const NOT_APPLIED_REASON =
  'A single wave is shown whole: the global filters other than the duplicates toggle do not apply to it';
const NOT_APPLIED: FilterName[] = [
  'from',
  'to',
  'abcClass',
  'reference',
  'customer',
  'operator',
  'aisle',
];

/** The global filters the user set that this endpoint does not apply. */
export function notAppliedFilters(filters: Filters) {
  return NOT_APPLIED.filter((name) => filters[name] !== undefined).map(
    (filter) => ({ filter, reason: NOT_APPLIED_REASON }),
  );
}
