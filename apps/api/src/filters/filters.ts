// Global filters (spec section 5), shared by every indicator endpoint.
// Pure functions with no Nest or database imports, so they are easy to test.
//
// Query parameters: from, to (YYYY-MM-DD, both inclusive), abcClass (A|B|C),
// reference, customer, operator, aisle (one letter), excludeDuplicates
// (true|false, default false). Empty values count as absent.

export type AbcClass = 'A' | 'B' | 'C';
export type Source = 'customer_order' | 'picking_wave';
export type FilterName =
  | 'from'
  | 'to'
  | 'abcClass'
  | 'reference'
  | 'customer'
  | 'operator'
  | 'aisle'
  | 'excludeDuplicates';

export interface Filters {
  from?: string;
  to?: string;
  abcClass?: AbcClass;
  reference?: string;
  customer?: string;
  operator?: string;
  aisle?: string;
  excludeDuplicates: boolean;
}

export class FilterError extends Error {}

function single(query: Record<string, unknown>, name: FilterName) {
  const v = query[name];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new FilterError(`${name} must be given once, as text`);
  }
  const t = v.trim();
  return t === '' ? undefined : t;
}

function date(query: Record<string, unknown>, name: 'from' | 'to') {
  const v = single(query, name);
  if (v === undefined) return undefined;
  const ok =
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
  if (!ok) throw new FilterError(`${name} must be a real date, YYYY-MM-DD`);
  return v;
}

export function parseFilters(query: Record<string, unknown>): Filters {
  const from = date(query, 'from');
  const to = date(query, 'to');
  if (from && to && from > to) {
    throw new FilterError('from must not be after to');
  }

  const abc = single(query, 'abcClass')?.toUpperCase();
  if (abc !== undefined && abc !== 'A' && abc !== 'B' && abc !== 'C') {
    throw new FilterError('abcClass must be A, B or C');
  }

  const aisle = single(query, 'aisle')?.toUpperCase();
  if (aisle !== undefined && !/^[A-Z]$/.test(aisle)) {
    throw new FilterError('aisle must be one letter');
  }

  const dup = single(query, 'excludeDuplicates');
  if (dup !== undefined && dup !== 'true' && dup !== 'false') {
    throw new FilterError('excludeDuplicates must be true or false');
  }

  return {
    from,
    to,
    abcClass: abc as AbcClass | undefined,
    reference: single(query, 'reference'),
    customer: single(query, 'customer'),
    operator: single(query, 'operator'),
    aisle,
    excludeDuplicates: dup === 'true',
  };
}

export interface Where {
  /** Empty string, or `WHERE ...` to append to a query on the source table. */
  sql: string;
  params: unknown[];
}

export interface WhereOptions {
  /**
   * `dateOnly` keeps only the date range (plus validity and the duplicates
   * toggle). Used to compute ABC, which ignores the product, class, customer,
   * operator and aisle filters (ADR 0002).
   */
  scope?: 'all' | 'dateOnly';
}

/**
 * WHERE clause for `customer_order_line` (source `customer_order`) or
 * `picking_wave_pick` (source `picking_wave`). Column names are not qualified.
 *
 * - Order lines: quantity 0 lines are always excluded; exact duplicates only
 *   when `excludeDuplicates` is on (ADR 0003).
 * - Picks have no date, customer or order. The date range selects picks whose
 *   wave started in the range, where a wave starts at its earliest valid order
 *   line. Customer is not applied to picks (see `describeFilters`).
 * - `abcClass` is never part of the clause: it selects from the computed
 *   classes, which the indicator does after computing ABC (ADR 0002).
 */
export function buildWhere(
  filters: Filters,
  source: Source,
  options: WhereOptions = {},
): Where {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, value: unknown) => {
    params.push(value);
    conds.push(cond.replace('?', `$${params.length}`));
  };
  const all = (options.scope ?? 'all') === 'all';

  if (source === 'customer_order') {
    conds.push('is_valid');
    if (filters.excludeDuplicates) conds.push('NOT is_duplicate');
    if (filters.from) add('created_at >= ?::date', filters.from);
    if (filters.to) add('created_at < (?::date + 1)', filters.to);
    if (all) {
      if (filters.reference) add('reference = ?', filters.reference);
      if (filters.customer) add('customer = ?', filters.customer);
      if (filters.operator) add('operator = ?', filters.operator);
    }
  } else {
    if (filters.from || filters.to) {
      const having: string[] = [];
      if (filters.from) {
        params.push(filters.from);
        having.push(`MIN(created_at) >= $${params.length}::date`);
      }
      if (filters.to) {
        params.push(filters.to);
        having.push(`MIN(created_at) < ($${params.length}::date + 1)`);
      }
      conds.push(
        `wave_number IN (SELECT wave_number FROM customer_order_line
           WHERE is_valid GROUP BY wave_number HAVING ${having.join(' AND ')})`,
      );
    }
    if (all) {
      if (filters.reference) add('reference = ?', filters.reference);
      if (filters.operator) add('operator = ?', filters.operator);
      if (filters.aisle) add('aisle = ?', filters.aisle);
    }
  }

  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

export interface FilterReport {
  /** Filters the user set that changed this response. */
  applied: FilterName[];
  /** Filters the user set that did not change it, with the reason. */
  notApplied: { filter: FilterName; reason: string }[];
  excludeDuplicates: { requested: boolean; applied: boolean };
}

/**
 * What a response must say about the filters (spec section 5: a filter that
 * does not apply is reported, never silently ignored). Every indicator
 * response includes this under `filters`.
 *
 * `abcClass` counts as applied: the indicator selects from the computed
 * classes (ADR 0002).
 */
export function describeFilters(
  filters: Filters,
  source: Source,
): FilterReport {
  const applied: FilterName[] = [];
  const notApplied: FilterReport['notApplied'] = [];
  const set = (name: FilterName, applies: boolean, reason: string) => {
    if (filters[name] === undefined) return;
    if (applies) applied.push(name);
    else notApplied.push({ filter: name, reason });
  };

  const orders = source === 'customer_order';
  set('from', true, '');
  set('to', true, '');
  set('abcClass', true, '');
  set('reference', true, '');
  set('operator', true, '');
  set(
    'customer',
    orders,
    'Picking_Wave has no customer; picks are not tied to orders',
  );
  set('aisle', !orders, 'Aisle exists only in Picking_Wave');

  return {
    applied,
    notApplied,
    excludeDuplicates: {
      requested: filters.excludeDuplicates,
      applied: filters.excludeDuplicates && orders,
    },
  };
}
