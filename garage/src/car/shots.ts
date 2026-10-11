import { MathUtils } from 'three';
import type { CarTopicId } from '../content/car';
import type { EngineTopicId } from '../content/engine';
import { ENGINE_ANCHORS, ENGINE_OFFSET } from '../engine/anchors';
import { ROOM } from '../scene/layout';
import { add, dot, length, normalize, scale, sub, type Vec3 } from '../math';
import type { View } from '../state/view';

export type Shot = { position: Vec3; target: Vec3 };
export type CarShotId = 'showroom' | 'bay' | Exclude<CarTopicId, 'hood'>;

/** Solid volumes of the car (lower body, cabin, rear wing), from prepare-report.json. */
export const CAR_SOLIDS: { min: Vec3; max: Vec3 }[] = [
  { min: [-1.07, 0, -2.25], max: [0.93, 0.874, 2.25] }, // x is lopsided: the source poses the front-right wheel steered
  { min: [-0.78, 0.86, -1.15], max: [0.78, 1.3, 0.75] },
  { min: [-0.9, 0.86, -2.3], max: [0.9, 1.32, -1.7] },
];

/**
 * The hood, hinged along X at its rear edge. `profile` is its centreline measured from Hood_Panel, as
 * [distance toward the nose, height above the hinge, half width] (m) with the hood closed. The E46 hood wraps
 * down over the nose, so its front lip hangs 0.38 m below the hinge and sits low in front of the open hood.
 */
export const HOOD_PANEL = {
  hinge: [0, 0.804, 0.836] as Vec3,
  profile: [
    [0, 0, 0.72],
    [0.16, 0.05, 0.72],
    [0.96, -0.11, 0.67],
    [1.16, -0.15, 0.43],
    [1.29, -0.38, 0.24],
  ] as [number, number, number][],
};

export const CAMERA_FOV = 35;

/** The narrowest horizontal view (degrees) that still holds the whole car in the showroom shot. */
const MIN_HORIZONTAL_FOV = 42;

/** Vertical field of view for a canvas aspect ratio. Landscape keeps CAMERA_FOV; portrait widens it. */
export function fovFor(aspect: number): number {
  const halfWidth = Math.tan(MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2));
  return Math.max(CAMERA_FOV, MathUtils.radToDeg(2 * Math.atan(halfWidth / aspect)));
}

export const CAR_SHOTS: Record<CarShotId, Shot> = {
  showroom: { position: [5.4, 1.55, 5.2], target: [0, 0.55, 0] },
  bay: { position: [1.7, 2.35, 3.6], target: [0, 0.6, 1.3] },
  'front-aero': { position: [1.9, 0.75, 4.6], target: [0, 0.3, 2.0] },
  'rear-wing': { position: [-2.8, 2.1, -4.6], target: [0, 1.1, -1.9] },
  wheels: { position: [3.3, 0.75, 2.9], target: [0.9, 0.35, 1.4] },
  history: { position: [4.6, 1.3, -0.6], target: [0, 0.65, -0.2] },
  livery: { position: [-4.4, 2.6, 2.6], target: [0, 0.7, 0.1] },
};

const ENGINE_VIEW_DISTANCE = 1.35;
const ENGINE_VIEW_BIAS: Vec3 = [0, 0.6, 1.5]; // look in from the nose, under the raised hood's lip

export const engineOrigin = (bay: Vec3): Vec3 => add(bay, ENGINE_OFFSET);

export function engineShot(origin: Vec3, id: EngineTopicId): Shot {
  const anchor = ENGINE_ANCHORS[id];
  const target = add(origin, anchor.position);
  const direction = normalize(add(normalize(anchor.normal), ENGINE_VIEW_BIAS));
  return { position: add(target, scale(direction, ENGINE_VIEW_DISTANCE)), target };
}

/** Looking inside: the whole engine, from above the nose, so all eight cylinders show through the x-ray. */
const INSIDE_TARGET: Vec3 = [0, 0.16, 0.02];
const INSIDE_DIRECTION: Vec3 = [0.35, 1, 0.25];
const INSIDE_DISTANCE = 2.0;

export function insideShot(origin: Vec3): Shot {
  const target = add(origin, INSIDE_TARGET);
  const direction = normalize(add(normalize(INSIDE_DIRECTION), ENGINE_VIEW_BIAS));
  return { position: add(target, scale(direction, INSIDE_DISTANCE)), target };
}

