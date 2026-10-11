import type { Vector3 } from 'three';
import { smoothstep } from '../math';

/**
 * 1 when the hotspot's surface faces the camera, fading to 0 as it turns away. `normal` must be unit length.
 * Runs every frame per hotspot, so it writes into `scratch` instead of allocating.
 */
export function facingOpacity(anchor: Vector3, normal: Vector3, camera: Vector3, scratch: Vector3): number {
  return smoothstep(-0.15, 0.3, normal.dot(scratch.subVectors(camera, anchor).normalize()));
}
