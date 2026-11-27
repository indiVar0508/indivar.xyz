// Checks the committed drivetrain.glb against the crate's gearbox and the car: the geometry has to agree with the
// physics, the sound, and where the engine and the wheels are.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENGINE_OFFSET } from '../engine/anchors';
import { instantiateP60, readGearbox } from '../engine/p60';
import type { Gearbox } from './gears';
import { ROLLER_NODES } from './manifest';

const MODELS = resolve(import.meta.dirname, '../../public/models');
let drive: Map<string, Node>;
let car: Map<string, Node>;
let box: Gearbox;

const nodesOf = (document: Document) => new Map(document.getRoot().listNodes().map((node) => [node.getName(), node]));

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  drive = nodesOf(await io.read(`${MODELS}/drivetrain.glb`));
  car = nodesOf(await io.read(`${MODELS}/m3-gtr.glb`));
  box = readGearbox(await instantiateP60(readFileSync(resolve(import.meta.dirname, '../../public/wasm/p60.wasm'))));
});

const at = (nodes: Map<string, Node>, name: string) => new Vector3().fromArray(nodes.get(name)!.getWorldTranslation());

/** A pivot's mesh, in car space. */
function vertices(pivot: string): Vector3[] {
  const holder = drive.get(pivot)!.listChildren()[0]!;
  const matrix = new Matrix4().fromArray(holder.getWorldMatrix());
  const position = holder.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
  return Array.from({ length: position.getCount() }, (_, i) => new Vector3().fromArray(position.getElement(i, [0, 0, 0])).applyMatrix4(matrix));
}

/** How far a pivot’s mesh reaches from its own axis, within `dz` of `z` (just over half a gear’s 16 mm face). */
function reach(pivot: string, z: number, dz = 0.0085): number {
  const centre = at(drive, pivot);
  return Math.max(...vertices(pivot).filter((v) => Math.abs(v.z - z) < dz).map((v) => Math.hypot(v.x - centre.x, v.y - centre.y)));
}

describe('drivetrain.glb', () => {
  it('carries the crank’s axis through the clutch, the gearbox and the propshaft', () => {
    const crank = at(car, 'Marker_EngineBay').add(new Vector3(...ENGINE_OFFSET));
    for (const name of ['Flywheel', 'Input', 'Output', 'Gear_1', 'Gear_6', 'Propshaft']) {
      const pivot = at(drive, name);
      expect(pivot.x, name).toBeCloseTo(crank.x, 3);
      expect(pivot.y, name).toBeCloseTo(crank.y, 3);
    }
    expect(at(drive, 'Layshaft').y).toBeLessThan(crank.y - 0.05);
  });

  it('turns the axle about the rear wheels’ own axis', () => {
    const left = at(car, 'Wheel_RL');
    const right = at(car, 'Wheel_RR');
    const axle = at(drive, 'Axle');
    expect(axle.y).toBeCloseTo(left.y, 3);
    expect(axle.z).toBeCloseTo(left.z, 3);
    expect(right.y).toBeCloseTo(left.y, 3);
  });

  it('sizes each gear pair by the crate’s tooth counts, at one centre distance', () => {
    const centres = at(drive, 'Output').y - at(drive, 'Layshaft').y;
    box.gears.forEach(([lay, out], k) => {
      const teeth = vertices(`Lay_${k + 1}`); // just the gear, so its middle is the pair's
      const z = teeth.reduce((sum, v) => sum + v.z, 0) / teeth.length;
      const module = (2 * centres) / (lay + out);
      const outTip = reach(`Gear_${k + 1}`, z);
      const layTip = reach(`Lay_${k + 1}`, z);
      expect(outTip, `gear ${k + 1}`).toBeCloseTo((module * out) / 2 + module, 3);
      expect(layTip, `gear ${k + 1}`).toBeCloseTo((module * lay) / 2 + module, 3);
    });
  });

  it('sets each roller against its tyre, set into the floor', () => {
    for (const name of ROLLER_NODES) {
      const roller = at(drive, name);
      const wheel = at(car, name.includes('RL') ? 'Wheel_RL' : 'Wheel_RR');
      const radius = drive.get(name)!.getExtras().radius as number;
      expect(Math.hypot(roller.y - wheel.y, roller.z - wheel.z), name).toBeCloseTo(box.tyreRadius + radius, 3);
      expect(roller.y + radius, name).toBeGreaterThan(0.01);
      expect(roller.y + radius, name).toBeLessThan(0.08);
    }
  });
});
