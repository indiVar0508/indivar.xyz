import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { DriveSpin, type Gearbox } from './gears';
import { CLUTCH_NODES, DRIVE_PIVOTS, ROLLER_NODES } from './manifest';
import type { ReplayPose } from './shiftReplay';
import { CUE, poseDrivetrain, prepareDrivetrain, setDriveGlow } from './prepareDrivetrain';

const box: Gearbox = {
  constantMesh: [23, 31],
  gears: [[21, 37], [25, 33], [28, 30], [30, 28], [32, 26], [34, 24]],
  finalDrive: [13, 50],
  tyreRadius: 0.322,
  shiftSeconds: 0.12,
  efficiency: 0.9,
  limitRpm: 8500,
};

/** The drivetrain GLB's shape: Driveline and Rollers under Drivetrain, every pivot holding a mesh child, one shared material. */
function fakeDrivetrain(omit?: string) {
  const shared = new MeshStandardMaterial();
  const root = Object.assign(new Group(), { name: 'Drivetrain' });
  const driveline = Object.assign(new Object3D(), { name: 'Driveline' });
  const rollers = Object.assign(new Object3D(), { name: 'Rollers' });
  root.add(driveline, rollers);
  for (const name of DRIVE_PIVOTS) {
    const pivot = Object.assign(new Object3D(), { name });
    pivot.add(Object.assign(new Mesh(new BoxGeometry(), shared), { name: `${name}_mesh` }));
    if (name.startsWith('Dog_') || name.startsWith('Fork_')) pivot.position.z = 0.6;
    if (name.startsWith('Dog_')) pivot.userData.travel = 0.009;
    if (name.startsWith('Roller_')) pivot.userData.radius = 0.11;
    if (name.startsWith('Clutch_')) {
      pivot.position.z = 0.95;
      pivot.userData.spread = 0.004 * (CLUTCH_NODES.indexOf(name as (typeof CLUTCH_NODES)[number]) + 1);
    }
    (name.startsWith('Roller_') ? rollers : driveline).add(pivot);
  }
  driveline.add(Object.assign(new Mesh(new BoxGeometry(), shared), { name: 'Case_gearbox' }));
  if (omit) root.getObjectByName(omit)!.removeFromParent();
  return root;
}

const material = (rig: ReturnType<typeof prepareDrivetrain>, name: string) => (rig.root.getObjectByName(`${name}_mesh`) as Mesh).material as MeshStandardMaterial;

