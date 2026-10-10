export const DRIFT_RADIANS_PER_SECOND = 0.05;
export const IDLE_SECONDS = 4;

/** A frame longer than this (shader compile, hidden tab) counts as this long, so the camera never jumps. */
const MAX_FRAME_SECONDS = 0.1;

/** Advances the showroom's idle timer by one frame and returns how far to turn the camera. */
export function stepDrift(idle: number, dt: number): { idle: number; angle: number } {
  const step = Math.min(dt, MAX_FRAME_SECONDS);
  const next = idle + step;
  return { idle: next, angle: next > IDLE_SECONDS ? DRIFT_RADIANS_PER_SECOND * step : 0 };
}
