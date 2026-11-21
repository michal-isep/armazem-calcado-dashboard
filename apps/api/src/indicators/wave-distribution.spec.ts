import { summariseDistribution } from './wave-distribution.js';

// Waves: sizes 4, 1, 2, 1, 6, 11 (distinct orders per wave).
// Orders: 20 appear in one wave, one in two waves, one in three waves.
const waveRows = [
  { size: 1, count: 2 },
  { size: 2, count: 1 },
  { size: 4, count: 1 },
  { size: 6, count: 1 },
  { size: 11, count: 1 },
];
const orderRows = [
  { size: 1, count: 20 },
  { size: 2, count: 1 },
  { size: 3, count: 1 },
];

describe('summariseDistribution', () => {
  const r = summariseDistribution(waveRows, orderRows);

  it('counts waves, orders and (wave, order) pairs as M3 does', () => {
    expect(r.waves).toBe(6);
    expect(r.orders).toBe(22);
    expect(r.waveOrderPairs).toBe(25);
    expect(r.waveOrderPairs / r.waves).toBeCloseTo(25 / 6); // M3
  });

  it('puts waves in the five size buckets with their shares', () => {
    expect(r.sizes.map((b) => [b.label, b.waves, b.orderPlacements])).toEqual([
      ['1 order', 2, 2],
      ['2 to 3 orders', 1, 2],
      ['4 to 5 orders', 1, 4],
      ['6 to 10 orders', 1, 6],
      ['More than 10 orders', 1, 11],
    ]);
    expect(r.sizes[0].sharePercentOfWaves).toBeCloseTo((2 / 6) * 100);
    expect(r.sizes[4].sharePercentOfPlacements).toBeCloseTo((11 / 25) * 100);
  });

  it('counts split orders (X2) and spreads them over 2, 3 and 4 or more waves', () => {
    expect(r.splitOrders.total).toBe(2);
    expect(r.splitOrders.sharePercentOfOrders).toBeCloseTo((2 / 22) * 100); // X2
    expect(r.splitOrders.byWaves.map((b) => [b.label, b.orders])).toEqual([
      ['2 waves', 1],
      ['3 waves', 1],
      ['4 or more waves', 0],
    ]);
    expect(r.splitOrders.byWaves[0].sharePercentOfSplitOrders).toBe(50);
  });

  it('lists the most common wave sizes in units, most waves first', () => {
    const units = [
      { size: 24, count: 3 },
      { size: 25, count: 1 },
      { size: 3, count: 1 },
      { size: 30, count: 1 },
    ];
    const u = summariseDistribution(waveRows, orderRows, units).unitsPerWave;
    expect(u.minUnits).toBe(3);
    expect(u.maxUnits).toBe(30);
    expect(u.topSizes.map((t) => [t.units, t.waves])).toEqual([
      [24, 3],
      [3, 1], // ties by units, smallest first
      [25, 1],
      [30, 1],
    ]);
    expect(u.topSizes[0].sharePercentOfWaves).toBeCloseTo(50); // 3 of 6 waves
  });

  it('has no shares without data', () => {
    const e = summariseDistribution([], []);
    expect(e.waves).toBe(0);
    expect(e.sizes.every((b) => b.sharePercentOfWaves === null)).toBe(true);
    expect(e.splitOrders.sharePercentOfOrders).toBeNull();
    expect(e.splitOrders.byWaves.every((b) => b.orders === 0)).toBe(true);
    expect(e.unitsPerWave).toEqual({
      minUnits: null,
      maxUnits: null,
      topSizes: [],
    });
  });
});
