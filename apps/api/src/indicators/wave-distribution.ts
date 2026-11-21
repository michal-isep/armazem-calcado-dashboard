// X6 wave size distribution and waves per split order (spec section 2).
// Pure functions with no Nest or database imports.
//
// The average M3 hides the spread: this shows how many waves carry 1, 2-3,
// 4-5, 6-10 or more than 10 distinct orders, and how many waves the split
// orders (X2) are spread over. It uses the same counts as M3 and X2, so the
// totals agree with them.

export interface SizeBucket {
  label: string;
  /** Inclusive; `max` is null for the open last bucket. */
  min: number;
  max: number | null;
}

export const SIZE_BUCKETS: readonly SizeBucket[] = [
  { label: '1 order', min: 1, max: 1 },
  { label: '2 to 3 orders', min: 2, max: 3 },
  { label: '4 to 5 orders', min: 4, max: 5 },
  { label: '6 to 10 orders', min: 6, max: 10 },
  { label: 'More than 10 orders', min: 11, max: null },
];

export const SPLIT_BUCKETS: readonly SizeBucket[] = [
  { label: '2 waves', min: 2, max: 2 },
  { label: '3 waves', min: 3, max: 3 },
  { label: '4 or more waves', min: 4, max: null },
];

/** How many waves carry `size` distinct orders (or, for orders, `size` waves). */
export interface CountRow {
  size: number;
  count: number;
}

export interface WaveSizeEntry extends SizeBucket {
  waves: number;
  /** Waves in this bucket / all waves, 0-100; null without waves. */
  sharePercentOfWaves: number | null;
  /** (wave, order) pairs in these waves: how many orders they carry in total. */
  orderPlacements: number;
  /** orderPlacements / all (wave, order) pairs, 0-100. */
  sharePercentOfPlacements: number | null;
}

export interface SplitEntry extends SizeBucket {
  orders: number;
  /** Orders in this bucket / all split orders, 0-100; null without any. */
  sharePercentOfSplitOrders: number | null;
}

export interface UnitsPerWave {
  minUnits: number | null;
  maxUnits: number | null;
  /** The wave sizes (in units) shared by the most waves, most first. */
  topSizes: {
    units: number;
    waves: number;
    sharePercentOfWaves: number | null;
  }[];
}

export const TOP_UNIT_SIZES = 5;

export interface WaveDistribution {
  waves: number;
  orders: number;
  /** Distinct (wave, order) pairs, as in M3. */
  waveOrderPairs: number;
  sizes: WaveSizeEntry[];
  unitsPerWave: UnitsPerWave;
  splitOrders: {
    total: number;
    /** Split orders / all orders, 0-100 (this is X2); null without orders. */
    sharePercentOfOrders: number | null;
    byWaves: SplitEntry[];
  };
}

const share = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : null;
const inBucket = (b: SizeBucket, size: number) =>
  size >= b.min && (b.max === null || size <= b.max);

/**
 * `waveRows`: for each number of distinct orders, how many waves have it.
 * `orderRows`: for each number of waves, how many orders appear in that many.
 */
export function summariseDistribution(
  waveRows: CountRow[],
  orderRows: CountRow[],
  /** For each number of units, how many waves have exactly that many. */
  unitRows: CountRow[] = [],
): WaveDistribution {
  const waves = waveRows.reduce((s, r) => s + r.count, 0);
  const pairs = waveRows.reduce((s, r) => s + r.size * r.count, 0);
  const orders = orderRows.reduce((s, r) => s + r.count, 0);
  const split = orderRows.filter((r) => r.size > 1);
  const splitTotal = split.reduce((s, r) => s + r.count, 0);

  return {
    waves,
    orders,
    waveOrderPairs: pairs,
    sizes: SIZE_BUCKETS.map((b) => {
      const rows = waveRows.filter((r) => inBucket(b, r.size));
      const w = rows.reduce((s, r) => s + r.count, 0);
      const placements = rows.reduce((s, r) => s + r.size * r.count, 0);
      return {
        ...b,
        waves: w,
        sharePercentOfWaves: share(w, waves),
        orderPlacements: placements,
        sharePercentOfPlacements: share(placements, pairs),
      };
    }),
    unitsPerWave: {
      minUnits: unitRows.length
        ? Math.min(...unitRows.map((r) => r.size))
        : null,
      maxUnits: unitRows.length
        ? Math.max(...unitRows.map((r) => r.size))
        : null,
      topSizes: [...unitRows]
        .sort((x, y) => y.count - x.count || x.size - y.size)
        .slice(0, TOP_UNIT_SIZES)
        .map((r) => ({
          units: r.size,
          waves: r.count,
          sharePercentOfWaves: share(r.count, waves),
        })),
    },
    splitOrders: {
      total: splitTotal,
      sharePercentOfOrders: share(splitTotal, orders),
      byWaves: SPLIT_BUCKETS.map((b) => {
        const n = split
          .filter((r) => inBucket(b, r.size))
          .reduce((s, r) => s + r.count, 0);
        return {
          ...b,
          orders: n,
          sharePercentOfSplitOrders: share(n, splitTotal),
        };
      }),
    },
  };
}
