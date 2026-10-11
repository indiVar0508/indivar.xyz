import { Euler, MathUtils, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HOOD_OPEN_DEG, HOOD_SECONDS, hoodAngle, stepHood } from './hood';

describe('hood', () => {
  it('lifts the front edge when opened (car faces +Z)', () => {
    const tip = new Vector3(0, 0, 1).applyEuler(new Euler(hoodAngle(1), 0, 0));
    expect(tip.y).toBeGreaterThan(0.7);
    expect(hoodAngle(1)).toBeCloseTo(-MathUtils.degToRad(HOOD_OPEN_DEG));
    expect(hoodAngle(0)).toBe(0);
  });

  it('eases monotonically', () => {
    const angles = Array.from({ length: 11 }, (_, i) => hoodAngle(i / 10));
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeLessThanOrEqual(angles[i - 1]!);
  });

  it('takes HOOD_SECONDS to open and close, instantly under reduced motion', () => {
    let p = 0;
    for (let t = 0; t < HOOD_SECONDS - 0.05; t += 1 / 60) p = stepHood(p, true, 1 / 60, false);
    expect(p).toBeLessThan(1);
    for (let i = 0; i < 10; i++) p = stepHood(p, true, 1 / 60, false);
    expect(p).toBe(1);
    expect(stepHood(1, false, 1 / 60, true)).toBe(0);
    expect(stepHood(0, true, 1 / 60, true)).toBe(1);
  });
});
