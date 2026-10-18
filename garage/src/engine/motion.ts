/** How the engine's parts move on screen, separate from the engine model so it can be tested on its own. */

/** The x-ray runs this many times slower than the engine, so each stroke can be followed. */
export const SLOW_MOTION = 40;
/** The fastest a part may turn on screen (degrees per second), so at 60 fps it never seems to strobe backwards. */
export const MAX_SPIN = 1200;
/** Degrees a throttle butterfly sits off square when shut, so it doesn't bind in its bore. */
export const BUTTERFLY_SHUT = 6;

/** Crank degrees the x-ray turns in `dt` seconds. */
export const slowStep = (rpm: number, dt: number): number => (rpm / SLOW_MOTION) * 6 * dt;

/** Degrees a belt-driven part turns in `dt` outside the x-ray: its real speed, capped at MAX_SPIN. */
export const spinStep = (rpm: number, ratio: number, dt: number): number => Math.min(rpm * 6 * ratio, MAX_SPIN) * dt;

/** A throttle butterfly's angle (degrees from shut-square) for an engine load of 0 to 1. */
export const butterflyAngle = (load: number): number => BUTTERFLY_SHUT + (90 - BUTTERFLY_SHUT) * Math.max(0, Math.min(1, load));
