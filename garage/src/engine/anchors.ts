import type { EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';

/** Hotspot positions in engine space (origin on the crank axis, mid-block; +Z toward the car's nose). */
export const ENGINE_ANCHORS: Record<EngineTopicId, { position: Vec3; normal: Vec3 }> = {
  layout: { position: [-0.24, 0.1, -0.2], normal: [-0.7, 0.5, 0.2] },
  heads: { position: [0.29, 0.33, -0.05], normal: [0.7, 0.7, 0] },
  crank: { position: [0, 0, 0.42], normal: [0, 1, -0.2] }, // the crank pulley; look down into the gap between the radiator and the engine
  restrictors: { position: [0.115, 0.37, 0.36], normal: [0, 0.5, 1] }, // the left inlet's mouth
  'dry-sump': { position: [-0.42, 0.2, 0.4], normal: [-0.2, 1.5, -1.2] }, // the oil tank's cap, from above: the bumper hides it from the front
  fuel: { position: [-0.175, 0.35, -0.05], normal: [-0.5, 1, 0.2] }, // the right bank's fuel rail
  headers: { position: [0.42, -0.02, 0.05], normal: [0.3, 1.2, -0.6] }, // from above, not through the fender
  'game-turbo': { position: [0, 0.58, 0.05], normal: [0, 1, 0.3] },
};

/**
 * The engine bay in car space (m), from prepare-report.json: hood hinge to radiator, between the inner fenders.
 * The hood's edges fall from 0.79 m at the hinge to 0.62 m near the nose, so the side walls stop at `wallTopY`
 * and `wallFrontZ`; any higher or further forward and they show through the closed hood's seams.
 */
export const BAY = { rearZ: 0.86, frontZ: 2.02, wallFrontZ: 1.8, halfWidth: 0.64, floorY: 0.1, topY: 0.76, wallTopY: 0.6 } as const;

/**
 * The radiator across the front of the bay. The nose is only ±0.43 m wide here, so the radiator stays inside it, and
 * its top sits low, which keeps the crank view (looking down past it at the belt drive) clear.
 */
export const RADIATOR = { z: BAY.frontZ - 0.03, top: 0.54, halfWidth: 0.38, height: 0.44 } as const;

/** Engine origin relative to Marker_EngineBay: crank axis a little low and behind the bay centre. */
export const ENGINE_OFFSET: Vec3 = [0, -0.02, -0.22];
