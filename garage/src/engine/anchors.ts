import type { EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';

/** Hotspot positions in engine space (origin on the crank axis, mid-block; +Z toward the car's nose). */
export const ENGINE_ANCHORS: Record<EngineTopicId, { position: Vec3; normal: Vec3 }> = {
  layout: { position: [-0.24, 0.1, -0.2], normal: [-0.7, 0.5, 0.2] },
  heads: { position: [0.29, 0.33, -0.05], normal: [0.7, 0.7, 0] },
  crank: { position: [0, 0, 0.31], normal: [0, 1.2, 1] }, // steep, so the view clears the radiator
  restrictors: { position: [0.07, 0.4, 0.38], normal: [0, 0.5, 1] },
  'dry-sump': { position: [-0.52, 0.23, 0.12], normal: [-0.5, 1, 0] },
  fuel: { position: [-0.15, 0.36, -0.1], normal: [0, 1, 0.2] },
  headers: { position: [0.42, -0.02, 0.05], normal: [0.6, 0.8, 0.2] }, // from above, not through the fender
  'game-turbo': { position: [0, 0.58, 0.05], normal: [0, 1, 0.3] },
};

/** The engine bay in car space (m), from prepare-report.json: hood hinge to radiator, between the inner fenders. */
export const BAY = { rearZ: 0.86, frontZ: 2.02, halfWidth: 0.68, floorY: 0.1, topY: 0.76 } as const;
