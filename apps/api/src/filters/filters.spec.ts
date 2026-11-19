import {
  buildWhere,
  describeFilters,
  FilterError,
  parseFilters,
} from './filters.js';

describe('parseFilters', () => {
  it('defaults: no filters, duplicates kept', () => {
    expect(parseFilters({})).toEqual({
      from: undefined,
      to: undefined,
      abcClass: undefined,
      reference: undefined,
      customer: undefined,
      operator: undefined,
      aisle: undefined,
      excludeDuplicates: false,
    });
  });

  it('reads every filter, trims, and treats empty values as absent', () => {
    const f = parseFilters({
      from: '2023-02-01',
      to: '2023-02-28',
      abcClass: 'b',
      reference: ' P ',
      customer: '',
      operator: 'Op1',
      aisle: 'h',
      excludeDuplicates: 'true',
    });
    expect(f).toMatchObject({
      from: '2023-02-01',
      to: '2023-02-28',
      abcClass: 'B',
      reference: 'P',
      customer: undefined,
      operator: 'Op1',
      aisle: 'H',
      excludeDuplicates: true,
    });
  });

  it.each([
    [{ from: '2023-02-30' }],
    [{ from: '01/02/2023' }],
    [{ from: '2023-03-01', to: '2023-02-01' }],
    [{ abcClass: 'D' }],
    [{ aisle: 'HH' }],
    [{ excludeDuplicates: 'yes' }],
    [{ reference: ['P', 'Q'] }],
  ])('rejects %j', (query) => {
    expect(() => parseFilters(query)).toThrow(FilterError);
  });
});

describe('buildWhere, order lines', () => {
  it('always excludes quantity 0 and keeps duplicates by default', () => {
    expect(buildWhere(parseFilters({}), 'customer_order')).toEqual({
      sql: 'WHERE is_valid',
      params: [],
    });
  });

  it('excludes duplicates only when the toggle is on', () => {
    const w = buildWhere(
      parseFilters({ excludeDuplicates: 'true' }),
      'customer_order',
    );
    expect(w.sql).toBe('WHERE is_valid AND NOT is_duplicate');
  });

  it('numbers parameters in order, to date inclusive', () => {
    const w = buildWhere(
      parseFilters({
        from: '2023-02-01',
        to: '2023-02-28',
        reference: 'P',
        customer: 'C1',
        operator: 'Op1',
      }),
      'customer_order',
    );
    expect(w.sql).toBe(
      'WHERE is_valid AND created_at >= $1::date AND created_at < ($2::date + 1)' +
        ' AND reference = $3 AND customer = $4 AND operator = $5',
    );
    expect(w.params).toEqual(['2023-02-01', '2023-02-28', 'P', 'C1', 'Op1']);
  });

  it('ignores aisle and never puts the ABC class in SQL', () => {
    const w = buildWhere(
      parseFilters({ aisle: 'H', abcClass: 'A' }),
      'customer_order',
    );
    expect(w).toEqual({ sql: 'WHERE is_valid', params: [] });
  });

  it('dateOnly scope keeps date and duplicates, drops the rest (ADR 0002)', () => {
    const w = buildWhere(
      parseFilters({
        from: '2023-02-01',
        reference: 'T',
        customer: 'C1',
        operator: 'Op1',
        excludeDuplicates: 'true',
      }),
      'customer_order',
      { scope: 'dateOnly' },
    );
    expect(w.sql).toBe(
      'WHERE is_valid AND NOT is_duplicate AND created_at >= $1::date',
    );
    expect(w.params).toEqual(['2023-02-01']);
  });
});

describe('buildWhere, picks', () => {
  it('has no clause without filters', () => {
    expect(buildWhere(parseFilters({}), 'picking_wave')).toEqual({
      sql: '',
      params: [],
    });
  });

  it('applies reference, operator and aisle; not customer or duplicates', () => {
    const w = buildWhere(
      parseFilters({
        reference: 'P',
        operator: 'Op1',
        aisle: 'H',
        customer: 'C1',
        excludeDuplicates: 'true',
      }),
      'picking_wave',
    );
    expect(w.sql).toBe('WHERE reference = $1 AND operator = $2 AND aisle = $3');
    expect(w.params).toEqual(['P', 'Op1', 'H']);
  });

  it('selects picks by the wave start date', () => {
    const w = buildWhere(
      parseFilters({ from: '2023-02-01', to: '2023-02-28' }),
      'picking_wave',
    );
    expect(w.sql).toContain('HAVING MIN(created_at) >= $1::date');
    expect(w.sql).toContain('MIN(created_at) < ($2::date + 1)');
    expect(w.params).toEqual(['2023-02-01', '2023-02-28']);
  });
});

describe('describeFilters', () => {
  const f = parseFilters({
    aisle: 'H',
    customer: 'C1',
    reference: 'P',
    excludeDuplicates: 'true',
  });

  it('reports aisle as not applied on order indicators', () => {
    const r = describeFilters(f, 'customer_order');
    expect(r.applied).toEqual(['reference', 'customer']);
    expect(r.notApplied).toEqual([
      { filter: 'aisle', reason: expect.stringContaining('Picking_Wave') },
    ]);
    expect(r.excludeDuplicates).toEqual({ requested: true, applied: true });
  });

  it('reports customer and the toggle as not applied on pick indicators', () => {
    const r = describeFilters(f, 'picking_wave');
    expect(r.applied).toEqual(['reference', 'aisle']);
    expect(r.notApplied.map((n) => n.filter)).toEqual(['customer']);
    expect(r.excludeDuplicates).toEqual({ requested: true, applied: false });
  });

  it('lists nothing for filters the user did not set', () => {
    const r = describeFilters(parseFilters({}), 'picking_wave');
    expect(r).toEqual({
      applied: [],
      notApplied: [],
      excludeDuplicates: { requested: false, applied: false },
    });
  });
});
