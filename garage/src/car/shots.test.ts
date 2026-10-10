import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_TOPIC_IDS } from '../content/car';
import { ENGINE_TOPIC_IDS } from '../content/engine';
import { BAY, ENGINE_ANCHORS, RADIATOR } from '../engine/anchors';
import { add, type Vec3 } from '../math';
import { ROOM } from '../scene/layout';
import { CAR_SHOTS, CAR_SOLIDS, CAMERA_FOV, engineOrigin, engineShot, fovFor, HOOD_PANEL, insideSolid, segmentHitsHood, shotFor } from './shots';
import { HOOD_OPEN_DEG } from './hood';

const EXPECTED_BAY: Vec3 = [0, 0.3133, 1.4806]; // prepare-report.json engineBay
const open = MathUtils.degToRad(HOOD_OPEN_DEG);
const origin = engineOrigin(EXPECTED_BAY);
const engineShots = ENGINE_TOPIC_IDS.map((id) => [id, engineShot(origin, id)] as const);
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
