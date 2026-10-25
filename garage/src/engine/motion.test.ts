import { describe, expect, it } from 'vitest';
import { butterflyAngle, crankTurn, MAX_SPIN, SLOW_MOTION, slowStep, spinStep, wheelTurn } from './motion';

describe('motion', () => {
  it('slows the x-ray so idle takes seconds per cycle', () => {
    const secondsPerCycle = 720 / slowStep(1500, 1);
    expect(secondsPerCycle).toBeGreaterThan(2);
    expect(secondsPerCycle).toBeLessThan(6);
  });

  it('spins pulleys at their belt ratio until they would strobe, then holds them at the cap', () => {
    expect(spinStep(30, 2, 1)).toBe(360);
    expect(spinStep(1500, 2.2, 1)).toBe(MAX_SPIN);
    expect(spinStep(0, 2, 1)).toBe(0);
  });

  it('turns the wheels slowed with the x-ray, and outside it at their real speed until they would strobe', () => {
    expect(wheelTurn(10, 1, true)).toBeCloseTo(10 / SLOW_MOTION, 9);
    expect(wheelTurn(3, 1, false)).toBe(3);
    expect(wheelTurn(200, 1, false)).toBeCloseTo((MAX_SPIN * Math.PI) / 180, 9);
    expect(crankTurn(1500, 1)).toBeCloseTo((slowStep(1500, 1) * Math.PI) / 180, 9);
  });

  it('opens the butterflies from nearly shut to wide open with load', () => {
    expect(butterflyAngle(0)).toBeGreaterThan(0);
    expect(butterflyAngle(0)).toBeLessThan(10);
    expect(butterflyAngle(1)).toBe(90);
    expect(butterflyAngle(2)).toBe(90);
  });
});
