import { describe, expect, it } from 'vitest';
import { flickerLevel } from './flicker';

describe('flickerLevel', () => {
  const samples = Array.from({ length: 60 * 60 }, (_, i) => flickerLevel(i / 60));

  it('is mostly on, with real stutters', () => {
    const on = samples.filter((v) => v === 1).length / samples.length;
    expect(on).toBeGreaterThan(0.85);
    expect(samples.some((v) => v < 0.2)).toBe(true);
  });

  it('is repeatable and bounded', () => {
    expect(samples.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(flickerLevel(12.34)).toBe(flickerLevel(12.34));
  });
});
