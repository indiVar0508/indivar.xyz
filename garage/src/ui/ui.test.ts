import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { carHotspot } from '../car/hotspots';
import type { CarAnchors } from '../car/prepareCar';
import { CAR_TOPIC_IDS } from '../content/car';
import { breadcrumbFor, topicFor } from './topicFor';
import { facingOpacity } from './facing';
import { SHOWROOM } from '../state/view';

const anchors: CarAnchors = { wheelFL: [0.8, 0.32, 1.45], wheelFR: [-0.8, 0.32, 1.45], wheelRL: [0.8, 0.32, -1.21], wheelRR: [-0.8, 0.32, -1.21], engineBay: [0, 0.32, 1.49] };

describe('facingOpacity', () => {
  // Runs every frame for every hotspot, so it takes Vector3s and a scratch vector instead of allocating (spec §7).
  const scratch = new Vector3();
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

  it('shows hotspots facing the camera and hides those facing away', () => {
    expect(facingOpacity(at(1, 0, 0), at(1, 0, 0), at(5, 0, 0), scratch)).toBe(1);
    expect(facingOpacity(at(1, 0, 0), at(1, 0, 0), at(-5, 0, 0), scratch)).toBe(0);
    const grazing = facingOpacity(at(1, 0, 0), at(1, 0, 0), at(1, 0, 5), scratch);
    expect(grazing).toBeGreaterThan(0);
    expect(grazing).toBeLessThan(1);
  });
});

describe('topicFor and breadcrumbFor', () => {
  it('describes every view', () => {
    expect(topicFor(SHOWROOM)).toBeNull();
    expect(topicFor({ kind: 'bay' })?.title).toBe('P60B40 V8');
    expect(topicFor({ kind: 'bay-part', id: 'crank' })?.title).toBe('Flat-plane crankshaft');
    expect(breadcrumbFor({ kind: 'bay-part', id: 'crank' })).toEqual(['Garage', 'Engine bay', 'Flat-plane crankshaft']);
    expect(breadcrumbFor({ kind: 'focus', id: 'wheels' })).toEqual(['Garage', 'Wheels and brakes']);
  });

  it('explains how the engine runs when looking inside from the bay, and keeps part topics as they are', () => {
    expect(topicFor({ kind: 'bay' }, true)?.title).toBe('How it runs');
    expect(breadcrumbFor({ kind: 'bay' }, true)).toEqual(['Garage', 'Engine bay', 'Inside']);
    expect(topicFor({ kind: 'bay-part', id: 'crank' }, true)?.title).toBe('Flat-plane crankshaft');
    expect(topicFor({ kind: 'bay' }, false)?.title).toBe('P60B40 V8');
  });
});

describe('carHotspot', () => {
  it('places each hotspot above the floor, facing outward', () => {
    for (const id of CAR_TOPIC_IDS) {
      const { position, normal } = carHotspot(id, anchors);
      expect(Math.hypot(...normal), id).toBeGreaterThan(0.5);
      expect(position[1], id).toBeGreaterThan(0.1);
    }
  });

  it('puts the wheel hotspot just outside the front-left tyre', () => {
    expect(carHotspot('wheels', anchors).position[0]).toBeGreaterThan(anchors.wheelFL[0]);
  });
});
