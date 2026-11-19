// Filters for the indicators computed on customer_order_line. Thin layer over
// the shared filters in `../filters/filters.ts` (issue #13), which stay the
// authority for parsing and SQL.

import {
  FilterError,
  buildWhere,
  describeFilters,
  parseFilters,
  type FilterReport,
  type Filters,
} from '../filters/filters.js';

export type OrderFilters = Filters;
export type RawQuery = Record<string, string | string[] | undefined>;
export { FilterError as InvalidFilterError };

export function parseOrderFilters(query: RawQuery): OrderFilters {
  return parseFilters(query);
}

// WHERE conditions on customer_order_line, without the `WHERE` keyword.
// Quantity-0 lines are always excluded; duplicates only when the toggle is on
// (spec section 4).
export function orderFilterSql(filters: OrderFilters): {
  where: string;
  params: unknown[];
} {
  const { sql, params } = buildWhere(filters, 'customer_order');
  return { where: sql.replace(/^WHERE /, ''), params };
}

// What each response says about the filters (spec section 5). The ABC class
// filter is reported as not applied until M1 exists (issue #7): the shared
// report counts it as applied because it selects from the computed classes.
// Delete the override when #7 adds that filter to these endpoints.
export function describeOrderFilters(filters: OrderFilters): FilterReport {
  const report = describeFilters(filters, 'customer_order');
  if (filters.abcClass === undefined) return report;
  return {
    ...report,
    applied: report.applied.filter((name) => name !== 'abcClass'),
    notApplied: [
      ...report.notApplied,
      {
        filter: 'abcClass',
        reason: 'ABC classes are not available yet (issue #7)',
      },
    ],
  };
}
