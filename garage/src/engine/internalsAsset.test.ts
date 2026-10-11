// Checks the committed p60b40-internals.glb against the crate's timing: the geometry has to agree with the animation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { cylinderLayout } from './geometry';
import { instantiateP60, type P60Exports } from './p60';

const MODELS = resolve(import.meta.dirname, '../../public/models');
let nodes: Map<string, Node>;
let p60: P60Exports;

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(`${MODELS}/p60b40-internals.glb`);
  nodes = new Map(document.getRoot().listNodes().map((node) => [node.getName(), node]));
  p60 = await instantiateP60(readFileSync(resolve(import.meta.dirname, '../../public/wasm/p60.wasm')));
});

/** A pivot's mesh, in engine space. */
function vertices(pivot: string): Vector3[] {
  const holder = nodes.get(pivot)!.listChildren()[0]!;
  const matrix = new Matrix4().fromArray(holder.getWorldMatrix());
  const position = holder.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
  return Array.from({ length: position.getCount() }, (_, i) => new Vector3().fromArray(position.getElement(i, [0, 0, 0])).applyMatrix4(matrix));
}

/** Clockwise from +y as seen from the front, in degrees: the crate's angle convention. */
const clockwise = (x: number, y: number) => (Math.atan2(x, y) * 180) / Math.PI;
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('p60b40-internals.glb', () => {
  it('keeps every pivot where the animation expects it', () => {
    const top = p60.p60_constant(0) + p60.p60_constant(1);
    for (const cylinder of cylinderLayout()) {
      const piston = nodes.get(`Piston_${cylinder.number}`)!.getTranslation();
      expect(piston[0]).toBeCloseTo(cylinder.axis[0] * top, 4);
      expect(piston[1]).toBeCloseTo(cylinder.axis[1] * top, 4);
      expect(piston[2]).toBeCloseTo(cylinder.center[2], 4);
      expect(nodes.get(`Rod_${cylinder.number}`)!.getTranslation()).toEqual([0, 0, expect.closeTo(cylinder.center[2], 4)]);
    }
    expect(nodes.get('Crank')!.getTranslation()).toEqual([0, 0, 0]);
  });

  it('times every cam lobe so its nose meets its tappet at peak lift', () => {
    for (const bank of ['right', 'left'] as const) {
      for (const kind of ['in', 'ex'] as const) {
        const cam = nodes.get(`Cam_${bank}_${kind}`)!;
        const [cx, cy, cz] = cam.getTranslation();
        const points = vertices(cam.getName());
        for (const cylinder of cylinderLayout().filter((c) => c.bank === bank)) {
          const axis = nodes.get(`Valve_${cylinder.number}_${kind}`)!.getExtras().axis as number[];
          const tappet = clockwise(-axis[0]!, -axis[1]!);
          const peak = p60.p60_valve_centre(cylinder.number, kind === 'ex' ? 1 : 0);
          for (const dz of [-0.018, 0.018]) {
            const lobe = points.filter((p) => Math.abs(p.z - (cylinder.center[2] + dz)) < 0.0075); // both faces of the 13 mm lobe
            const nose = lobe.reduce((best, p) => (Math.hypot(p.x - cx, p.y - cy) > Math.hypot(best.x - cx, best.y - cy) ? p : best));
            expect(Math.hypot(nose.x - cx, nose.y - cy), `${cam.getName()} cylinder ${cylinder.number}`).toBeCloseTo(p60.p60_constant(5) + p60.p60_constant(3), 3);
            // The cam turns clockwise by half the crank angle.
            expect(gap(clockwise(nose.x - cx, nose.y - cy) + peak / 2, tappet), `${cam.getName()} cylinder ${cylinder.number}`).toBeLessThan(4);
          }
        }
        expect(cz).toBeCloseTo(cylinderLayout().filter((c) => c.bank === bank).reduce((sum, c) => sum + c.center[2], 0) / 4, 4);
      }
    }
  });
});
