import { describe, expect, it } from 'vitest';
import { ENGINE_TOPIC_IDS } from '../content/engine';
import type { Vec3 } from '../math';
import { ENGINE_ANCHORS } from './anchors';
import { ENGINE_NODES, engineAssetErrors, partNode, type Box, type EngineAssetFacts, INTERNALS_NODES, internalsAssetErrors } from './manifest';

/** Each part's bounds: a 10 cm box around its anchor, which every anchor sits inside. */
const around = (id: (typeof ENGINE_TOPIC_IDS)[number]): Box => {
  const [x, y, z] = ENGINE_ANCHORS[id].position;
  return { min: [x - 0.05, y - 0.05, z - 0.05], max: [x + 0.05, y + 0.05, z + 0.05] };
};
const union = (a: Box, b: Box): Box => ({ min: a.min.map((v, i) => Math.min(v, b.min[i]!)) as Vec3, max: a.max.map((v, i) => Math.max(v, b.max[i]!)) as Vec3 });
/** A box whose top sits `gap` below the game-turbo hotspot: the airbox, which that hotspot floats above. */
const belowTurbo = (gap: number): Box => {
  const [x, y, z] = ENGINE_ANCHORS['game-turbo'].position;
  return { min: [x - 0.1, y - gap - 0.1, z - 0.1], max: [x + 0.1, y - gap, z + 0.1] };
};
const partBounds: Record<string, Box> = Object.fromEntries(ENGINE_TOPIC_IDS.filter((id) => id !== 'game-turbo').map((id) => [partNode(id), around(id)]));
partBounds.Part_restrictors = union(around('restrictors'), belowTurbo(0.1));
const good: EngineAssetFacts = { nodeNames: [...ENGINE_NODES], bytes: 2_500_000, triangles: 70_000, textureMimeTypes: ['image/ktx2', 'image/ktx2'], partBounds };

describe('engine asset contract', () => {
  it('names a root for the engine and the bay, and one node per engine part', () => {
    expect(ENGINE_NODES).toContain('Engine');
    expect(ENGINE_NODES).toContain('Bay');
    expect(ENGINE_NODES).toContain('Part_heads');
    expect(ENGINE_NODES).not.toContain('Part_game-turbo'); // the turbo is only in the game, so it has no part
  });

  it('accepts a model inside the budgets whose anchors sit on their parts', () => {
    expect(engineAssetErrors(good)).toEqual([]);
  });

  it('explains every violation', () => {
    const [x, y, z] = ENGINE_ANCHORS.heads.position;
    const far = { ...partBounds, Part_heads: { min: [x - 0.05, y + 0.5, z - 0.05], max: [x + 0.05, y + 0.6, z + 0.05] } as Box };
    expect(engineAssetErrors({ nodeNames: ENGINE_NODES.filter((name) => name !== 'Bay'), bytes: 5 * 1048576, triangles: 95_000, textureMimeTypes: ['image/png'], partBounds: far })).toEqual([
      'missing node: Bay',
      'file is 5.0 MB; budget is 4 MB',
      '95000 triangles; budget is 90000',
      '1 texture(s) are not KTX2',
      'the heads hotspot is 0.50 m from Part_heads',
    ]);
  });

  it('lets the game-turbo hotspot float above the airbox, but not far from it', () => {
    const turboErrors = (gap: number) =>
      engineAssetErrors({ ...good, partBounds: { ...partBounds, Part_restrictors: belowTurbo(gap) } }).filter((error) => error.startsWith('the game-turbo'));
    expect(turboErrors(0.15)).toEqual([]);
    expect(turboErrors(0.3)).toEqual(['the game-turbo hotspot is 0.30 m from Part_restrictors']);
  });
});

describe('internalsAssetErrors', () => {
  const axis = [0.6, 0.8, 0];
  const good = {
    nodeNames: [...INTERNALS_NODES],
    bytes: 300_000,
    triangles: 20_000,
    valveAxes: Object.fromEntries(INTERNALS_NODES.filter((name) => name.startsWith('Valve_')).map((name) => [name, axis])),
    pivotsWithMeshes: [],
  };

  it('accepts a complete set of moving parts', () => {
    expect(internalsAssetErrors(good)).toEqual([]);
  });

  it('names every moving part the animation drives', () => {
    expect(INTERNALS_NODES).toContain('Crank');
    expect(INTERNALS_NODES.filter((name) => /^Piston_\d$/.test(name))).toHaveLength(8);
    expect(INTERNALS_NODES.filter((name) => /^Rod_\d$/.test(name))).toHaveLength(8);
    expect(INTERNALS_NODES.filter((name) => /^Cam_/.test(name))).toHaveLength(4);
    expect(INTERNALS_NODES.filter((name) => /^Valve_\d_(in|ex)$/.test(name))).toHaveLength(16);
  });

  it('wants each moving part as a pivot holding its mesh, so compression can’t move the pivot', () => {
    expect(internalsAssetErrors({ ...good, pivotsWithMeshes: ['Crank', 'Rod_1'] })).toEqual([
      'Crank holds its mesh directly; quantization would move its pivot',
      'Rod_1 holds its mesh directly; quantization would move its pivot',
    ]);
  });

  it('reports missing parts, budgets, and valves without a unit stem axis', () => {
    const errors = internalsAssetErrors({
      ...good,
      nodeNames: good.nodeNames.filter((name) => name !== 'Rod_3'),
      bytes: 2_000_000,
      triangles: 50_000,
      valveAxes: { ...good.valveAxes, Valve_1_in: undefined, Valve_2_ex: [0, 2, 0] },
    });
    expect(errors).toEqual([
      'missing node: Rod_3',
      'file is 1.9 MB; budget is 1 MB',
      '50000 triangles; budget is 40000',
      'Valve_1_in has no unit stem axis in its extras',
      'Valve_2_ex has no unit stem axis in its extras',
    ]);
  });
});
