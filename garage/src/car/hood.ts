import { MathUtils } from 'three';

export const HOOD_OPEN_DEG = 52;
export const HOOD_SECONDS = 0.6;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Rotation about the hinge's local X axis. Negative lifts the front edge (car faces +Z, Y up). */
export function hoodAngle(progress: number): number {
  const eased = easeInOutCubic(MathUtils.clamp(progress, 0, 1));
  return eased === 0 ? 0 : -MathUtils.degToRad(HOOD_OPEN_DEG) * eased;
}

/** Advances the 0..1 opening progress toward the target state. */
export function stepHood(progress: number, open: boolean, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return open ? 1 : 0;
  const delta = dt / HOOD_SECONDS;
  return open ? Math.min(1, progress + delta) : Math.max(0, progress - delta);
}
