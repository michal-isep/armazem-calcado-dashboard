// Filter state lives in the URL query string (spec section 5). The names and
// rules mirror apps/api/src/filters/filters.ts, which stays the authority:
// the API validates everything again and reports what it applied.

export const FILTER_NAMES = [
  'from',
  'to',
  'abcClass',
  'reference',
  'customer',
  'operator',
  'aisle',
  'excludeDuplicates',
] as const;

export type FilterName = (typeof FILTER_NAMES)[number];
export type Source = 'customer_order' | 'picking_wave';

/** Only the filters that are set; excludeDuplicates is present only if "true". */
export type FilterValues = Partial<Record<FilterName, string>>;

type RawParams = Record<string, string | string[] | undefined>;

export const SOURCE_LABEL: Record<Source, string> = {
  customer_order: 'Customer_Order',
  picking_wave: 'Picking_Wave',
};

/** From a page's `searchParams`. Repeated or empty values count as absent. */
export function filtersFromSearchParams(raw: RawParams): FilterValues {
  const out: FilterValues = {};
  for (const name of FILTER_NAMES) {
    const v = raw[name];
    if (typeof v !== 'string' || v.trim() === '') continue;
    out[name] = v.trim();
  }
  if (out.excludeDuplicates !== 'true') delete out.excludeDuplicates;
  return out;
}

export function filtersFromUrl(params: URLSearchParams): FilterValues {
  return filtersFromSearchParams(Object.fromEntries(params));
}

/** Query string (without `?`) with only the filter parameters. */
export function filtersToQuery(filters: FilterValues): string {
  const q = new URLSearchParams();
  for (const name of FILTER_NAMES) {
    const v = filters[name];
    if (v) q.set(name, v);
  }
  return q.toString();
}

/** Page settings that survive a filter change (Products page, issue #18). */
const KEPT_PARAMS = ['basis', 'thresholdA', 'thresholdB'] as const;

/**
 * Same URL with one filter changed; empty or null removes it. The ABC basis
 * and thresholds are kept; the drill-down position is dropped, because the
 * class or reference it points at may no longer be in the selection.
 */
export function withFilter(
  params: URLSearchParams,
  name: FilterName,
  value: string | null,
): string {
  const next = filtersFromUrl(params);
  if (value) next[name] = value;
  else delete next[name];
  const q = new URLSearchParams(filtersToQuery(next));
  for (const key of KEPT_PARAMS) {
    const v = params.get(key);
    if (v) q.set(key, v);
  }
  return q.toString();
}

/**
 * Reasons a filter does not change a card, same rules as `describeFilters`
 * in the API. Used when the card has no API report to show (or while it loads).
 */
export function notAppliedReason(
  name: FilterName,
  source: Source,
): string | null {
  const orders = source === 'customer_order';
  if (name === 'customer' && !orders) {
    return 'Picking_Wave has no customer; picks are not tied to orders';
  }
  if (name === 'aisle' && orders) return 'Aisle exists only in Picking_Wave';
  if (name === 'excludeDuplicates' && !orders) {
    return 'Picks have no duplicate flag; the toggle only affects order lines';
  }
  return null;
}

export const FILTER_LABEL: Record<FilterName, string> = {
  from: 'From',
  to: 'To',
  abcClass: 'ABC class',
  reference: 'Reference',
  customer: 'Customer',
  operator: 'Operator',
  aisle: 'Aisle',
  excludeDuplicates: 'Exclude duplicate lines',
};
