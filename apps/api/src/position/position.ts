// X7 picks by shelf position and X8 location coverage (spec section 2,
// ADR 0008, 0009, 0010). Pure functions with no Nest or database imports.
//
// A pick is placed in the layout when its location is in Storage_Location.
// Position is shown as bands along the y axis and as shelf level z: proxies,
// never a distance to the dock (the files do not say where it is).

import { PICK_CLASSES, type Count, type PickClass } from '../aisle/aisle.js';
import type { AbcClass } from '../filters/filters.js';

/** y runs 0 to 1,440 in the file: six bands of 240, the last one closed. */
export const Y_BAND_SIZE = 240;
export const Y_BAND_COUNT = 6;

export const POSITION_LABEL = 'proxy, not distance';
export const POSITION_NOTE =
  'Bands are positions along the y axis of the layout and levels are shelf heights. The files do not say where the dock or packing area is, so this is not a distance. Only picks at locations with coordinates are shown (ADR 0009, 0010).';
export const COVERAGE_NOTE =
  'A pick has coordinates when its location is in Storage_Location. Codes without coordinates are not shelf locations in any supplied file; they are reported here and never dropped or placed by guess (ADR 0009).';

export interface PositionRow {
  band: number;
  level: number;
  reference: string;
  picks: number;
  units: number;
}

export interface PositionEntry extends Count {
  /** Share of the picks that have coordinates, 0-100; null without picks. */
  sharePercent: number | null;
  byClass: Record<PickClass, Count>;
}

export interface BandEntry extends PositionEntry {
  band: number;
  /** y from (inclusive) and to (exclusive; the last band includes its end). */
  yFrom: number;
  yTo: number;
}

export interface LevelEntry extends PositionEntry {
  level: number;
}

export interface ShelfPosition {
  totals: Count;
  bands: BandEntry[];
  levels: LevelEntry[];
}

export interface CoverageRow {
  aisle: string;
  location: string;
  reference: string;
  hasCoordinates: boolean;
  picks: number;
  units: number;
}

export interface CoverageGroup extends Count {
  sharePercent: number | null;
}

export interface UncoveredLocation extends Count {
  location: string;
  aisle: string;
  /** Share of all selected picks, 0-100. */
  sharePercent: number | null;
}

export interface AisleCoverage {
  aisle: string;
  picks: number;
  picksWithoutCoordinates: number;
  /** Picks without coordinates / picks of the aisle, 0-100. */
  sharePercentWithout: number | null;
}

export interface LocationCoverage {
  totals: Count;
  withCoordinates: CoverageGroup;
  withoutCoordinates: CoverageGroup;
  /** The codes without coordinates with the most picks, most first. */
  topWithoutCoordinates: UncoveredLocation[];
  /** Aisles that have picks without coordinates, most such picks first. */
  aislesAffected: AisleCoverage[];
}

const empty = (): Count => ({ picks: 0, units: 0 });
const share = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : null;
const emptyByClass = () =>
  Object.fromEntries(PICK_CLASSES.map((c) => [c, empty()])) as Record<
    PickClass,
    Count
  >;

export const TOP_WITHOUT = 10;

/**
 * Groups picks with coordinates by y band and by level, each split by ABC
 * class. `classOf` maps a reference to its class from the date range (ADR
 * 0002); a reference without one is `unclassified`. With `onlyClass`, only
 * picks of that class are kept.
 */
export function summarisePosition(
  rows: PositionRow[],
  classOf: ReadonlyMap<string, AbcClass>,
  onlyClass?: AbcClass,
): ShelfPosition {
  const totals = empty();
  const bands: BandEntry[] = Array.from(
    { length: Y_BAND_COUNT },
    (_, band) => ({
      band,
      yFrom: band * Y_BAND_SIZE,
      yTo: (band + 1) * Y_BAND_SIZE,
      ...empty(),
      sharePercent: null,
      byClass: emptyByClass(),
    }),
  );
  const levels = new Map<number, LevelEntry>();

  for (const row of rows) {
    const cls: PickClass = classOf.get(row.reference) ?? 'unclassified';
    if (onlyClass && cls !== onlyClass) continue;
    const band = bands[Math.min(Math.max(row.band, 0), Y_BAND_COUNT - 1)];
    let level = levels.get(row.level);
    if (!level) {
      level = {
        level: row.level,
        ...empty(),
        sharePercent: null,
        byClass: emptyByClass(),
      };
      levels.set(row.level, level);
    }
    for (const target of [
      band,
      band.byClass[cls],
      level,
      level.byClass[cls],
      totals,
    ]) {
      target.picks += row.picks;
      target.units += row.units;
    }
  }

  return {
    totals,
    bands: bands.map((b) => ({
      ...b,
      sharePercent: share(b.picks, totals.picks),
    })),
    levels: [...levels.values()]
      .sort((a, b) => a.level - b.level)
      .map((l) => ({ ...l, sharePercent: share(l.picks, totals.picks) })),
  };
}

/**
 * Splits picks into those with and without coordinates (ADR 0009). With
 * `onlyClass`, only picks of references of that class are kept.
 */
export function summariseCoverage(
  rows: CoverageRow[],
  classOf: ReadonlyMap<string, AbcClass> = new Map(),
  onlyClass?: AbcClass,
): LocationCoverage {
  const totals = empty();
  const withC = empty();
  const withoutC = empty();
  const without: UncoveredLocation[] = [];
  const aisles = new Map<string, AisleCoverage>();

  const perLocation = new Map<string, UncoveredLocation>();
  for (const r of rows) {
    if (onlyClass && classOf.get(r.reference) !== onlyClass) continue;
    totals.picks += r.picks;
    totals.units += r.units;
    const target = r.hasCoordinates ? withC : withoutC;
    target.picks += r.picks;
    target.units += r.units;

    let a = aisles.get(r.aisle);
    if (!a) {
      a = {
        aisle: r.aisle,
        picks: 0,
        picksWithoutCoordinates: 0,
        sharePercentWithout: null,
      };
      aisles.set(r.aisle, a);
    }
    a.picks += r.picks;
    if (!r.hasCoordinates) {
      a.picksWithoutCoordinates += r.picks;
      let w = perLocation.get(r.location);
      if (!w) {
        w = {
          location: r.location,
          aisle: r.aisle,
          ...empty(),
          sharePercent: null,
        };
        perLocation.set(r.location, w);
        without.push(w);
      }
      w.picks += r.picks;
      w.units += r.units;
    }
  }

  return {
    totals,
    withCoordinates: {
      ...withC,
      sharePercent: share(withC.picks, totals.picks),
    },
    withoutCoordinates: {
      ...withoutC,
      sharePercent: share(withoutC.picks, totals.picks),
    },
    topWithoutCoordinates: without
      .sort((x, y) => y.picks - x.picks || (x.location < y.location ? -1 : 1))
      .slice(0, TOP_WITHOUT)
      .map((w) => ({ ...w, sharePercent: share(w.picks, totals.picks) })),
    aislesAffected: [...aisles.values()]
      .filter((a) => a.picksWithoutCoordinates > 0)
      .map((a) => ({
        ...a,
        sharePercentWithout: share(a.picksWithoutCoordinates, a.picks),
      }))
      .sort(
        (x, y) =>
          y.picksWithoutCoordinates - x.picksWithoutCoordinates ||
          (x.aisle < y.aisle ? -1 : 1),
      ),
  };
}
