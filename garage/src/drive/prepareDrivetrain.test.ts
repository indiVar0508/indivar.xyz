import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { DriveSpin, type Gearbox } from './gears';
import { DRIVE_PIVOTS, ROLLER_NODES } from './manifest';
import { poseDrivetrain, prepareDrivetrain, setDriveGlow } from './prepareDrivetrain';

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

  it('lights the path the drive takes, in proportion to its load, and nothing in neutral', () => {
    const rig = prepareDrivetrain(fakeDrivetrain(), box);
    expect(material(rig, 'Gear_3')).not.toBe(material(rig, 'Gear_2'));
    setDriveGlow(rig, 3, 0.5);
    for (const name of ['Input', 'Layshaft', 'Lay_3', 'Gear_3', 'Dog_34', 'Output', 'Propshaft', 'Axle']) expect(material(rig, name).emissiveIntensity, name).toBeGreaterThan(0);
    for (const name of ['Lay_2', 'Gear_4', 'Dog_12', 'Flywheel']) expect(material(rig, name).emissiveIntensity, name).toBe(0);
    const half = material(rig, 'Gear_3').emissiveIntensity;
    setDriveGlow(rig, 3, 1);
    expect(material(rig, 'Gear_3').emissiveIntensity).toBeGreaterThan(half);
    setDriveGlow(rig, 0, 1);
    expect(material(rig, 'Gear_3').emissiveIntensity).toBe(0);
  });
});
