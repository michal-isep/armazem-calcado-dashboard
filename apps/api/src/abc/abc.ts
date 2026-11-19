// M1 ABC classification (spec section 2, ADR 0001 and 0002). Pure functions
// with no Nest or database imports.
//
// Sort descending by the basis, tie-break by reference ascending. A reference
// is A if the cumulative share *before* it is below thresholdA, B if below
// thresholdB, otherwise C.

import type { AbcClass } from '../filters/filters.js';

export type AbcBasis = 'lines' | 'units';

export interface AbcThresholds {
  a: number;
  b: number;
}

export const DEFAULT_THRESHOLDS: AbcThresholds = { a: 80, b: 95 };

export class AbcParamError extends Error {}

export interface AbcInput {
  reference: string;
  lines: number;
  units: number;
}

export interface AbcRow extends AbcInput {
  rank: number;
  abcClass: AbcClass;
  /** Share of the active basis, 0-100. */
  sharePercent: number;
  /** Cumulative share of the references ranked before this one, 0-100. */
  cumulativeBeforePercent: number;
}

export function parseAbcParams(query: Record<string, unknown>): {
  basis: AbcBasis;
  thresholds: AbcThresholds;
} {
  const text = (name: string) => {
    const v = query[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') {
      throw new AbcParamError(`${name} must be given once, as text`);
    }
    const t = v.trim();
    return t === '' ? undefined : t;
  };

  const basis = text('basis') ?? 'lines';
  if (basis !== 'lines' && basis !== 'units') {
    throw new AbcParamError('basis must be lines or units');
  }

  const number = (name: string, fallback: number) => {
    const t = text(name);
    if (t === undefined) return fallback;
    const n = Number(t);
    if (!Number.isFinite(n))
      throw new AbcParamError(`${name} must be a number`);
    return n;
  };
  const a = number('thresholdA', DEFAULT_THRESHOLDS.a);
  const b = number('thresholdB', DEFAULT_THRESHOLDS.b);
  if (!(a > 0 && a < b && b <= 100)) {
    throw new AbcParamError(
      'thresholds must satisfy 0 < thresholdA < thresholdB <= 100',
    );
  }
  return { basis, thresholds: { a, b } };
}

export function classify(
  inputs: AbcInput[],
  basis: AbcBasis,
  thresholds: AbcThresholds = DEFAULT_THRESHOLDS,
): AbcRow[] {
  const sorted = inputs
    .filter((r) => r[basis] > 0)
    .sort(
      (x, y) =>
        y[basis] - x[basis] ||
        (x.reference < y.reference ? -1 : x.reference > y.reference ? 1 : 0),
    );
  const total = sorted.reduce((sum, r) => sum + r[basis], 0);

  let before = 0;
  return sorted.map((r, i) => {
    // Compared as before * 100 < threshold * total to avoid dividing first.
    const abcClass: AbcClass =
      before * 100 < thresholds.a * total
        ? 'A'
        : before * 100 < thresholds.b * total
          ? 'B'
          : 'C';
    const row: AbcRow = {
      ...r,
      rank: i + 1,
      abcClass,
      sharePercent: (r[basis] / total) * 100,
      cumulativeBeforePercent: (before / total) * 100,
    };
    before += r[basis];
    return row;
  });
}
