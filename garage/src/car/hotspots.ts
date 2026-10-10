import type { CarTopicId } from '../content/car';
import type { Vec3 } from '../math';
import type { CarAnchors } from './prepareCar';

/** Where each car hotspot sits (car space) and which way its surface faces. */
export function carHotspot(id: CarTopicId, anchors: CarAnchors): { position: Vec3; normal: Vec3 } {
  switch (id) {
    case 'hood':
      return { position: [0, 0.95, anchors.engineBay[2] + 0.1], normal: [0, 1, 0.35] };
    case 'front-aero':
      return { position: [0.45, 0.2, 2.28], normal: [0, 0.1, 1] };
    case 'rear-wing':
      return { position: [0, 1.36, -2.0], normal: [0, 1, -0.5] };
    case 'wheels':
      return { position: [anchors.wheelFL[0] + 0.14, anchors.wheelFL[1], anchors.wheelFL[2]], normal: [1, 0, 0] };
    case 'history':
      return { position: [1.02, 0.62, -0.25], normal: [1, 0, 0] };
    case 'livery':
      return { position: [0, 1.33, -0.25], normal: [0, 1, 0] };
  }
}
