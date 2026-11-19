// State of the Products page that is not a global filter: the ABC basis and
// thresholds (sent to the API) and the drill-down position (page only). All of
// it lives in the URL query string, next to the global filters.

import { filtersToQuery, type FilterValues } from './filters';

export type Basis = 'lines' | 'units';
export type AbcClass = 'A' | 'B' | 'C';

export const DEFAULT_THRESHOLDS = { a: 80, b: 95 } as const;

export interface AbcView {
  basis: Basis;
  thresholdA: number;
  thresholdB: number;
  /** Drill-down level 2: references of this class. */
  drillClass?: AbcClass;
  /** Drill-down level 3: sizes of this reference. */
  drillRef?: string;
}

type RawParams = Record<string, string | string[] | undefined>;

/** Same rule as the API: 0 < A < B <= 100. */
export function validThresholds(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && 0 < a && a < b && b <= 100;
}

const one = (v: string | string[] | undefined) =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/**
 * Read the page state. An invalid value falls back to the default and is
 * listed in `ignored`, so the page can say so instead of changing silently.
 */
export function viewFromSearchParams(raw: RawParams): {
  view: AbcView;
  ignored: string[];
} {
  const ignored: string[] = [];
  const view: AbcView = {
    basis: 'lines',
    thresholdA: DEFAULT_THRESHOLDS.a,
    thresholdB: DEFAULT_THRESHOLDS.b,
  };

  const basis = one(raw.basis);
  if (basis === 'lines' || basis === 'units') view.basis = basis;
  else if (basis !== undefined) ignored.push(`basis "${basis}"`);

  const a = one(raw.thresholdA);
  const b = one(raw.thresholdB);
  if (a !== undefined || b !== undefined) {
    const na = a === undefined ? DEFAULT_THRESHOLDS.a : Number(a);
    const nb = b === undefined ? DEFAULT_THRESHOLDS.b : Number(b);
    if (validThresholds(na, nb)) {
      view.thresholdA = na;
      view.thresholdB = nb;
    } else ignored.push(`thresholds ${a ?? '80'}/${b ?? '95'}`);
  }

  const klass = one(raw.drillClass);
  if (klass === 'A' || klass === 'B' || klass === 'C') view.drillClass = klass;
  else if (klass !== undefined) ignored.push(`class "${klass}"`);

  const ref = one(raw.drillRef);
  if (ref !== undefined) view.drillRef = ref;
  return { view, ignored };
}

/** Query string for the API: the basis and thresholds, written out always. */
export function abcApiQuery(filters: FilterValues, view: AbcView): string {
  const q = new URLSearchParams(filtersToQuery(filters));
  q.set('basis', view.basis);
  q.set('thresholdA', String(view.thresholdA));
  q.set('thresholdB', String(view.thresholdB));
  return q.toString();
}

/** Query string for a page link: defaults are left out. */
export function viewToQuery(filters: FilterValues, view: AbcView): string {
  const q = new URLSearchParams(filtersToQuery(filters));
  if (view.basis !== 'lines') q.set('basis', view.basis);
  if (
    view.thresholdA !== DEFAULT_THRESHOLDS.a ||
    view.thresholdB !== DEFAULT_THRESHOLDS.b
  ) {
    q.set('thresholdA', String(view.thresholdA));
    q.set('thresholdB', String(view.thresholdB));
  }
  if (view.drillClass) q.set('drillClass', view.drillClass);
  if (view.drillRef) q.set('drillRef', view.drillRef);
  return q.toString();
}

export const BASIS_LABEL: Record<Basis, string> = {
  lines: 'order lines',
  units: 'units',
};
