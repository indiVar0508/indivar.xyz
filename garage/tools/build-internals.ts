// Builds public/models/p60b40-internals.glb, the P60B40's moving parts for the x-ray view, from
// tools/blender/build_internals.py. The timing comes from p60.wasm, so the cam lobes agree with the animation and
// the sound; the cylinders come from src/engine/geometry.ts, like the engine's.
// Usage: npm run build:internals [-- preview-dir]   (a preview dir also keeps the raw GLB and layout.json)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cylinderLayout } from '../src/engine/geometry.ts';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv[2] ? resolve(process.argv[2]) : null;
const output = join(root, 'public/models/p60b40-internals.glb');
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit' });

type Timing = Record<'p60_fire_angle' | 'p60_pin_phase', (cylinder: number) => number> & {
  p60_valve_centre(cylinder: number, exhaust: number): number;
  p60_constant(id: number): number;
};
const { instance } = await WebAssembly.instantiate(readFileSync(join(root, 'public/wasm/p60.wasm')), {});
const p60 = instance.exports as unknown as Timing;
const cylinders = [1, 2, 3, 4, 5, 6, 7, 8];
const kinematics = {
  crankRadius: p60.p60_constant(0),
  rodLength: p60.p60_constant(1),
  compressionHeight: p60.p60_constant(2),
  valveLift: p60.p60_constant(3),
  valveDuration: p60.p60_constant(4),
  camBaseRadius: p60.p60_constant(5),
  pinPhases: cylinders.map((n) => p60.p60_pin_phase(n)),
  valveCentres: cylinders.map((n) => [p60.p60_valve_centre(n, 0), p60.p60_valve_centre(n, 1)]),
};

const work = mkdtempSync(join(tmpdir(), 'garage-internals-'));
try {
  writeFileSync(join(work, 'layout.json'), JSON.stringify({ cylinders: cylinderLayout(), kinematics }, null, 2));
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/build_internals.py'), '--', join(work, 'layout.json'), join(work, 'raw.glb')]);
  run(join(root, 'node_modules/.bin/gltf-transform'), ['meshopt', join(work, 'raw.glb'), output, '--level', 'medium']);
  if (preview) {
    mkdirSync(preview, { recursive: true });
    for (const name of ['raw.glb', 'layout.json']) copyFileSync(join(work, name), join(preview, name));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
