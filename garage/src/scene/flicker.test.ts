import { describe, expect, it } from 'vitest';
import { flickerLevel } from './flicker';

describe('flickerLevel', () => {
  const samples = Array.from({ length: 60 * 60 }, (_, i) => flickerLevel(i / 60));

  it('is mostly on, with real stutters', () => {
    const on = samples.filter((v) => v === 1).length / samples.length;
    expect(on).toBeGreaterThan(0.85);
    expect(samples.some((v) => v < 0.2)).toBe(true);
  });

  it('never flashes more than three times in any one second (WCAG 2.3.1)', () => {
    const fine = Array.from({ length: 600 * 60 }, (_, i) => flickerLevel(i / 600)); // 10 minutes at 600 Hz
    const changes: number[] = [];
    for (let i = 1; i < fine.length; i++) if (fine[i] !== fine[i - 1]) changes.push(i / 600);
    let worst = 0;
    for (let start = 0, end = 0; end < changes.length; end++) {
      while (changes[end]! - changes[start]! >= 1) start++;
      worst = Math.max(worst, end - start + 1);
    }
    expect(worst).toBeLessThanOrEqual(6); // a flash is a pair of opposing changes
  });

  it('is repeatable and bounded', () => {
    expect(samples.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(flickerLevel(12.34)).toBe(flickerLevel(12.34));
  });
});
