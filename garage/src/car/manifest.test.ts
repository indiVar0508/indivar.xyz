import { describe, expect, it } from 'vitest';
import { assetErrors, missingNodes, REQUIRED_NODES, type AssetFacts } from './manifest';

const wheels = { pivotsWithMeshes: [] as string[], wheelMeshes: { Wheel_RL: 3, Wheel_RR: 3 } as Record<string, number> };
const good: AssetFacts = { nodeNames: [...REQUIRED_NODES, 'Paint_Shell'], bytes: 9_000_000, triangles: 117_000, textureMimeTypes: ['image/ktx2'], paintMeshes: 8, ...wheels };

describe('car asset contract', () => {
  it('lists missing nodes in contract order', () => {
    expect(missingNodes(['Body', 'Marker_EngineBay'])).toEqual(['Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR', 'Wheel_RL', 'Wheel_RR']);
  });

  it('accepts a model inside the budgets', () => {
    expect(assetErrors(good)).toEqual([]);
  });

  it('explains every violation', () => {
    expect(assetErrors({ ...wheels, nodeNames: ['Body'], bytes: 13 * 1048576, triangles: 200_000, textureMimeTypes: ['image/jpeg', 'image/ktx2'], paintMeshes: 0 })).toEqual([
      'missing node: Hood',
      'missing node: Glass',
      'missing node: Marker_Wheel_FL',
      'missing node: Marker_Wheel_FR',
      'missing node: Marker_Wheel_RL',
      'missing node: Marker_Wheel_RR',
      'missing node: Marker_EngineBay',
      'missing node: Wheel_RL',
      'missing node: Wheel_RR',
      'file is 13.0 MB; budget is 12 MB',
      '200000 triangles; budget is 150000',
      '1 texture(s) are not KTX2',
      'no meshes tagged role=paint',
    ]);
  });

  it('wants each driven wheel as a pivot turning its tyre, rim and brake disc', () => {
    expect(assetErrors({ ...good, pivotsWithMeshes: ['Wheel_RL'], wheelMeshes: { Wheel_RL: 3, Wheel_RR: 1 } })).toEqual([
      'Wheel_RL holds its mesh directly; quantization would move its pivot',
      'Wheel_RR turns 1 mesh(es); it needs its tyre, rim and brake disc',
    ]);
  });
});
