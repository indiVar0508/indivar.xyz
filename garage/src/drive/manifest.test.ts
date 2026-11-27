import { describe, expect, it } from 'vitest';
import { DRIVE_NODES, driveAssetErrors, type DriveAssetFacts } from './manifest';

const good: DriveAssetFacts = {
  nodeNames: [...DRIVE_NODES, 'Case_gearbox'],
  bytes: 250_000,
  triangles: 20_000,
  pivotsWithMeshes: [],
  dogTravel: { Dog_12: 0.009, Dog_34: 0.009, Dog_56: 0.009 },
  rollerRadii: { Roller_RL_front: 0.11, Roller_RL_rear: 0.11, Roller_RR_front: 0.11, Roller_RR_rear: 0.11 },
};

describe('drivetrain asset contract', () => {
  it('names every part the page turns or slides, and the rollers', () => {
    expect(DRIVE_NODES).toEqual(expect.arrayContaining(['Driveline', 'Rollers', 'Flywheel', 'Input', 'Layshaft', 'Output', 'Propshaft', 'Axle']));
    expect(DRIVE_NODES.filter((name) => /^Gear_\d$/.test(name))).toHaveLength(6);
    expect(DRIVE_NODES.filter((name) => /^Lay_\d$/.test(name))).toHaveLength(6);
    expect(DRIVE_NODES.filter((name) => /^Dog_/.test(name))).toEqual(['Dog_12', 'Dog_34', 'Dog_56']);
    expect(DRIVE_NODES.filter((name) => /^Roller_/.test(name))).toHaveLength(4);
  });

  it('accepts a complete drivetrain inside its budget', () => {
    expect(driveAssetErrors(good)).toEqual([]);
  });

  it('explains what is wrong', () => {
    expect(
      driveAssetErrors({
        ...good,
        nodeNames: good.nodeNames.filter((name) => name !== 'Gear_3'),
        bytes: 2_000_000,
        triangles: 31_000,
        pivotsWithMeshes: ['Axle'],
        dogTravel: { ...good.dogTravel, Dog_34: undefined },
        rollerRadii: { ...good.rollerRadii, Roller_RR_rear: 0 },
      }),
    ).toEqual([
      'missing node: Gear_3',
      'file is 1.9 MB; budget is 1 MB',
      '31000 triangles; budget is 30000',
      'Axle holds its mesh directly; quantization would move its pivot',
      'Dog_34 has no travel in its extras',
      'Roller_RR_rear has no radius in its extras',
    ]);
  });
});
