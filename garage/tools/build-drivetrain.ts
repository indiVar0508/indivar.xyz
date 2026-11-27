// Builds public/models/drivetrain.glb, the clutch, gearbox, propshaft and differential behind the P60B40 and the rolling
// road under the rear wheels, from tools/blender/build_drivetrain.py. The tooth counts and tyre radius come from
// p60.wasm, so the gears agree with the sound and the physics; the engine's origin and the rear wheels' centres come
// from the car model and src/engine/anchors.ts, so the driveline lines up with both models.
// Usage: npm run build:drivetrain [-- preview-dir]   (a preview dir also keeps the raw GLB and layout.json)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { ENGINE_OFFSET } from '../src/engine/anchors.ts';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv[2] ? resolve(process.argv[2]) : null;
const output = join(root, 'public/models/drivetrain.glb');
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit' });

type Gearbox = { p60_gearbox(id: number): number; p60_constant(id: number): number };
const { instance } = await WebAssembly.instantiate(readFileSync(join(root, 'public/wasm/p60.wasm')), {});
const p60 = instance.exports as unknown as Gearbox;
const teeth = (id: number) => p60.p60_gearbox(id);

await MeshoptDecoder.ready;
const car = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(join(root, 'public/models/m3-gtr.glb'));
const marker = (name: string) => {
  const node = car.getRoot().listNodes().find((candidate) => candidate.getName() === name);
  if (!node) throw new Error(`m3-gtr.glb has no ${name}`);
  return node.getWorldTranslation();
};
const bay = marker('Marker_EngineBay');
const layout = {
  engineOrigin: bay.map((v, axis) => v + ENGINE_OFFSET[axis]!),
  wheelRL: marker('Marker_Wheel_RL'),
  wheelRR: marker('Marker_Wheel_RR'),
  tyreRadius: p60.p60_constant(8),
  constantMesh: [teeth(0), teeth(1)],
  gears: Array.from({ length: 6 }, (_, k) => [teeth(2 + 2 * k), teeth(3 + 2 * k)]),
  finalDrive: [teeth(14), teeth(15)],
};

const work = mkdtempSync(join(tmpdir(), 'garage-drivetrain-'));
try {
  writeFileSync(join(work, 'layout.json'), JSON.stringify(layout, null, 2));
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/build_drivetrain.py'), '--', join(work, 'layout.json'), join(work, 'raw.glb')]);
  run(join(root, 'node_modules/.bin/gltf-transform'), ['meshopt', join(work, 'raw.glb'), output, '--level', 'medium']);
  if (preview) {
    mkdirSync(preview, { recursive: true });
    for (const name of ['raw.glb', 'layout.json']) copyFileSync(join(work, name), join(preview, name));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
