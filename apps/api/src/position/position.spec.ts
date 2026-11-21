import {
  summariseCoverage,
  summarisePosition,
  type CoverageRow,
  type PositionRow,
} from './position.js';

const classOf = new Map<string, 'A' | 'B' | 'C'>([
  ['P', 'A'],
  ['S', 'B'],
]);

describe('summarisePosition', () => {
  const rows: PositionRow[] = [
    { band: 0, level: 1, reference: 'P', picks: 3, units: 6 },
    { band: 1, level: 2, reference: 'S', picks: 1, units: 3 },
    { band: 6, level: 1, reference: 'X', picks: 1, units: 1 }, // y = 1,440
  ];

  it('always returns six bands, shares and classes, and puts y = 1,440 in the last band', () => {
    const r = summarisePosition(rows, classOf);
    expect(r.totals).toEqual({ picks: 5, units: 10 });
    expect(r.bands).toHaveLength(6);
    expect(r.bands.map((b) => b.picks)).toEqual([3, 1, 0, 0, 0, 1]);
    expect(r.bands[5].byClass.unclassified).toEqual({ picks: 1, units: 1 });
    expect(r.bands[0].sharePercent).toBeCloseTo(60);
    expect(r.bands[2].sharePercent).toBeCloseTo(0);
    expect(r.bands[5].yFrom).toBe(1200);
    expect(r.bands[5].yTo).toBe(1440);
  });

  it('groups by level, sorted, with the same totals', () => {
    const r = summarisePosition(rows, classOf);
    expect(r.levels.map((l) => [l.level, l.picks, l.units])).toEqual([
      [1, 4, 7],
      [2, 1, 3],
    ]);
    expect(r.levels[0].byClass.A).toEqual({ picks: 3, units: 6 });
  });

  it('keeps only one class when asked, without changing a class', () => {
    const r = summarisePosition(rows, classOf, 'A');
    expect(r.totals).toEqual({ picks: 3, units: 6 });
    expect(r.bands[0].sharePercent).toBeCloseTo(100);
  });

  it('has no share without picks', () => {
    const r = summarisePosition([], classOf);
    expect(r.totals).toEqual({ picks: 0, units: 0 });
    expect(r.bands.every((b) => b.sharePercent === null)).toBe(true);
    expect(r.levels).toEqual([]);
  });
});

describe('summariseCoverage', () => {
  const row = (
    aisle: string,
    location: string,
    reference: string,
    hasCoordinates: boolean,
    picks: number,
    units: number,
  ): CoverageRow => ({
    aisle,
    location,
    reference,
    hasCoordinates,
    picks,
    units,
  });
  const rows: CoverageRow[] = [
    row('H', 'H-06-13', 'P', true, 3, 6),
    row('R', 'RC-01', 'P', false, 4, 4),
    row('R', 'RC-01', 'S', false, 2, 2),
    row('H', 'H-06-16', 'X', false, 1, 1),
  ];

  it('splits picks with and without coordinates', () => {
    const r = summariseCoverage(rows);
    expect(r.totals).toEqual({ picks: 10, units: 13 });
    expect(r.withCoordinates).toMatchObject({ picks: 3, units: 6 });
    expect(r.withCoordinates.sharePercent).toBeCloseTo(30);
    expect(r.withoutCoordinates).toMatchObject({ picks: 7, units: 7 });
    expect(r.withoutCoordinates.sharePercent).toBeCloseTo(70);
  });

  it('merges a location across references and ranks the codes without coordinates', () => {
    const r = summariseCoverage(rows);
    expect(r.topWithoutCoordinates.map((w) => [w.location, w.picks])).toEqual([
      ['RC-01', 6],
      ['H-06-16', 1],
    ]);
    expect(r.topWithoutCoordinates[0].sharePercent).toBeCloseTo(60);
  });

  it('shows how much of each aisle lacks coordinates', () => {
    const r = summariseCoverage(rows);
    expect(r.aislesAffected).toEqual([
      {
        aisle: 'R',
        picks: 6,
        picksWithoutCoordinates: 6,
        sharePercentWithout: 100,
      },
      {
        aisle: 'H',
        picks: 4,
        picksWithoutCoordinates: 1,
        sharePercentWithout: 25,
      },
    ]);
  });

  it('keeps only one class when asked', () => {
    const r = summariseCoverage(rows, classOf, 'B');
    expect(r.totals).toEqual({ picks: 2, units: 2 });
    expect(r.withCoordinates.picks).toBe(0);
  });
});
