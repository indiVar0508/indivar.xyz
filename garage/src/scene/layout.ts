import type { Vec3 } from '../math';

/** Garage interior in car space (m). The car sits at the origin, facing +Z. */
export const ROOM = { halfWidth: 8.5, back: -7.5, front: 9.5, height: 4.4 } as const;

export const TUBES: { position: Vec3; flicker: boolean }[] = [
  { position: [0, 3.75, -1.3], flicker: false },
  { position: [0, 3.75, 1.3], flicker: false },
  { position: [-3.6, 3.75, 0.2], flicker: true },
  { position: [3.6, 3.75, -0.4], flicker: false },
];
