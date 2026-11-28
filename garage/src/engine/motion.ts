/** How the engine's parts move on screen, separate from the engine model so it can be tested on its own. */

/** The x-ray runs this many times slower than the engine, so each stroke can be followed. */
export const SLOW_MOTION = 40;
/** The fastest a part may turn on screen (degrees per second), so at 60 fps it never seems to strobe backwards. */
export const MAX_SPIN = 1200;
/** Degrees a throttle butterfly sits off square when shut, so it doesn't bind in its bore. */
export const BUTTERFLY_SHUT = 6;

/** Crank degrees the x-ray turns in `dt` seconds. */
export const slowStep = (rpm: number, dt: number): number => (rpm / SLOW_MOTION) * 6 * dt;

/** Degrees a fast-spinning part (the turbo's compressor) turns in `dt`: its real speed, capped at MAX_SPIN. */
export const spinStep = (rpm: number, ratio: number, dt: number): number => Math.min(rpm * 6 * ratio, MAX_SPIN) * dt;

/** The engine speed at which the belt drive's fastest pulley reaches MAX_SPIN: the crate's limiter. */
export const BELT_FULL_RPM = 8500;

/**
 * Degrees a belt-driven pulley turns in `dt` outside the x-ray. Real speeds would all strobe, so every pulley is slowed
 * by the same factor, chosen so the fastest (`fastest`, its ratio to the crank) reaches MAX_SPIN at the limiter. The
 * drive keeps its true ratios and speeds up and slows down with the revs, so a gear change shows on it.
 */
export const beltStep = (rpm: number, ratio: number, fastest: number, dt: number): number => MAX_SPIN * Math.min(Math.max(rpm, 0) / BELT_FULL_RPM, 1) * (ratio / fastest) * dt;

/** A throttle butterfly's angle (degrees from shut-square) for an engine load of 0 to 1. */
export const butterflyAngle = (load: number): number => BUTTERFLY_SHUT + (90 - BUTTERFLY_SHUT) * Math.max(0, Math.min(1, load));

/** Radians the wheels turn in `dt` at `wheel` rad/s: slowed with the x-ray, or outside it their real speed, capped. */
export const wheelTurn = (wheel: number, dt: number, xray: boolean): number => (xray ? wheel / SLOW_MOTION : Math.min(wheel, (MAX_SPIN * Math.PI) / 180)) * dt;

/** Radians the crank turns in `dt` in the x-ray. */
export const crankTurn = (rpm: number, dt: number): number => (slowStep(rpm, dt) * Math.PI) / 180;
