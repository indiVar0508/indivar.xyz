/** The engine on its mounts: a damped roll against the crank whenever engine speed changes, and a running jitter. */
export type Shake = { roll: number; spin: number; rpm: number; accel: number; time: number };

/** Radians of roll at full acceleration. */
const MAX_ROLL = 0.012;
/** rpm/s that counts as full acceleration. */
const FULL_ACCEL = 14_000;
const STIFFNESS = 160;
const DAMPING = 16;

export const newShake = (): Shake => ({ roll: 0, spin: 0, rpm: 0, accel: 0, time: 0 });

/**
 * Advances the shake by `dt` seconds at engine speed `rpm` and returns this frame's jitter (x, y in metres). `roll`
 * is the rotation about the crank axis: positive (counter-clockwise from the front) as the clockwise crank speeds up.
 */
export function stepShake(shake: Shake, rpm: number, running: boolean, dt: number): [number, number] {
  const step = Math.min(dt, 0.05);
  if (step <= 0) return [0, 0];
  const accel = (rpm - shake.rpm) / step;
  shake.rpm = rpm;
  shake.accel += (accel - shake.accel) * Math.min(1, step / 0.08);
  const target = Math.max(-1, Math.min(1, shake.accel / FULL_ACCEL)) * MAX_ROLL;
  shake.spin += ((target - shake.roll) * STIFFNESS - shake.spin * DAMPING) * step;
  shake.roll += shake.spin * step;
  shake.time += step;
  if (!running) return [0, 0];
  const idleness = Math.max(0, Math.min(1, 1 - (rpm - 1500) / 2500));
  const amplitude = 0.00035 + 0.0005 * idleness;
  const t = shake.time;
  return [(amplitude * (Math.sin(t * 71) + 0.6 * Math.sin(t * 113 + 1))) / 1.6, (amplitude * (Math.sin(t * 89 + 2) + 0.5 * Math.sin(t * 131))) / 1.5];
}
