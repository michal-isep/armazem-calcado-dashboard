// X4 agreement between the computed ABC and Product.ABCCOD (spec section 2).
// Pure functions with no Nest or database imports.
//
// A product is compared only if the ranking gave it a class, i.e. it has at
// least one valid order line in the date range. A product without one has no
// computed class: it is neither a match nor a mismatch, and is reported as
// `not-ranked` and counted separately. The match percentage is over the
// compared products.

import type { AbcClass } from '../filters/filters.js';

export const ABCCOD_NOTE =
  'The origin of Product.ABCCOD is unknown: we do not know how or when it was ' +
  'produced. This compares it with our computed ABC; it does not say which ' +
  'one is right.';

export const NOT_RANKED_NOTE =
  'Products with no valid order line in the selected date range have no ' +
  'computed class. They are neither a match nor a mismatch and are not in ' +
  'the match count.';

export type ComparisonStatus = 'match' | 'mismatch' | 'not-ranked';

export interface RankedClass {
  reference: string;
  rank: number;
  abcClass: AbcClass;
  lines: number;
  units: number;
}

export interface ProductAbc {
  reference: string;
  abccod: string;
}

export interface ComparisonRow {
  reference: string;
  /** Null when the product has no valid order line in the range. */
  computedClass: AbcClass | null;
  abccod: string;
  status: ComparisonStatus;
  rank: number | null;
  lines: number;
  units: number;
}

export interface ComparisonSummary {
  /** Products selected by the filters. */
  products: number;
  /** Products with a computed class: matches + mismatches. */
  compared: number;
  matches: number;
  mismatches: number;
  /** Products with no computed class in the range. */
  notRanked: number;
  /** matches / compared, 0-100; null when nothing was compared. */
  matchPercent: number | null;
}

/** One row per product, ordered by reference. */
export function compareAbc(
  products: ProductAbc[],
  ranking: RankedClass[],
): ComparisonRow[] {
  const ranked = new Map(ranking.map((r) => [r.reference, r]));
  return [...products]
    .sort((x, y) =>
      x.reference < y.reference ? -1 : x.reference > y.reference ? 1 : 0,
    )
    .map((p) => {
      const r = ranked.get(p.reference);
      const status: ComparisonStatus = !r
        ? 'not-ranked'
        : r.abcClass === p.abccod.trim().toUpperCase()
          ? 'match'
          : 'mismatch';
      return {
        reference: p.reference,
        computedClass: r?.abcClass ?? null,
        abccod: p.abccod,
        status,
        rank: r?.rank ?? null,
        lines: r?.lines ?? 0,
        units: r?.units ?? 0,
      };
    });
}

export function summarise(rows: ComparisonRow[]): ComparisonSummary {
  const count = (s: ComparisonStatus) =>
    rows.filter((r) => r.status === s).length;
  const matches = count('match');
  const mismatches = count('mismatch');
  const compared = matches + mismatches;
  return {
    products: rows.length,
    compared,
    matches,
    mismatches,
    notRanked: count('not-ranked'),
    matchPercent: compared > 0 ? (matches / compared) * 100 : null,
  };
}
