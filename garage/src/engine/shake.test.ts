import { describe, expect, it } from 'vitest';
import { MAX_ROLL, MOUNT_STIFFNESS, newShake, stepShake } from './shake';

const DT = 1 / 60;

/** Holds the mounts' torque at `mount` N·m for `seconds`, and returns the least and most roll on the way. */
function hold(shake: ReturnType<typeof newShake>, mount: number, seconds: number, rpm = 3000): [number, number] {
  let [least, most] = [Infinity, -Infinity];
  for (let t = 0; t < seconds; t += DT) {
    stepShake(shake, rpm, mount, true, DT);
    least = Math.min(least, shake.roll);
    most = Math.max(most, shake.roll);
  }
  return [least, most];
}

describe('stepShake', () => {
  it('leans the block against the crank by the torque on its mounts, the other way under engine braking, and settles', () => {
    const shake = newShake();
    hold(shake, 430, 2);
    expect(shake.roll).toBeCloseTo(430 / MOUNT_STIFFNESS, 4); // counter-clockwise from the front: the crank turns clockwise
    hold(shake, -200, 2);
    expect(shake.roll).toBeCloseTo(-200 / MOUNT_STIFFNESS, 4);
    hold(shake, 0, 4);
    expect(Math.abs(shake.roll)).toBeLessThan(1e-4);
  });

  it('leans about a degree and a half pulling hard in a low gear, so a change can be seen', () => {
    const shake = newShake();
    hold(shake, 966, 2); // the crate's mounts, pulling at 5,000 rpm in 1st
    expect((shake.roll * 180) / Math.PI).toBeGreaterThan(1.5);
  });

  it('rocks back through a gear change, as the drive cuts, and leans again when the next gear takes it up', () => {
    const shake = newShake();
    const [, pulling] = hold(shake, 760, 2);
    const [least] = hold(shake, -300, 0.12); // spark cut and clutch open: the crank slows to the next gear's revs
    hold(shake, 760, 0.1);
    expect(least).toBeLessThan(0.6 * pulling);
    const [, again] = hold(shake, 700, 1.5);
    expect(again).toBeGreaterThan(0.8 * pulling);
  });

  it('never leans much past its limit however hard the mounts are loaded', () => {
    const shake = newShake();
    const [, most] = hold(shake, 1e5, 2);
    expect(most).toBeLessThan(1.15 * MAX_ROLL);
  });

  it('jitters a fraction of a millimetre while running, more at idle, and not at all when off', () => {
    const peak = (rpm: number, running: boolean) => {
      const shake = newShake();
      let most = 0;
      for (let i = 0; i < 120; i++) most = Math.max(most, ...stepShake(shake, rpm, 0, running, DT).map(Math.abs));
      return most;
    };
    expect(peak(1500, true)).toBeGreaterThan(peak(7000, true));
    expect(peak(1500, true)).toBeLessThan(0.001);
    expect(peak(0, false)).toBe(0);
  });

  it('survives a long frame without flinging the engine', () => {
    const shake = newShake();
    stepShake(shake, 1500, 0, true, DT);
    stepShake(shake, 8000, 1200, true, 2);
    expect(Math.abs(shake.roll)).toBeLessThan(MAX_ROLL);
  });
});
