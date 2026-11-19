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
    // Nest puts the reason in `message`; keep it so the page can show it.
    let reason = '';
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === 'string') reason = `: ${body.message}`;
    } catch {
      // Not JSON; the status is enough.
    }
    throw new ApiError(
      `API answered ${res.status} for ${path}${reason}`,
      res.status,
    );
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

export interface OrderSize {
  source: 'Customer_Order';
  orders: number;
  lines: number;
  units: number;
  m2AverageOrderSize: number | null;
  x1LinesPerOrder: number | null;
}

export interface WaveSplit {
  source: 'Customer_Order';
  orders: number;
  waves: number;
  lines: number;
  m3AverageOrdersPerWave: number | null;
  x2SplitOrdersPercent: number | null;
}

export interface SectorShare {
  sector: string;
  units: number;
  lines: number;
  orders: number;
  sharePercent: number;
}

export interface Sector {
  source: 'Product + Customer_Order';
  orders: number;
  lines: number;
  units: number;
  multiSectorOrders: number;
  m4SectorShare: SectorShare[];
  m5MultiSectorOrdersPercent: number | null;
  notInformative: boolean;
}

export interface PeriodIndicators {
  orders: number;
  lines: number;
  units: number;
  waves: number;
  m2AverageOrderSize: number | null;
  m3AverageOrdersPerWave: number | null;
  x1LinesPerOrder: number | null;
  x2SplitOrdersPercent: number | null;
}

export interface MonthIndicators extends PeriodIndicators {
  month: string; // YYYY-MM
  from: string;
  to: string;
  daysCovered: number;
  daysInMonth: number;
  partial: boolean;
}

export interface MonthlyTrend {
  source: 'Customer_Order';
  dataRange: { from: string; to: string } | null;
  months: MonthIndicators[];
  period: { from: string; to: string; days: number } | null;
  current: PeriodIndicators | null;
  comparison: {
    status: 'ok' | 'no-data';
    reason?: 'before-data-start' | 'no-matching-orders';
    from: string | null;
    to: string | null;
    indicators: PeriodIndicators | null;
  };
}

export interface DataQuality {
  customerOrder: {
    rows: number;
    excludedQuantityZero: number;
    blankSizeUnknown: number;
    exactDuplicates: number;
  };
  pickingWave: { rows: number; units: number };
  sourceDisagreement: {
    wavesInOrders: number;
    wavesInPicking: number;
    wavesMissingFromPicking: number;
    orderUnits: number;
    pickUnits: number;
    unitsDifference: number;
  };
}

export const getOrderSize = (f: FilterValues) =>
  fetchIndicator<OrderSize>('/indicators/order-size', f);
export const getWaveSplit = (f: FilterValues) =>
  fetchIndicator<WaveSplit>('/indicators/wave-split', f);
export const getSector = (f: FilterValues) =>
  fetchIndicator<Sector>('/indicators/sector', f);
export const getMonthlyTrend = (f: FilterValues) =>
  fetchIndicator<MonthlyTrend>('/indicators/monthly-trend', f);
// Whole files: the filters do not apply.
export const getDataQuality = () =>
  get<DataQuality>('/indicators/data-quality');

// Products page (M1, X4, sizes). These take the ABC basis and thresholds too.
export interface AbcReference {
  reference: string;
  rank: number;
  abcClass: 'A' | 'B' | 'C';
  lines: number;
  units: number;
  sharePercent: number;
  cumulativeBeforePercent: number;
}

export interface AbcClassSummary {
  abcClass: 'A' | 'B' | 'C';
  references: number;
  lines: number;
  units: number;
  sharePercent: number;
}

export interface Abc {
  source: 'Customer_Order';
  basis: 'lines' | 'units';
  thresholds: { a: number; b: number };
  ranked: { references: number; lines: number; units: number };
  classes: AbcClassSummary[];
  references: AbcReference[];
}

export interface AbcComparison {
  source: string;
  abccodNote: string;
  notRankedNote: string;
  summary: {
    products: number;
    compared: number;
    matches: number;
    mismatches: number;
    notRanked: number;
    matchPercent: number | null;
  };
  references: {
    reference: string;
    computedClass: 'A' | 'B' | 'C' | null;
    abccod: string;
    status: 'match' | 'mismatch' | 'not-ranked';
    rank: number | null;
    lines: number;
    units: number;
  }[];
}

export interface AbcSizes {
  source: 'Customer_Order';
  reference: string;
  basis: 'lines' | 'units';
  lines: number;
  units: number;
  sizes: { size: string; lines: number; units: number; sharePercent: number }[];
}

export const getAbc = (query: string) =>
  get<Abc & { filters: FilterReport }>('/indicators/abc', query);
export const getAbcComparison = (query: string) =>
  get<AbcComparison & { filters: FilterReport }>(
    '/indicators/abc-comparison',
    query,
  );
export const getAbcSizes = (query: string) =>
  get<AbcSizes & { filters: FilterReport }>('/indicators/abc/sizes', query);
export interface WaveListEntry {
  waveNumber: string;
  orders: number;
  lines: number;
  units: number;
  firstCreatedAt: string; // YYYY-MM-DDTHH:MM:SS
  lastCreatedAt: string;
}

export interface WaveList {
  source: 'Customer_Order';
  filters: FilterReport;
  total: number;
  page: number;
  pageSize: number;
  sort: 'waveNumber' | 'firstCreatedAt';
  order: 'asc' | 'desc';
  waves: WaveListEntry[];
  note: string;
}

/** Paging values as given in the URL; the API validates them (400). */
export interface WavePaging {
  page?: string;
  sort?: string;
  order?: string;
}

export function getWaveList(filters: FilterValues, paging: WavePaging) {
  const q = new URLSearchParams(filtersToQuery(filters));
  for (const [name, value] of Object.entries(paging)) {
    if (value) q.set(name, value);
  }
  return get<WaveList>('/waves', q.toString());
}

// Wave detail (issue #15). Mirrors WaveDetail in apps/api/src/waves/waves.service.ts.
export interface WaveOrderEntry {
  orderNumber: string;
  customer: string;
  createdAt: string;
  /** Null when the order's lines in this wave have different operators. */
  operator: string | null;
  operators: string[];
  lines: number;
  units: number;
  items: { reference: string; size: string; quantity: number }[];
}

export interface WavePick {
  reference: string;
  size: string;
  quantity: number;
  location: string;
  aisle: string;
  operator: string;
}

export interface WaveUnitCheck {
  status: 'match' | 'mismatch' | 'not-comparable';
  orderUnits: number;
  pickUnits: number;
  /** Picking_Wave units minus Customer_Order units; null if not comparable. */
  difference: number | null;
  note: string;
}

export interface WaveDetail {
  waveNumber: string;
  orders: {
    source: 'Customer_Order';
    inFile: boolean;
    totals: { orders: number; lines: number; units: number };
    orders: WaveOrderEntry[];
    note: string | null;
  };
  picks: {
    source: 'Picking_Wave';
    inFile: boolean;
    totals: { picks: number; units: number };
    picks: WavePick[];
    note: string | null;
  };
  unitCheck: WaveUnitCheck;
  coverageNote: string;
  linkNote: string;
  filters: {
    excludeDuplicates: { requested: boolean; appliesTo: string };
    notApplied: { filter: FilterName; reason: string }[];
  };
}

/** Only the duplicates toggle applies to a wave; the API ignores the rest. */
export function getWaveDetail(waveNumber: string, filters: FilterValues) {
  return get<WaveDetail>(
    `/waves/${encodeURIComponent(waveNumber)}`,
    filtersToQuery(filters),
  );
}
