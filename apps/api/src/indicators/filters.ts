// Global filters (spec section 5) for the indicators computed on
// customer_order_line. The ABC class filter is not here yet: it needs the
// computed ABC from M1 (issue #7) and the shared filters of issue #13.

export interface OrderFilters {
  from?: string;
  to?: string;
  reference?: string;
  excludeDuplicates: boolean;
}

export type RawQuery = Record<string, string | string[] | undefined>;

export class InvalidFilterError extends Error {}

function single(query: RawQuery, name: string): string | undefined {
  const value = query[name];
  if (Array.isArray(value)) {
    throw new InvalidFilterError(`${name} must be given once`);
  }
  return value === undefined || value === '' ? undefined : value;
}

function date(query: RawQuery, name: string): string | undefined {
  const value = single(query, name);
  if (value === undefined) return undefined;
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!valid) throw new InvalidFilterError(`${name} must be a date YYYY-MM-DD`);
  return value;
}

export function parseOrderFilters(query: RawQuery): OrderFilters {
  const from = date(query, 'from');
  const to = date(query, 'to');
  if (from && to && from > to) {
    throw new InvalidFilterError('from must not be after to');
  }
  const duplicates = single(query, 'excludeDuplicates');
  if (
    duplicates !== undefined &&
    duplicates !== 'true' &&
    duplicates !== 'false'
  ) {
    throw new InvalidFilterError('excludeDuplicates must be true or false');
  }
  return {
    from,
    to,
    reference: single(query, 'reference'),
    excludeDuplicates: duplicates === 'true',
  };
}

// WHERE conditions on customer_order_line. Quantity-0 lines are always
// excluded; duplicates only when the toggle is on (spec section 4).
export function orderFilterSql(filters: OrderFilters): {
  where: string;
  params: string[];
} {
  const conditions = ['is_valid'];
  const params: string[] = [];
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`created_at < ($${params.length}::date + 1)`);
  }
  if (filters.reference) {
    params.push(filters.reference);
    conditions.push(`reference = $${params.length}`);
  }
  if (filters.excludeDuplicates) conditions.push('NOT is_duplicate');
  return { where: conditions.join(' AND '), params };
}
