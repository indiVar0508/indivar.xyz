import { describe, expect, it } from 'vitest';
import { bankOf, cylinderLayout, displacementCc, P60 } from './geometry';

describe('P60B40 geometry', () => {
  it('reproduces the verified displacement from bore and stroke', () => {
    expect(Math.round(displacementCc(P60.boreMm, P60.strokeMm, P60.cylinders))).toBe(3997);
  });

  it('lays out eight cylinders, four per bank, banks 90° apart', () => {
    const cylinders = cylinderLayout();
    expect(cylinders).toHaveLength(8);
    expect(cylinders.filter((c) => c.bank === 'right')).toHaveLength(4);
    const right = cylinders.find((c) => c.bank === 'right')!.axis;
    const left = cylinders.find((c) => c.bank === 'left')!.axis;
    expect(right[0] * left[0] + right[1] * left[1] + right[2] * left[2]).toBeCloseTo(0);
  });

  it('never overlaps neighbouring bores', () => {
    const cylinders = cylinderLayout();
    for (const bank of ['right', 'left'] as const) {
      const zs = cylinders.filter((c) => c.bank === bank).map((c) => c.center[2]);
      for (let i = 1; i < zs.length; i++) expect(Math.abs(zs[i]! - zs[i - 1]!)).toBeGreaterThan(P60.boreMm / 1000);
    }
  });

  it('alternates banks along the firing order', () => {
    const banks = P60.firingOrder.map(bankOf);
    for (let i = 1; i < banks.length; i++) expect(banks[i]).not.toBe(banks[i - 1]);
  });
});
