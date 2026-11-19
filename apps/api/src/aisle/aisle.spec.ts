import type { AbcClass } from '../filters/filters.js';
import { summarisePicks, type PickRow } from './aisle.js';

const classes = new Map<string, AbcClass>([
  ['P', 'A'],
  ['S', 'B'],
  ['T', 'C'],
]);

// Picks grouped by aisle and reference. X has no class (not ordered).
const rows: PickRow[] = [
  { aisle: 'H', reference: 'P', picks: 3, units: 6 },
  { aisle: 'H', reference: 'T', picks: 1, units: 1 },
  { aisle: 'H', reference: 'X', picks: 1, units: 1 },
  { aisle: 'I', reference: 'P', picks: 1, units: 1 },
  { aisle: 'I', reference: 'S', picks: 1, units: 3 },
  { aisle: 'C', reference: 'P', picks: 1, units: 1 },
  { aisle: 'Z', reference: 'S', picks: 1, units: 1 },
];

describe('summarisePicks', () => {
  it('counts picks and units per aisle, most picks first, with A1 shares', () => {
    const r = summarisePicks(rows, classes);
    expect(r.totals).toEqual({ picks: 9, units: 14 });
    expect(r.aisles.map((a) => [a.aisle, a.picks, a.units])).toEqual([
      ['H', 5, 8],
      ['I', 2, 4],
    ]);
    expect(r.aisles[0]!.sharePercent).toBeCloseTo((5 / 9) * 100);
    expect(r.aisles[1]!.sharePercent).toBeCloseTo((2 / 9) * 100);
  });

  it('keeps aisles C, E, Z, G in their own bucket', () => {
    const r = summarisePicks(rows, classes);
    expect(r.aisles.map((a) => a.aisle)).not.toContain('C');
    expect(r.unknownAisles.aisles.map((a) => a.aisle)).toEqual(['C', 'Z']);
    expect(r.unknownAisles).toMatchObject({ picks: 2, units: 2 });
    expect(r.unknownAisles.sharePercent).toBeCloseTo((2 / 9) * 100);
    expect(r.unknownAisles.label).toMatch(/unknown/);
  });

  it('splits each aisle by ABC class, with unclassified references apart', () => {
    const h = summarisePicks(rows, classes).aisles[0]!;
    expect(h.byClass).toEqual({
      A: { picks: 3, units: 6 },
      B: { picks: 0, units: 0 },
      C: { picks: 1, units: 1 },
      unclassified: { picks: 1, units: 1 },
    });
    const byClass = summarisePicks(rows, classes).classes;
    expect(byClass.map((c) => [c.abcClass, c.picks])).toEqual([
      ['A', 5],
      ['B', 2],
      ['C', 1],
      ['unclassified', 1],
    ]);
  });

  it('abcClass selects picks of that class and keeps the shares over them', () => {
    const r = summarisePicks(rows, classes, 'A');
    expect(r.totals).toEqual({ picks: 5, units: 8 });
    expect(r.aisles.map((a) => [a.aisle, a.picks])).toEqual([
      ['H', 3],
      ['I', 1],
    ]);
    expect(r.unknownAisles.picks).toBe(1);
  });

  it('returns empty lists and null shares when there are no picks', () => {
    const r = summarisePicks([], classes);
    expect(r.totals).toEqual({ picks: 0, units: 0 });
    expect(r.aisles).toEqual([]);
    expect(r.unknownAisles).toMatchObject({
      picks: 0,
      sharePercent: null,
      aisles: [],
    });
    expect(r.classes.every((c) => c.sharePercent === null)).toBe(true);
  });
});
