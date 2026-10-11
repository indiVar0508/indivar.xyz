import { AdditiveBlending, Color, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, type Object3D } from 'three';
import { cylinderLayout } from './geometry';
import { CAM_NODES, INTERNALS_NODES, valveNode } from './manifest';
import { FRAME } from './p60';

/** How far up the bore the combustion flash sits: between the crown at top dead centre and the valves. */
const FLAME_HEIGHT = 0.244;
/** Brighter than white, so the bloom pass catches it. */
const FLAME = new Color(8, 2.6, 0.5);

type Valve = { node: Object3D; rest: Vector3; axis: Vector3; cylinder: number; exhaust: boolean };

export type InternalsRig = {
  root: Object3D;
  crank: Object3D;
  rods: Object3D[];
  pistons: Object3D[];
  cams: Object3D[];
  valves: Valve[];
  flames: Mesh<SphereGeometry, MeshBasicMaterial>[];
  /** Each cylinder's bore direction. */
  bores: Vector3[];
};

/** Checks the moving parts' file and readies it to be posed. Mutates `root` once. */
export function prepareInternals(root: Object3D): InternalsRig {
  if (root.userData.rig) return root.userData.rig as InternalsRig;
  const named = (name: string) => root.getObjectByName(name);
  const missing = INTERNALS_NODES.slice(1).filter((name) => !named(name));
  if (missing.length > 0) throw new Error(`p60b40-internals.glb is missing nodes: ${missing.join(', ')}`);

  root.traverse((object) => {
    object.castShadow = false;
    object.receiveShadow = false;
  });
  const cylinders = cylinderLayout();
  const geometry = new SphereGeometry(0.046, 16, 8);
  geometry.scale(1, 0.6, 1);
  const flames = cylinders.map((cylinder) => {
    // Seen through the x-ray, so it shows through the valves and cams above it.
    const material = new MeshBasicMaterial({ color: FLAME, transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
    const flame = new Mesh(geometry, material);
    flame.renderOrder = 2;
    flame.name = `Flame_${cylinder.number}`;
    flame.position.set(...cylinder.axis).multiplyScalar(FLAME_HEIGHT).setZ(cylinder.center[2]);
    flame.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...cylinder.axis));
    flame.visible = false;
    root.add(flame);
    return flame;
  });
  const valves = cylinders.flatMap(({ number }) =>
    [false, true].map((exhaust) => {
      const node = named(valveNode(number, exhaust))!;
      return { node, rest: node.position.clone(), axis: new Vector3(...(node.userData.axis as [number, number, number])), cylinder: number - 1, exhaust };
    }),
  );
  const rig: InternalsRig = {
    root,
    crank: named('Crank')!,
    rods: cylinders.map(({ number }) => named(`Rod_${number}`)!),
    pistons: cylinders.map(({ number }) => named(`Piston_${number}`)!),
    cams: CAM_NODES.map((name) => named(name)!),
    valves,
    flames,
    bores: cylinders.map(({ axis }) => new Vector3(...axis)),
  };
  root.userData.rig = rig;
  return rig;
}

/** Moves every part to a kinematics frame from p60.wasm. Flames show only while the engine burns fuel. */
export function poseInternals(rig: InternalsRig, frame: Float32Array, burning: boolean): void {
  rig.crank.rotation.z = frame[FRAME.crank]!;
  for (const cam of rig.cams) cam.rotation.z = frame[FRAME.cam]!;
  rig.pistons.forEach((piston, i) => {
    const z = piston.position.z;
    piston.position.copy(rig.bores[i]!).multiplyScalar(frame[FRAME.piston(i)]!).setZ(z);
    rig.rods[i]!.position.set(frame[FRAME.pinX(i)]!, frame[FRAME.pinY(i)]!, rig.rods[i]!.position.z);
    rig.rods[i]!.rotation.z = frame[FRAME.rod(i)]!;
    const glow = burning ? frame[FRAME.glow(i)]! : 0;
    const flame = rig.flames[i]!;
    flame.visible = glow > 0.01;
    flame.material.opacity = glow;
    flame.scale.setScalar(0.55 + 0.6 * glow);
  });
  for (const valve of rig.valves) {
    const lift = frame[valve.exhaust ? FRAME.exhaustLift(valve.cylinder) : FRAME.intakeLift(valve.cylinder)]!;
    valve.node.position.copy(valve.rest).addScaledVector(valve.axis, -lift);
  }
}
