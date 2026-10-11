import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { cylinderLayout } from './geometry';
import { poseInternals, prepareInternals } from './internals';
import { INTERNALS_NODES } from './manifest';
import { FRAME, instantiateP60, Kinematics } from './p60';

let kinematics: Kinematics;
beforeAll(async () => {
  kinematics = new Kinematics(await instantiateP60(readFileSync(resolve(import.meta.dirname, '../../public/wasm/p60.wasm'))));
});

/** The internals file's node tree, as GLTFLoader would give it: pivots placed, valves carrying their stem axis. */
function fakeInternals(): Group {
  const root = new Group();
  root.name = 'Internals';
  const cylinders = cylinderLayout();
  for (const name of INTERNALS_NODES.slice(1)) {
    const part = new Mesh(undefined, new MeshBasicMaterial());
    part.name = name;
    const n = Number(name.match(/_(\d)/)?.[1]);
    if (name.startsWith('Rod_') || name.startsWith('Piston_')) part.position.z = cylinders[n - 1]!.center[2];
    if (name.startsWith('Valve_')) {
      part.position.set(0.1 * n, 0.2, cylinders[n - 1]!.center[2]);
      part.userData.axis = [0.6, 0.8, 0];
    }
    root.add(part);
  }
  return root;
}

describe('internals', () => {
  it('poses every moving part from a kinematics frame', () => {
    const rig = prepareInternals(fakeInternals());
    const fire = kinematics.fireAngles[0]!;
    const frame = kinematics.frame(fire + 100);
    poseInternals(rig, frame, true);
    const cylinders = cylinderLayout();
    const crank = rig.root.getObjectByName('Crank')!;
    expect(crank.rotation.z).toBeCloseTo(frame[FRAME.crank]!, 6);
    for (const [i, cylinder] of cylinders.entries()) {
      const piston = rig.root.getObjectByName(`Piston_${i + 1}`)!;
      const expected = new Vector3(...cylinder.axis).multiplyScalar(frame[FRAME.piston(i)]!).setZ(cylinder.center[2]);
      expect(piston.position.distanceTo(expected)).toBeLessThan(1e-6);
      const rod = rig.root.getObjectByName(`Rod_${i + 1}`)!;
      expect(rod.position.toArray()).toEqual([frame[FRAME.pinX(i)], frame[FRAME.pinY(i)], cylinder.center[2]]);
      expect(rod.rotation.z).toBeCloseTo(frame[FRAME.rod(i)]!, 6);
    }
    for (const name of ['Cam_right_in', 'Cam_left_ex']) expect(rig.root.getObjectByName(name)!.rotation.z).toBeCloseTo(frame[FRAME.cam]!, 6);
  });

  it('pushes valves open against their stem axis, and puts them back', () => {
    const rig = prepareInternals(fakeInternals());
    const valve = rig.root.getObjectByName('Valve_1_ex')!;
    const rest = valve.position.clone();
    const crank = kinematics.fireAngles[0]! + 360 - 105; // peak exhaust lift for cylinder 1
    poseInternals(rig, kinematics.frame(crank), true);
    const lift = kinematics.frame(crank)[FRAME.exhaustLift(0)]!;
    expect(lift).toBeGreaterThan(0.011);
    expect(valve.position.distanceTo(rest.clone().addScaledVector(new Vector3(0.6, 0.8, 0), -lift))).toBeLessThan(1e-6);
    poseInternals(rig, kinematics.frame(kinematics.fireAngles[0]!), true);
    expect(valve.position.distanceTo(rest)).toBeLessThan(1e-9);
  });

  it('lights a cylinder as it fires, and none while the engine is not burning fuel', () => {
    const rig = prepareInternals(fakeInternals());
    poseInternals(rig, kinematics.frame(kinematics.fireAngles[2]! + 5), true);
    const lit = rig.flames.map((flame) => (flame.visible ? flame.material.opacity : 0));
    expect(lit.indexOf(Math.max(...lit))).toBe(2);
    expect(lit.filter((opacity) => opacity > 0)).toHaveLength(2); // the cylinder before it is still fading
    poseInternals(rig, kinematics.frame(kinematics.fireAngles[2]! + 5), false);
    expect(rig.flames.some((flame) => flame.visible)).toBe(false);
  });

  it('refuses a file without the parts it drives', () => {
    const root = fakeInternals();
    root.remove(root.getObjectByName('Piston_4')!);
    expect(() => prepareInternals(root)).toThrow(/Piston_4/);
  });
});
