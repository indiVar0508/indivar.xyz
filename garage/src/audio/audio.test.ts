import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../random';
import { brownNoise, impulseResponse } from './noise';
import { BAR_SECONDS, CHORDS, chordAt, duckLevel, midiToHz, swell } from './schedule';

describe('schedule', () => {
  it('converts MIDI notes to pitch', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('cycles an original, mid-range progression', () => {
    expect(CHORDS).toHaveLength(4);
    for (const chord of CHORDS) for (const note of chord) expect(note).toBeGreaterThanOrEqual(40);
    expect(chordAt(0)).toBe(CHORDS[0]);
    expect(chordAt(BAR_SECONDS)).toBe(CHORDS[1]);
    expect(chordAt(BAR_SECONDS * CHORDS.length)).toBe(CHORDS[0]);
  });

  it('ducks under the visitor’s track and swells slowly', () => {
    expect(duckLevel(true)).toBeLessThan(duckLevel(false));
    expect(swell(0)).toBe(0);
    expect(swell(11.5, 23)).toBeCloseTo(1);
  });
});

describe('noise', () => {
  it('makes bounded, low-heavy brown noise', () => {
    const noise = brownNoise(48_000, mulberry32(1));
    expect(Math.max(...noise.map(Math.abs))).toBeLessThanOrEqual(1);
    let step = 0;
    for (let i = 1; i < noise.length; i++) step += Math.abs(noise[i]! - noise[i - 1]!);
    expect(step / noise.length).toBeLessThan(0.1); // white noise in [-1, 1] averages about 0.67
  });

  it('decays an impulse response by 60 dB over its length', () => {
    const ir = impulseResponse(48_000, 1, 48_000, mulberry32(2));
    const energy = (from: number, to: number) => ir.slice(from, to).reduce((sum, v) => sum + v * v, 0);
    expect(energy(43_200, 48_000)).toBeLessThan(energy(0, 4_800) * 0.001);
  });
});
