import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_TOPIC_IDS } from '../content/car';
import { ENGINE_TOPIC_IDS } from '../content/engine';
import { BAY, ENGINE_ANCHORS, RADIATOR } from '../engine/anchors';
import { add, type Vec3 } from '../math';
import { ROOM } from '../scene/layout';
import { CAMERA_BOUNDS, CAR_SHOTS, CAR_SOLIDS, CAMERA_FOV, orbitLimits, engineOrigin, engineShot, fovFor, HOOD_PANEL, insideShot, insideSolid, segmentHitsHood, shotFor } from './shots';
import { HOOD_OPEN_DEG } from './hood';
import { isHoodOpen, SHOWROOM, type View } from '../state/view';

const EXPECTED_BAY: Vec3 = [0, 0.3133, 1.4806]; // prepare-report.json engineBay
const open = MathUtils.degToRad(HOOD_OPEN_DEG);
const origin = engineOrigin(EXPECTED_BAY);
const engineShots = [...ENGINE_TOPIC_IDS.map((id) => [id, engineShot(origin, id)] as const), ['inside', insideShot(origin)] as const];
const allShots = [...Object.entries(CAR_SHOTS), ...engineShots];

describe('camera shots', () => {
  it('keeps every camera outside the car, above the floor and inside the room', () => {
    for (const [id, shot] of allShots) {
      expect(insideSolid(shot.position), id).toBe(false);
      expect(shot.position[1], id).toBeGreaterThan(0.2);
      expect(Math.abs(shot.position[0]), id).toBeLessThan(ROOM.halfWidth - 0.4);
      expect(shot.position[2], id).toBeGreaterThan(ROOM.back + 0.4);
      expect(shot.position[2], id).toBeLessThan(ROOM.front - 0.4);
    }
  });

  it('never looks at the engine through the open hood', () => {
    const bayShots = [['bay', CAR_SHOTS.bay] as const, ...engineShots];
    for (const [id, shot] of bayShots) expect(segmentHitsHood(shot.position, shot.target, HOOD_PANEL, open), id).toBe(false);
  });

  it('looks over the radiator with room to see the part, not grazing it', () => {
    const clearance = 0.08; // about the crank pulley's radius
    for (const [id, { position: p, target: t }] of engineShots) {
      if (p[2] <= RADIATOR.z) continue;
      const heightAtRadiator = t[1] + ((RADIATOR.z - t[2]) / (p[2] - t[2])) * (p[1] - t[1]);
      expect(heightAtRadiator, id).toBeGreaterThan(RADIATOR.top + clearance);
    }
  });

  it('detects a camera that would look through the hood', () => {
    const above: Vec3 = [0, 3, 1.3];
    expect(segmentHitsHood(above, [0, 0.4, 1.2], HOOD_PANEL, open)).toBe(true);
    expect(segmentHitsHood(above, [0, 0.4, 1.2], HOOD_PANEL, 0)).toBe(true);
    expect(segmentHitsHood([3, 1, 1.2], [2, 1, 1.2], HOOD_PANEL, open)).toBe(false);
  });

  it('detects the nose lip, which hangs below the open hood', () => {
    // The first fuel-rail shot looked at the engine through the lip (screenshot, 2026-10-11).
    expect(segmentHitsHood([-0.15, 1.706, 2.0], [-0.15, 0.65, 1.16], HOOD_PANEL, open)).toBe(true);
  });

  it('fits the whole car in the showroom shot, even on a portrait phone', () => {
    const { min, max } = CAR_SOLIDS[0]!;
    for (const aspect of [0.46, 0.75, 1.6]) {
      const camera = new PerspectiveCamera(fovFor(aspect), aspect, 0.05, 60);
      camera.position.set(...CAR_SHOTS.showroom.position);
      camera.lookAt(...CAR_SHOTS.showroom.target);
      camera.updateMatrixWorld();
      for (const x of [min[0], max[0]]) for (const y of [0, 1.29]) for (const z of [min[2], max[2]]) {
        const ndc = new Vector3(x, y, z).project(camera);
        expect(Math.abs(ndc.x), `aspect ${aspect}`).toBeLessThan(1);
        expect(Math.abs(ndc.y), `aspect ${aspect}`).toBeLessThan(1);
      }
    }
    expect(fovFor(1.6)).toBe(CAMERA_FOV);
  });

  it('maps every view to a shot', () => {
    for (const id of CAR_TOPIC_IDS) {
      const view = id === 'hood' ? ({ kind: 'bay' } as const) : ({ kind: 'focus', id } as const);
      expect(shotFor(view, EXPECTED_BAY).target).toHaveLength(3);
    }
    expect(shotFor({ kind: 'bay-part', id: 'crank' }, EXPECTED_BAY)).toEqual(engineShot(origin, 'crank'));
    expect(shotFor({ kind: 'bay' }, EXPECTED_BAY, true)).toEqual(insideShot(origin));
    expect(shotFor({ kind: 'bay-part', id: 'crank' }, EXPECTED_BAY, true)).toEqual(engineShot(origin, 'crank'));
  });

  it('frames the whole engine when looking inside', () => {
    const { position, target } = insideShot(origin);
    const camera = new PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.05, 60);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateMatrixWorld();
    for (const x of [-0.42, 0.42]) for (const y of [-0.12, 0.6]) for (const z of [-0.3, 0.42]) {
      const ndc = new Vector3(...add(origin, [x, y, z])).project(camera);
      expect(Math.abs(ndc.x)).toBeLessThan(0.95);
      expect(Math.abs(ndc.y)).toBeLessThan(0.95);
    }
  });
});

