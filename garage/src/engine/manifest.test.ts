import { describe, expect, it } from 'vitest';
import { ENGINE_TOPIC_IDS } from '../content/engine';
import type { Vec3 } from '../math';
import { ENGINE_ANCHORS } from './anchors';
import { ENGINE_NODES, engineAssetErrors, partNode, SPIN_NODES, TURBO_NODES, turboAssetErrors, type Box, type EngineAssetFacts, INTERNALS_NODES, internalsAssetErrors } from './manifest';

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
const moving = {
  pivotsWithMeshes: [] as string[],
  spinRadii: Object.fromEntries(SPIN_NODES.map((name) => [name, 0.05])) as Record<string, unknown>,
  flows: Object.fromEntries(ENGINE_NODES.filter((name) => name.startsWith('Flow_')).map((name) => [name, [0, 0, 0, 0, 0.1, 0]])) as Record<string, unknown>,
};
const good: EngineAssetFacts = { nodeNames: [...ENGINE_NODES], bytes: 2_500_000, triangles: 70_000, textureMimeTypes: ['image/ktx2', 'image/ktx2'], partBounds, ...moving };

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
    expect(engineAssetErrors({ ...moving, nodeNames: ENGINE_NODES.filter((name) => name !== 'Bay'), bytes: 5 * 1048576, triangles: 95_000, textureMimeTypes: ['image/png'], partBounds: far })).toEqual([
      'missing node: Bay',
      'file is 5.0 MB; budget is 4 MB',
      '95000 triangles; budget is 90000',
      '1 texture(s) are not KTX2',
      'the heads hotspot is 0.50 m from Part_heads',
    ]);
  });

  it('names the pulleys, butterflies, injector tips and exhaust paths the page animates', () => {
    expect(SPIN_NODES).toEqual(['Spin_crank', 'Spin_tensioner', 'Spin_alternator', 'Spin_water_pump', 'Spin_idler']);
    for (const n of [1, 8]) {
      expect(ENGINE_NODES).toContain(`Throttle_${n}`);
      expect(ENGINE_NODES).toContain(`Injector_${n}`);
      expect(ENGINE_NODES).toContain(`Flow_exhaust_${n}`);
    }
  });

  it('wants moving parts as pivots with a radius, and flow paths of whole points', () => {
    expect(engineAssetErrors({ ...good, pivotsWithMeshes: ['Spin_idler'], spinRadii: { ...moving.spinRadii, Spin_crank: undefined }, flows: { ...moving.flows, Flow_exhaust_3: [0, 0, 0, 1] } })).toEqual([
      'Spin_idler holds its mesh directly; quantization would move its pivot',
      'Spin_crank has no pulley radius in its extras',
      'Flow_exhaust_3 needs two or more points (x, y, z, ...)',
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
    expect(INTERNALS_NODES).toEqual(expect.arrayContaining(['Starter_pinion', 'Plugs']));
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

describe('turboAssetErrors', () => {
  const good = {
    nodeNames: [...TURBO_NODES],
    bytes: 200_000,
    triangles: 12_000,
    pivotsWithMeshes: [],
    flows: Object.fromEntries(TURBO_NODES.filter((name) => name.startsWith('Flow_')).map((name) => [name, [0, 0, 0, 1, 1, 1]])),
  };

  it('accepts the kit: two turbos with spinning compressors, charge pipes and downpipes', () => {
    expect(turboAssetErrors(good)).toEqual([]);
    expect(TURBO_NODES).toEqual(expect.arrayContaining(['Turbo', 'Compressor_left', 'Compressor_right', 'Flow_charge_left', 'Flow_exhaust_turbo_right']));
  });

  it('explains what is wrong', () => {
    expect(turboAssetErrors({ ...good, nodeNames: good.nodeNames.filter((n) => n !== 'Compressor_left'), bytes: 2_000_000, triangles: 31_000, pivotsWithMeshes: ['Compressor_right'] })).toEqual([
      'missing node: Compressor_left',
      'file is 1.9 MB; budget is 1 MB',
      '31000 triangles; budget is 30000',
      'Compressor_right holds its mesh directly; quantization would move its pivot',
    ]);
  });
});
