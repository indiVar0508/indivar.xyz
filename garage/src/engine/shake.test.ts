import { describe, expect, it } from 'vitest';
import { newShake, stepShake } from './shake';

const DT = 1 / 60;

describe('stepShake', () => {
  it('twists the block against the crank as it revs up, the other way as it falls, and settles', () => {
    const shake = newShake();
    stepShake(shake, 1500, true, DT);
    for (let rpm = 1500; rpm < 8000; rpm += 200) stepShake(shake, rpm, true, DT);
    expect(shake.roll).toBeGreaterThan(0.004); // counter-clockwise from the front: the crank turns clockwise
    for (let rpm = 8000; rpm > 2000; rpm -= 100) stepShake(shake, rpm, true, DT);
    expect(shake.roll).toBeLessThan(-0.002);
    for (let i = 0; i < 240; i++) stepShake(shake, 2000, true, DT);
    expect(Math.abs(shake.roll)).toBeLessThan(1e-4);
  });

  it('jitters a fraction of a millimetre while running, more at idle, and not at all when off', () => {
    const peak = (rpm: number, running: boolean) => {
      const shake = newShake();
      let most = 0;
      for (let i = 0; i < 120; i++) most = Math.max(most, ...stepShake(shake, rpm, running, DT).map(Math.abs));
      return most;
    };
    expect(peak(1500, true)).toBeGreaterThan(peak(7000, true));
    expect(peak(1500, true)).toBeLessThan(0.001);
    expect(peak(0, false)).toBe(0);
  });

  it('survives a long frame without flinging the engine', () => {
    const shake = newShake();
    stepShake(shake, 1500, true, DT);
    stepShake(shake, 8000, true, 2);
    expect(Math.abs(shake.roll)).toBeLessThan(0.05);
  });
});
