import {
  aisleOf,
  normalizeSize,
  parseDate,
  toOrderLine,
  toPick,
} from './transform.js';

describe('transform', () => {
  it('parses dd/mm/yyyy hh:mm', () => {
    expect(parseDate('19/10/2023 07:18')).toBe('2023-10-19 07:18:00');
    expect(parseDate('05/01/2023 00:00')).toBe('2023-01-05 00:00:00');
  });

  it('rejects bad or impossible dates', () => {
    expect(() => parseDate('2023-10-19 07:18')).toThrow();
    expect(() => parseDate('31/02/2023 10:00')).toThrow();
  });

  it('keeps a blank size as "unknown"', () => {
    expect(normalizeSize('   ')).toBe('unknown');
    expect(normalizeSize(' 9 ')).toBe('9');
  });

  it('takes the first letter of the trimmed location as the aisle', () => {
    expect(aisleOf('H-06-13     ')).toBe('H');
    expect(aisleOf('ZN-COR')).toBe('Z');
  });

  it('trims padding on an order line', () => {
    const l = toOrderLine({
      codCustomer: 'C0000016            ',
      orderNumber: '124438',
      orderToCollect: '8',
      Reference: '8N10W9',
      'Size (US)': '',
      'quantity (units)': '0',
      creationDate: '19/10/2023 07:18',
      waveNumber: '43175',
      operator: 'Operator_1',
    });
    expect(l.customer).toBe('C0000016');
    expect(l.size).toBe('unknown');
    expect(l.quantity).toBe(0);
  });

  it('builds a pick with its aisle', () => {
    const p = toPick({
      waveNumber: '43175',
      reference: '8N10W9',
      'Size (US)': '9.0',
      'quantityToPick (units)': '1',
      locations: 'H-06-13     ',
      operator: 'Operator_1',
    });
    expect(p.location).toBe('H-06-13');
    expect(p.aisle).toBe('H');
  });

  it('fails loudly on a missing column', () => {
    expect(() => toPick({ waveNumber: '1' })).toThrow(/Missing column/);
  });
});
