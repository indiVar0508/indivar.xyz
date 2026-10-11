import { describe, expect, it } from 'vitest';
import { assetErrors, missingNodes, REQUIRED_NODES, type AssetFacts } from './manifest';

const good: AssetFacts = { nodeNames: [...REQUIRED_NODES, 'Paint_Shell'], bytes: 9_000_000, triangles: 117_000, textureMimeTypes: ['image/ktx2'], paintMeshes: 8 };

describe('car asset contract', () => {
  it('lists missing nodes in contract order', () => {
    expect(missingNodes(['Body', 'Marker_EngineBay'])).toEqual(['Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR']);
  });

  it('accepts a model inside the budgets', () => {
    expect(assetErrors(good)).toEqual([]);
  });

  it('explains every violation', () => {
    expect(assetErrors({ nodeNames: ['Body'], bytes: 13 * 1048576, triangles: 200_000, textureMimeTypes: ['image/jpeg', 'image/ktx2'], paintMeshes: 0 })).toEqual([
      'missing node: Hood',
      'missing node: Glass',
      'missing node: Marker_Wheel_FL',
      'missing node: Marker_Wheel_FR',
      'missing node: Marker_Wheel_RL',
      'missing node: Marker_Wheel_RR',
      'missing node: Marker_EngineBay',
      'file is 13.0 MB; budget is 12 MB',
      '200000 triangles; budget is 150000',
      '1 texture(s) are not KTX2',
      'no meshes tagged role=paint',
    ]);
  });
});