/** The camera shot for a view. Looking inside changes only the bay's overview; part views keep their own. */
export function shotFor(view: View, bay: Vec3, inside = false): Shot {
  switch (view.kind) {
    case 'showroom':
      return CAR_SHOTS.showroom;
    case 'focus':
      return CAR_SHOTS[view.id];
    case 'bay':
      return inside ? insideShot(engineOrigin(bay)) : CAR_SHOTS.bay;
    case 'bay-part':
      return engineShot(engineOrigin(bay), view.id);
  }
}

export function insideSolid(point: Vec3, margin = 0.12): boolean {
  return CAR_SOLIDS.some(({ min, max }) => point.every((v, axis) => v > min[axis]! - margin && v < max[axis]! + margin));
}

/** Does the segment from→to pass through the hood when it is open by `angle` radians? */
export function segmentHitsHood(from: Vec3, to: Vec3, panel: typeof HOOD_PANEL, angle: number): boolean {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const lift = ([along, up]: [number, number, number]): Vec3 => add(panel.hinge, [0, up * cos + along * sin, along * cos - up * sin]);
  const delta = sub(to, from);
  for (let i = 1; i < panel.profile.length; i++) {
    const a = panel.profile[i - 1]!;
    const b = panel.profile[i]!;
    const start = lift(a);
    const edge = sub(lift(b), start);
    const normal: Vec3 = [0, -edge[2], edge[1]]; // x̂ × edge
    const denominator = dot(normal, delta);
    if (Math.abs(denominator) < 1e-9) continue;
    const t = dot(normal, sub(start, from)) / denominator;
    if (t <= 0 || t >= 1) continue;
    const local = sub(add(from, scale(delta, t)), start);
    const v = dot(local, edge) / dot(edge, edge);
    if (v >= 0 && v <= 1 && Math.abs(local[0]) <= Math.max(a[2], b[2])) return true;
  }
  return false;
}

/** Where the camera may be: inside the room with a margin, above the floor, below the ceiling beams. */
export const CAMERA_BOUNDS = {
  min: [-ROOM.halfWidth + 0.4, 0.25, ROOM.back + 0.4] as Vec3,
  max: [ROOM.halfWidth - 0.4, ROOM.height - 0.35, ROOM.front - 0.4] as Vec3,
};

export type OrbitLimits = { minAzimuth: number; maxAzimuth: number; minPolar: number; maxPolar: number; minDistance: number; maxDistance: number };

/**
 * Orbit freedom around each kind of shot (radians): ± azimuth, how far the camera may rise (`up`) or sink (`down`),
 * and the distance range as multiples of the shot's. Engine shots sit just above the body, so they may only rise
 * and back away; they are already as close as the bay allows.
 */
const ORBIT_FREEDOM = {
  focus: { azimuth: 0.5, up: 0.3, down: 0.3, nearer: 0.75, farther: 1.5 },
  bay: { azimuth: 0.4, up: 0.25, down: 0.15, nearer: 0.8, farther: 1.4 },
  'bay-part': { azimuth: 0.3, up: 0.06, down: 0, nearer: 1, farther: 1.3 },
} as const;

/**
 * How far the visitor may orbit and zoom from a view's shot. The showroom orbits freely but never closer than 3 m,
 * which keeps the camera outside the car; every other view keeps the camera near its shot, so it can't swing
 * through the body or the open hood. The room itself is enforced separately with CAMERA_BOUNDS.
 */
export function orbitLimits(view: View, shot: Shot): OrbitLimits {
  if (view.kind === 'showroom') return { minAzimuth: -Infinity, maxAzimuth: Infinity, minPolar: 0.35, maxPolar: 1.45, minDistance: 3, maxDistance: 7.5 };
  const freedom = ORBIT_FREEDOM[view.kind];
  const offset = sub(shot.position, shot.target);
  const distance = length(offset);
  const azimuth = Math.atan2(offset[0], offset[2]);
  const polar = Math.acos(offset[1] / distance);
  return {
    minAzimuth: azimuth - freedom.azimuth,
    maxAzimuth: azimuth + freedom.azimuth,
    minPolar: Math.max(0.2, polar - freedom.up),
    maxPolar: Math.min(1.48, polar + freedom.down),
    minDistance: distance * freedom.nearer,
    maxDistance: Math.min(7.5, distance * freedom.farther),
  };
}
