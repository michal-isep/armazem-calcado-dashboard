// X3 picks by aisle and A1 aisle share of picks (spec section 2, ADR 0006).
// Pure functions with no Nest or database imports.
//
// Aisle is the first letter of the trimmed pick location. It is a proxy, never
// Sector. Effort is the number of picks (rows of Picking_Wave); units are
// secondary.

import type { AbcClass } from '../filters/filters.js';

/** Aisles with an unknown meaning (data profile): kept in their own bucket. */
export const UNKNOWN_AISLES: readonly string[] = ['C', 'E', 'Z', 'G'];

export const PROXY_LABEL = 'proxy, not Sector';
export const UNKNOWN_AISLES_LABEL =
  'Meaning unknown: the data does not say what locations in these aisles are';
export const COVERAGE_NOTE =
  'Picking_Wave covers about 94% of ordered units (77 waves of Customer_Order are missing from it). The two files are not reconciled (ADR 0004), so aisle figures are approximate.';

/** A pick whose reference has no class in the date range. */
export type PickClass = AbcClass | 'unclassified';
export const PICK_CLASSES: readonly PickClass[] = [
  'A',
  'B',
  'C',
  'unclassified',
];

/** Picks and units grouped by aisle and reference. */
export interface PickRow {
  aisle: string;
  reference: string;
  picks: number;
  units: number;
}

export interface Count {
  picks: number;
  units: number;
}

export interface AisleEntry extends Count {
  aisle: string;
  /** A1: picks in this aisle / all selected picks, 0-100; null without picks. */
  sharePercent: number | null;
  byClass: Record<PickClass, Count>;
}

export interface ClassEntry extends Count {
  abcClass: PickClass;
  sharePercent: number | null;
}

export interface AislePicks {
  totals: Count;
  /** Aisles with a known pattern, most picks first (ties by aisle). */
  aisles: AisleEntry[];
  unknownAisles: Count & {
    label: string;
    sharePercent: number | null;
    aisles: AisleEntry[];
  };
  /** The same picks split by ABC class, over all aisles. */
  classes: ClassEntry[];
}

const empty = (): Count => ({ picks: 0, units: 0 });
const share = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : null;

/**
 * Groups picks by aisle and ABC class. `classOf` maps a reference to its class
 * from the date range (ADR 0002); a reference without one is `unclassified`.
 * With `onlyClass`, only picks of that class are kept (the abcClass filter
 * selects from the computed classes and never changes one).
 */
export function summarisePicks(
  rows: PickRow[],
  classOf: ReadonlyMap<string, AbcClass>,
  onlyClass?: AbcClass,
): AislePicks {
  const byAisle = new Map<string, AisleEntry>();
  const byClass = new Map<PickClass, Count>(
    PICK_CLASSES.map((c) => [c, empty()]),
  );
  const totals = empty();

  for (const row of rows) {
    const cls: PickClass = classOf.get(row.reference) ?? 'unclassified';
    if (onlyClass && cls !== onlyClass) continue;

    let entry = byAisle.get(row.aisle);
    if (!entry) {
      entry = {
        aisle: row.aisle,
        ...empty(),
        sharePercent: null,
        byClass: Object.fromEntries(
          PICK_CLASSES.map((c) => [c, empty()]),
        ) as Record<PickClass, Count>,
      };
      byAisle.set(row.aisle, entry);
    }
    for (const target of [
      entry,
      entry.byClass[cls],
      byClass.get(cls)!,
      totals,
    ]) {
      target.picks += row.picks;
      target.units += row.units;
    }
  }

  const entries = [...byAisle.values()]
    .map((e) => ({ ...e, sharePercent: share(e.picks, totals.picks) }))
    .sort((x, y) => y.picks - x.picks || (x.aisle < y.aisle ? -1 : 1));
  const unknown = entries.filter((e) => UNKNOWN_AISLES.includes(e.aisle));
  const unknownTotal = unknown.reduce(
    (sum, e) => ({ picks: sum.picks + e.picks, units: sum.units + e.units }),
    empty(),
  );

  return {
    totals,
    aisles: entries.filter((e) => !UNKNOWN_AISLES.includes(e.aisle)),
    unknownAisles: {
      label: UNKNOWN_AISLES_LABEL,
      ...unknownTotal,
      sharePercent: share(unknownTotal.picks, totals.picks),
      aisles: unknown,
    },
    classes: PICK_CLASSES.map((abcClass) => {
      const c = byClass.get(abcClass)!;
      return { abcClass, ...c, sharePercent: share(c.picks, totals.picks) };
    }),
  };
}
