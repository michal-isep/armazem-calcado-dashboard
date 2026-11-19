// Server-side API client. Only Server Components and Route Handlers import
// this: API_URL is read on the server and never reaches the browser, which
// only talks to Next.js (spec section 7).

import { filtersToQuery, type FilterName, type FilterValues } from './filters';

export interface FilterOptions {
  period: { from: string; to: string } | null;
  abcClasses: ('A' | 'B' | 'C')[];
  references: string[];
  customers: string[];
  operators: string[];
  aisles: string[];
}

/** The `filters` block every indicator response carries. */
export interface FilterReport {
  applied: FilterName[];
  notApplied: { filter: FilterName; reason: string }[];
  excludeDuplicates: { requested: boolean; applied: boolean };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, query = ''): Promise<T> {
  const base = process.env.API_URL;
  if (!base) throw new ApiError('API_URL is not set');
  const url = `${base}${path}${query ? `?${query}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new ApiError('API unreachable');
  }
  if (!res.ok) {
    throw new ApiError(`API answered ${res.status} for ${path}`, res.status);
  }
  return (await res.json()) as T;
}

export function getFilterOptions(): Promise<FilterOptions> {
  return get<FilterOptions>('/filters/options');
}

/** An indicator endpoint, e.g. `/indicators/order-size`, with the filters. */
export function fetchIndicator<T>(
  path: string,
  filters: FilterValues,
): Promise<T & { filters: FilterReport }> {
  return get(path, filtersToQuery(filters));
}