describe('engine anchors', () => {
  it('sit inside the engine bay', () => {
    for (const id of ENGINE_TOPIC_IDS) {
      const [x, y, z] = add(origin, ENGINE_ANCHORS[id].position);
      expect(Math.abs(x), id).toBeLessThan(BAY.halfWidth);
      expect(z, id).toBeGreaterThan(BAY.rearZ);
      expect(z, id).toBeLessThan(BAY.frontZ);
      expect(y, id).toBeGreaterThan(BAY.floorY);
    }
  });
});

/** Where camera-controls puts the camera for a target and spherical offset, pulled in toward the target to stay in bounds. */
function orbitPosition(target: Vec3, azimuth: number, polar: number, distance: number): Vec3 {
  const offset: Vec3 = [distance * Math.sin(polar) * Math.sin(azimuth), distance * Math.cos(polar), distance * Math.sin(polar) * Math.cos(azimuth)];
  let scaleBy = 1;
  for (let axis = 0; axis < 3; axis++) {
    const end = target[axis]! + offset[axis]!;
    if (end > CAMERA_BOUNDS.max[axis]!) scaleBy = Math.min(scaleBy, (CAMERA_BOUNDS.max[axis]! - target[axis]!) / offset[axis]!);
    if (end < CAMERA_BOUNDS.min[axis]!) scaleBy = Math.min(scaleBy, (CAMERA_BOUNDS.min[axis]! - target[axis]!) / offset[axis]!);
  }
  return add(target, [offset[0] * scaleBy, offset[1] * scaleBy, offset[2] * scaleBy]);
}

describe('orbit limits', () => {
  const views: [View, boolean][] = [
    SHOWROOM,
    ...CAR_TOPIC_IDS.filter((id) => id !== 'hood').map((id) => ({ kind: 'focus', id }) as View),
    { kind: 'bay' },
    ...ENGINE_TOPIC_IDS.map((id) => ({ kind: 'bay-part', id }) as View),
  ].map((view) => [view, false] as [View, boolean]);
  views.push([{ kind: 'bay' }, true]);

  it('never lets the visitor orbit or zoom the camera into the car, or through the open hood', () => {
    for (const [view, inside] of views) {
      const shot = shotFor(view, EXPECTED_BAY, inside);
      const limits = orbitLimits(view, shot);
      const azimuths = Number.isFinite(limits.minAzimuth)
        ? [limits.minAzimuth, (limits.minAzimuth + limits.maxAzimuth) / 2, limits.maxAzimuth]
        : Array.from({ length: 24 }, (_, i) => (i / 24) * 2 * Math.PI);
      for (const azimuth of azimuths) {
        for (const polar of [limits.minPolar, (limits.minPolar + limits.maxPolar) / 2, limits.maxPolar]) {
          for (const distance of [limits.minDistance, limits.maxDistance]) {
            const camera = orbitPosition(shot.target, azimuth, polar, distance);
            const label = `${JSON.stringify(view)} az ${azimuth.toFixed(2)} pol ${polar.toFixed(2)} d ${distance.toFixed(2)} → ${camera.map((v) => v.toFixed(2))}`;
            expect(insideSolid(camera), label).toBe(false);
            if (isHoodOpen(view)) expect(segmentHitsHood(camera, shot.target, HOOD_PANEL, open), label).toBe(false);
          }
        }
      }
    }
  });

  it('includes each view’s own shot', () => {
    for (const [view, inside] of views) {
      const shot = shotFor(view, EXPECTED_BAY, inside);
      const limits = orbitLimits(view, shot);
      const [dx, dy, dz] = [0, 1, 2].map((axis) => shot.position[axis]! - shot.target[axis]!) as Vec3;
      const distance = Math.hypot(dx, dy, dz);
      const azimuth = Math.atan2(dx, dz);
      const polar = Math.acos(dy / distance);
      expect(azimuth, JSON.stringify(view)).toBeGreaterThanOrEqual(limits.minAzimuth);
      expect(azimuth, JSON.stringify(view)).toBeLessThanOrEqual(limits.maxAzimuth);
      expect(polar, JSON.stringify(view)).toBeGreaterThanOrEqual(limits.minPolar);
      expect(polar, JSON.stringify(view)).toBeLessThanOrEqual(limits.maxPolar);
      expect(distance, JSON.stringify(view)).toBeGreaterThanOrEqual(limits.minDistance);
      expect(distance, JSON.stringify(view)).toBeLessThanOrEqual(limits.maxDistance + 0.1);
    }
  });
});
