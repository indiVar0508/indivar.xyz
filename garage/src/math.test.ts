import { describe, expect, it } from 'vitest';
import { add, clamp, dot, length, normalize, scale, smoothstep, sub } from './math';
import { mulberry32 } from './random';

describe('math', () => {
  it('does vector arithmetic', () => {
    expect(add([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(length([3, 4, 0])).toBe(5);
    expect(normalize([0, 0, 2])).toEqual([0, 0, 1]);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('clamps and smooths', () => {
    expect(clamp(2, 0, 1)).toBe(1);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('makes repeatable random numbers in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
