import { describe, expect, it } from 'vitest';
import { concreteMaps, fbm, streakMaps } from './textures';
import { mulberry32 } from '../random';

const mean = (data: Uint8Array, channel = 0) => {
  let sum = 0;
  for (let i = channel; i < data.length; i += 4) sum += data[i]!;
  return sum / (data.length / 4) / 255;
};

describe('procedural textures', () => {
  it('fbm stays within 0..1 and is repeatable', () => {
    const a = fbm(64, mulberry32(3));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(fbm(64, mulberry32(3))).toEqual(a);
  });

  it('concrete is repeatable per seed and different across seeds', () => {
    expect(concreteMaps(64, 1).albedo).toEqual(concreteMaps(64, 1).albedo);
    expect(concreteMaps(64, 1).albedo).not.toEqual(concreteMaps(64, 2).albedo);
  });

  it('concrete looks like polished concrete with darker joints', () => {
    const { albedo, roughness, size } = concreteMaps(128, 1);
    expect(mean(albedo)).toBeGreaterThan(0.2);
    expect(mean(albedo)).toBeLessThan(0.55);
    expect(mean(roughness, 1)).toBeGreaterThan(0.4);
    expect(mean(roughness, 1)).toBeLessThan(0.95);
    const joint = albedo[(64 * size + 0) * 4]!;
    const slab = albedo[(64 * size + 64) * 4]!;
    expect(joint).toBeLessThan(slab + 1);
  });

  it('wall grime has the requested size', () => {
    expect(streakMaps(32, 4).albedo).toHaveLength(32 * 32 * 4);
  });
});
