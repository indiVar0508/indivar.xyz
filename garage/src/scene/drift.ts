export const DRIFT_RADIANS_PER_SECOND = 0.05;
export const IDLE_SECONDS = 4;

/** A frame longer than this (shader compile, hidden tab) counts as this long, so the camera never jumps. */
const MAX_FRAME_SECONDS = 0.1;

/** Advances the showroom's idle timer in place by one frame and returns how far to turn the camera. */
export function stepDrift(timer: { idle: number }, dt: number): number {
  const step = Math.min(dt, MAX_FRAME_SECONDS);
  timer.idle += step;
  return timer.idle > IDLE_SECONDS ? DRIFT_RADIANS_PER_SECOND * step : 0;
}
