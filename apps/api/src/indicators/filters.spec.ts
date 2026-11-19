import {
  InvalidFilterError,
  orderFilterSql,
  parseOrderFilters,
} from './filters.js';

describe('parseOrderFilters', () => {
  it('defaults to no filters and keeping duplicates', () => {
    expect(parseOrderFilters({})).toEqual({
      from: undefined,
      to: undefined,
      reference: undefined,
      excludeDuplicates: false,
    });
  });

  it('rejects bad dates, reversed ranges and bad toggles', () => {
    expect(() => parseOrderFilters({ from: '2023-02-30' })).toThrow(
      InvalidFilterError,
    );
    expect(() => parseOrderFilters({ to: '05/01/2023' })).toThrow(
      InvalidFilterError,
    );
    expect(() =>
      parseOrderFilters({ from: '2023-03-01', to: '2023-02-01' }),
    ).toThrow(InvalidFilterError);
    expect(() => parseOrderFilters({ excludeDuplicates: 'yes' })).toThrow(
      InvalidFilterError,
    );
    expect(() => parseOrderFilters({ reference: ['A', 'B'] })).toThrow(
      InvalidFilterError,
    );
  });
});

describe('orderFilterSql', () => {
  it('always excludes quantity-0 lines', () => {
    expect(orderFilterSql(parseOrderFilters({}))).toEqual({
      where: 'is_valid',
      params: [],
    });
  });

  it('parameterises every value and makes the end date inclusive', () => {
    const { where, params } = orderFilterSql(
      parseOrderFilters({
        from: '2023-01-05',
        to: '2023-01-31',
        reference: 'A',
        excludeDuplicates: 'true',
      }),
    );
    expect(where).toBe(
      'is_valid AND NOT is_duplicate AND created_at >= $1::date AND created_at < ($2::date + 1) AND reference = $3',
    );
    expect(params).toEqual(['2023-01-05', '2023-01-31', 'A']);
  });
});
