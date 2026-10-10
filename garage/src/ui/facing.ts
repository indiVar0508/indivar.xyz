import { dot, normalize, smoothstep, sub, type Vec3 } from '../math';

/** 1 when the hotspot's surface faces the camera, fading to 0 as it turns away. */
export function facingOpacity(anchor: Vec3, normal: Vec3, camera: Vec3): number {
  return smoothstep(-0.15, 0.3, dot(normalize(normal), normalize(sub(camera, anchor))));
}
