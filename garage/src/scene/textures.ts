import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace } from 'three';
import { clamp } from '../math';
import { mulberry32 } from '../random';

/** Tileable value noise on a size×size grid with `cells` lattice cells per side. */
export function valueNoise(size: number, cells: number, rand: () => number): Float32Array {
  const lattice = Float32Array.from({ length: cells * cells }, rand);
  const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** Octaves of value noise, normalized to 0..1. */
export function fbm(size: number, rand: () => number, octaves = 5, baseCells = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const layer = valueNoise(size, baseCells << octave, rand);
    for (let i = 0; i < out.length; i++) out[i] += layer[i]! * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);

/** Polished, oil-stained concrete. One tile is one floor slab; its left and bottom edges are the expansion joint. */
export function concreteMaps(size: number, seed: number): { size: number; albedo: Uint8Array; roughness: Uint8Array } {
  const rand = mulberry32(seed);
  const base = fbm(size, rand, 5, 4);
  const stains = fbm(size, rand, 3, 2);
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const joint = Math.max(2, Math.round(size / 256));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const edge = x < joint || y < joint;
      const stain = Math.max(0, stains[i]! - 0.55) * 2.2;
      const tone = 0.34 + base[i]! * 0.18 - stain * 0.16 - (edge ? 0.14 : 0);
      albedo.set([byte(tone), byte(tone), byte(tone * 1.03), 255], i * 4);
      const rough = byte(Math.max(0.05, 0.62 + base[i]! * 0.22 - stain * 0.38 + (edge ? 0.2 : 0)));
      roughness.set([rough, rough, rough, 255], i * 4); // three reads roughness from green
    }
  }
  return { size, albedo, roughness };
}

/** Grimy sheet metal with rust streaks running down from the top. */
export function streakMaps(size: number, seed: number): { size: number; albedo: Uint8Array } {
  const rand = mulberry32(seed);
  const base = fbm(size, rand, 4, 4);
  const column = Float32Array.from({ length: size }, rand);
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const streak = (column[x]! + column[(x + 1) % size]! + column[(x + size - 1) % size]!) / 3;
      const runoff = Math.max(0, streak - 0.6) * (y / size) * 1.8; // DataTexture row 0 is the bottom
      const v = 0.55 + base[i]! * 0.3 - runoff * 0.5;
      albedo.set([byte(v), byte(v * 0.95), byte(v * 0.88), 255], i * 4);
    }
  }
  return { size, albedo };
}

export function dataTexture(data: Uint8Array, size: number, srgb: boolean, repeat: [number, number]): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function garageTextures() {
  const concrete = concreteMaps(512, 1);
  const grime = streakMaps(256, 3);
  const block = concreteMaps(256, 2);
  return {
    floor: dataTexture(concrete.albedo, 512, true, [6, 6]),
    floorRoughness: dataTexture(concrete.roughness, 512, false, [6, 6]),
    wall: dataTexture(grime.albedo, 256, true, [4, 1]),
    door: dataTexture(grime.albedo, 256, true, [1, 1]),
    backWall: dataTexture(block.albedo, 256, true, [5, 1.5]),
  };
}
