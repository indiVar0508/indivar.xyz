import { Color, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { ghostMaterial } from '../engine/prepareEngine';
import { dogOffset, type DriveSpin, type Gearbox } from './gears';
import { CASE_PREFIX, DOG_NODES, DRIVE_NODES, DRIVE_PIVOTS, FORK_NODES, gearNode, layNode, ROLLER_NODES } from './manifest';

export type DriveRig = {
  root: Object3D;
  /** Shown only in the drivetrain x-ray; the rollers are always there. */
  driveline: Object3D;
  flywheel: Object3D;
  input: Object3D;
  layshaft: Object3D;
  /** The layshaft's gears and the output shaft's, 1st to 6th. */
  lays: Object3D[];
  gears: Object3D[];
  output: Object3D;
  /** Each dog ring with its fork, where both sit centred, and how far they slide toward a gear. */
  dogs: { ring: Object3D; fork: Object3D; rest: number; travel: number }[];
  propshaft: Object3D;
  axle: Object3D;
  /** Each roller, and how many turns it makes for one of the tyre's. */
  rollers: { node: Object3D; ratio: number }[];
  /** Each pivot's own materials, so the drive's path can glow without lighting its neighbours. */
  materials: Record<string, MeshStandardMaterial[]>;
};

const GLOW = new Color('#ff7a1a');
const GLOW_INTENSITY = 1.6;
/** Seconds a dog ring takes to slide most of the way to its gear. */
const DOG_SLIDE = 0.06;

/** Validates the drivetrain contract, gives each pivot its own materials, ghosts the cases, and returns the handles. */
export function prepareDrivetrain(root: Object3D, box: Gearbox): DriveRig {
  if (root.userData.rig) return root.userData.rig as DriveRig;
  const missing = DRIVE_NODES.filter((name) => !root.getObjectByName(name));
  if (missing.length > 0) throw new Error(`drivetrain.glb is missing nodes: ${missing.join(', ')}`);
  const named = (name: string) => root.getObjectByName(name)!;

  const materials: Record<string, MeshStandardMaterial[]> = {};
  for (const name of DRIVE_PIVOTS) {
    materials[name] = [];
    named(name).traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      if (object.material instanceof MeshStandardMaterial) {
        object.material = object.material.clone();
        materials[name]!.push(object.material);
      }
    });
  }
  const ghost = ghostMaterial();
  root.traverse((object) => {
    if (object instanceof Mesh && object.name.startsWith(CASE_PREFIX)) object.material = ghost;
  });
  root.getObjectByName('Rollers')!.traverse((object) => {
    if (object instanceof Mesh) object.receiveShadow = true;
  });

  const gears = box.gears.map((_, k) => k + 1);
  const rig: DriveRig = {
    root,
    driveline: named('Driveline'),
    flywheel: named('Flywheel'),
    input: named('Input'),
    layshaft: named('Layshaft'),
    lays: gears.map((gear) => named(layNode(gear))),
    gears: gears.map((gear) => named(gearNode(gear))),
    output: named('Output'),
    dogs: DOG_NODES.map((name, k) => {
      const ring = named(name);
      return { ring, fork: named(FORK_NODES[k]!), rest: ring.position.z, travel: ring.userData.travel as number };
    }),
    propshaft: named('Propshaft'),
    axle: named('Axle'),
    rollers: ROLLER_NODES.map((name) => ({ node: named(name), ratio: box.tyreRadius / (named(name).userData.radius as number) })),
    materials,
  };
  root.userData.rig = rig;
  return rig;
}

/** Turns every shaft to its angle in `spin`, and eases each dog ring (and its fork) toward where `gear` puts it. */
export function poseDrivetrain(rig: DriveRig, spin: DriveSpin, gear: number, dt: number): void {
  // Shafts along the car turn the crank's way round, which is negative about z seen from the front.
  rig.flywheel.rotation.z = -spin.flywheel;
  rig.input.rotation.z = -spin.input;
  rig.layshaft.rotation.z = -spin.layshaft;
  for (const lay of rig.lays) lay.rotation.z = -spin.layshaft;
  rig.gears.forEach((wheel, k) => (wheel.rotation.z = -spin.outputs[k]!));
  rig.output.rotation.z = -spin.output;
  rig.propshaft.rotation.z = -spin.output;
  rig.axle.rotation.x = spin.wheel;
  const ease = 1 - Math.exp(-dt / DOG_SLIDE);
  rig.dogs.forEach(({ ring, fork, rest, travel }, k) => {
    ring.rotation.z = -spin.output;
    ring.position.z += (rest + dogOffset(k, gear) * travel - ring.position.z) * ease;
    fork.position.z = ring.position.z;
  });
}

/** Lights the drive's path through the gearbox in `gear`, brighter with `load` (0 to 1); nothing in neutral. */
export function setDriveGlow(rig: DriveRig, gear: number, load: number): void {
  const path = new Set<string>();
  if (gear > 0) {
    for (const name of ['Input', 'Layshaft', layNode(gear), gearNode(gear), DOG_NODES[Math.floor((gear - 1) / 2)]!, 'Output', 'Propshaft', 'Axle']) path.add(name);
  }
  const intensity = GLOW_INTENSITY * Math.max(0, Math.min(1, load));
  for (const [name, list] of Object.entries(rig.materials)) {
    const lit = path.has(name) ? intensity : 0;
    for (const material of list) {
      if (lit > 0) material.emissive.copy(GLOW);
      material.emissiveIntensity = lit;
    }
  }
}
