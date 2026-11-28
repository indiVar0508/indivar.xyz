/**
 * The engine on its mounts: a damped lean against the crank by the torque the mounts carry, and a running jitter.
 *
 * The engine and gearbox are bolted together, so the mounts carry what spins up the crank plus what the gearbox sends
 * on down the propshaft (the crate reports it). Revving in neutral that is only the engine's own torque; pulling in
 * gear it is the clutch's torque multiplied by the gear, so the engine leans hardest in 1st, rocks back as an upshift
 * cuts the drive, and leans the other way under engine braking.
 */
export type Shake = { roll: number; spin: number; time: number };

/**
 * N·m of mount torque per radian of lean. Illustrative: no source gives the GTR's mounts, and a race car's are nearly
 * solid, so they are drawn softer than real so the lean can be seen: about 0.9° revving in neutral, 2° pulling in 1st.
 */
export const MOUNT_STIFFNESS = 28_000;
/** The most the engine leans (radians), however hard the mounts are loaded. */
export const MAX_ROLL = 0.045;
const STIFFNESS = 160;
const DAMPING = 16;

export const newShake = (): Shake => ({ roll: 0, spin: 0, time: 0 });

/**
 * Advances the shake by `dt` seconds at engine speed `rpm` with the mounts carrying `mount` N·m, and returns this
 * frame's jitter (x, y in metres). `roll` is the rotation about the crank axis: positive (counter-clockwise from the
 * front) as the clockwise crank drives.
 */
export function stepShake(shake: Shake, rpm: number, mount: number, running: boolean, dt: number): [number, number] {
  const step = Math.min(dt, 0.05);
  if (step <= 0) return [0, 0];
  const target = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, mount / MOUNT_STIFFNESS));
  shake.spin += ((target - shake.roll) * STIFFNESS - shake.spin * DAMPING) * step;
  shake.roll += shake.spin * step;
  shake.time += step;
  if (!running) return [0, 0];
  const idleness = Math.max(0, Math.min(1, 1 - (rpm - 1500) / 2500));
  const amplitude = 0.00035 + 0.0005 * idleness;
  const t = shake.time;
  return [(amplitude * (Math.sin(t * 71) + 0.6 * Math.sin(t * 113 + 1))) / 1.6, (amplitude * (Math.sin(t * 89 + 2) + 0.5 * Math.sin(t * 131))) / 1.5];
}