describe('prepareDrivetrain', () => {
  it('names every missing contract node', () => {
    expect(() => prepareDrivetrain(fakeDrivetrain('Gear_4'), box)).toThrow('missing nodes: Gear_4');
  });

  it('turns each roller against its tyre, at the ratio of their radii, and the cases into a ghost', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    expect(rig.rollers.map(({ node }) => node.name)).toEqual([...ROLLER_NODES]);
    expect(rig.rollers[0]!.ratio).toBeCloseTo(0.322 / 0.11, 6);
    expect((rig.root.getObjectByName('Case_gearbox') as Mesh).material).toBeInstanceOf(ShaderMaterial);
  });

  it('poses every shaft from the spin: along the car the crank’s way round, the axle about x', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    const spin = new DriveSpin(box);
    spin.step(0.3, 0.02, 2);
    poseDrivetrain(rig, spin, 2, 1 / 60);
    expect(rig.flywheel.rotation.z).toBeCloseTo(-spin.flywheel, 6);
    expect(rig.input.rotation.z).toBeCloseTo(-spin.input, 6);
    expect(rig.layshaft.rotation.z).toBeCloseTo(-spin.layshaft, 6);
    expect(rig.lays[4]!.rotation.z).toBeCloseTo(-spin.layshaft, 6);
    expect(rig.gears[0]!.rotation.z).toBeCloseTo(-spin.outputs[0]!, 6);
    expect(rig.output.rotation.z).toBeCloseTo(-spin.output, 6);
    expect(rig.propshaft.rotation.z).toBeCloseTo(-spin.output, 6);
    expect(rig.axle.rotation.x).toBeCloseTo(spin.wheel, 6);
  });

  it('slides the engaged gear’s dog ring and fork toward it, and centres the others', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    const spin = new DriveSpin(box);
    for (let i = 0; i < 60; i++) poseDrivetrain(rig, spin, 4, 1 / 60);
    const [ring12, ring34] = rig.dogs;
    expect(ring34!.ring.position.z).toBeCloseTo(0.6 + 0.009, 4);
    expect(ring34!.fork.position.z).toBeCloseTo(ring34!.ring.position.z, 6);
    expect(ring12!.ring.position.z).toBeCloseTo(0.6, 6);
  });

  const pose = (over: Partial<ReplayPose>): ReplayPose => ({ step: 'out', clutch: 1, rings: [0, 0, 0], moving: 0, gear: 2, ...over });

  it('spreads the clutch pack as it opens, each piece back by its own spread, the discs turning with the gearbox', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    const spin = new DriveSpin(box);
    spin.step(0.4, 0.01, 2);
    poseDrivetrain(rig, spin, 2, 1 / 60, pose({ clutch: 1 }));
    expect(rig.clutch.map(({ node }) => node.name)).toEqual([...CLUTCH_NODES]);
    rig.clutch.forEach(({ node, spread }) => expect(node.position.z, node.name).toBeCloseTo(0.95 - spread, 6));
    poseDrivetrain(rig, spin, 2, 1 / 60, pose({ clutch: 0.5 }));
    rig.clutch.forEach(({ node, spread }) => expect(node.position.z, node.name).toBeCloseTo(0.95 - spread / 2, 6));
    const turn = (name: string) => rig.root.getObjectByName(name)!.rotation.z;
    expect(turn('Clutch_disc_2')).toBeCloseTo(-spin.input, 6);
    expect(turn('Clutch_plate_2')).toBeCloseTo(-spin.flywheel, 6);
  });

  it('without a replay, eases the clutch shut in gear and open in neutral, where it drives nothing', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    const spin = new DriveSpin(box);
    for (let i = 0; i < 60; i++) poseDrivetrain(rig, spin, 0, 1 / 60);
    rig.clutch.forEach(({ node, spread }) => expect(node.position.z, node.name).toBeCloseTo(0.95 - spread, 4));
    for (let i = 0; i < 60; i++) poseDrivetrain(rig, spin, 3, 1 / 60);
    rig.clutch.forEach(({ node }) => expect(node.position.z, node.name).toBeCloseTo(0.95, 4));
  });

  it('puts the dog rings exactly where a replay has them, whatever the gear', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    poseDrivetrain(rig, new DriveSpin(box), 3, 1 / 60, pose({ rings: [0.5, -0.25, 0] }));
    expect(rig.dogs[0]!.ring.position.z).toBeCloseTo(0.6 + 0.5 * 0.009, 6);
    expect(rig.dogs[1]!.ring.position.z).toBeCloseTo(0.6 - 0.25 * 0.009, 6);
    expect(rig.dogs[1]!.fork.position.z).toBeCloseTo(rig.dogs[1]!.ring.position.z, 6);
  });

  it('picks out the parts a step moves in a colour of their own', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    setDriveGlow(rig, 2, 0, ['Dog_12', 'Fork_12']);
    for (const name of ['Dog_12', 'Fork_12']) {
      expect(material(rig, name).emissiveIntensity, name).toBeGreaterThan(0);
      expect(material(rig, name).emissive.getHex(), name).toBe(CUE.getHex());
    }
    expect(material(rig, 'Fork_34').emissiveIntensity).toBe(0);
    expect(material(rig, 'Gear_2').emissiveIntensity).toBe(0);
  });

  it('lights the path the drive takes, in proportion to its load, and nothing in neutral', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    expect(material(rig, 'Gear_3')).not.toBe(material(rig, 'Gear_2'));
    setDriveGlow(rig, 3, 0.5);
    for (const name of [...CLUTCH_NODES, 'Input', 'Layshaft', 'Lay_3', 'Gear_3', 'Dog_34', 'Output', 'Propshaft', 'Axle']) expect(material(rig, name).emissiveIntensity, name).toBeGreaterThan(0);
    for (const name of ['Lay_2', 'Gear_4', 'Dog_12', 'Flywheel']) expect(material(rig, name).emissiveIntensity, name).toBe(0);
    const half = material(rig, 'Gear_3').emissiveIntensity;
    setDriveGlow(rig, 3, 1);
    expect(material(rig, 'Gear_3').emissiveIntensity).toBeGreaterThan(half);
    setDriveGlow(rig, 0, 1);
    expect(material(rig, 'Gear_3').emissiveIntensity).toBe(0);
  });
});
