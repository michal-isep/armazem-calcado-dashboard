import { parseFilters } from '../filters/filters.js';
import {
  WaveParamError,
  checkUnits,
  groupOrders,
  notAppliedFilters,
  parseWaveNumber,
  type OrderLineRow,
} from './waves.js';

const line = (over: Partial<OrderLineRow>): OrderLineRow => ({
  orderNumber: 'O1',
  customer: 'C1',
  createdAt: '2023-01-05T08:00:00',
  operator: 'Op1',
  reference: 'A',
  size: '9',
  quantity: 1,
  ...over,
});

describe('parseWaveNumber', () => {
  it('accepts numbers like the ones in the data and trims them', () => {
    expect(parseWaveNumber('33168')).toBe('33168');
    expect(parseWaveNumber(' 43175 ')).toBe('43175');
  });

  it.each(['', '   ', 'W1', '12.5', '-1', '1e5', '1 2', '1234567890'])(
    'rejects %j',
    (raw) => {
      expect(() => parseWaveNumber(raw)).toThrow(WaveParamError);
    },
  );
});

describe('groupOrders', () => {
  it('groups lines by order with lines, units and items', () => {
    const orders = groupOrders([
      line({ reference: 'A', quantity: 2 }),
      line({ reference: 'B', size: '10', quantity: 3 }),
      line({ orderNumber: 'O2', customer: 'C2', quantity: 1 }),
    ]);
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      orderNumber: 'O1',
      customer: 'C1',
      createdAt: '2023-01-05T08:00:00',
      operator: 'Op1',
      lines: 2,
      units: 5,
      items: [
        { reference: 'A', size: '9', quantity: 2 },
        { reference: 'B', size: '10', quantity: 3 },
      ],
    });
    expect(orders[1]).toMatchObject({ orderNumber: 'O2', lines: 1, units: 1 });
  });

  it('keeps every operator when the lines of an order differ', () => {
    const [order] = groupOrders([
      line({ operator: 'Op1' }),
      line({ operator: 'Op2' }),
    ]);
    expect(order.operator).toBeNull();
    expect(order.operators).toEqual(['Op1', 'Op2']);
  });

  it('gives no orders for no lines', () => {
    expect(groupOrders([])).toEqual([]);
  });
});

describe('checkUnits', () => {
  it('reports a match without a note about a problem', () => {
    expect(checkUnits(true, true, 6, 6)).toMatchObject({
      status: 'match',
      difference: 0,
    });
  });

  it('reports a mismatch without declaring either file right', () => {
    const r = checkUnits(true, true, 6, 4);
    expect(r).toMatchObject({ status: 'mismatch', difference: -2 });
    expect(r.note).toContain('Customer_Order has 6 units');
    expect(r.note).toContain('Picking_Wave has 4');
    expect(r.note).toContain('neither is declared right');
  });

  it('is not comparable when the wave is in one file only', () => {
    expect(checkUnits(true, false, 6, 0)).toMatchObject({
      status: 'not-comparable',
      difference: null,
    });
    expect(checkUnits(false, true, 0, 4).note).toContain('Picking_Wave only');
  });
});

describe('notAppliedFilters', () => {
  it('lists every set filter except the duplicates toggle, with a reason', () => {
    const f = parseFilters({
      from: '2023-01-05',
      reference: 'A',
      aisle: 'h',
      excludeDuplicates: 'true',
    });
    expect(notAppliedFilters(f).map((n) => n.filter)).toEqual([
      'from',
      'reference',
      'aisle',
    ]);
    expect(notAppliedFilters(f)[0].reason).toMatch(/single wave/);
  });

  it('is empty when no other filter is set', () => {
    expect(notAppliedFilters(parseFilters({}))).toEqual([]);
  });
});
