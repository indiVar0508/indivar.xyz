// Turns the raw Sketchfab download into public/models/m3-gtr.glb:
// Blender normalization, then KTX2 (Basis ETC1S) textures and meshopt geometry via glTF-Transform.
// Usage: npm run prepare:car [-- path/to/scene.gltf]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] ?? join(root, 'assets-src/model/scene.gltf'));
const ktxDir = join(root, 'tools/bin/ktx');
const output = join(root, 'public/models/m3-gtr.glb');
const report = join(root, 'assets-src/prepare-report.json');

if (!existsSync(input)) throw new Error(`Missing ${input}. Unzip the Sketchfab download into assets-src/model/ first.`);
if (!existsSync(join(ktxDir, 'bin/ktx'))) throw new Error('Missing KTX-Software. Run tools/install-ktx.sh first.');

const env = {
  ...process.env,
  PATH: `${join(ktxDir, 'bin')}:${process.env.PATH ?? ''}`,
  LD_LIBRARY_PATH: `${join(ktxDir, 'lib')}:${process.env.LD_LIBRARY_PATH ?? ''}`,
};
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit', env });
const gltfTransform = (...args: string[]) => run(join(root, 'node_modules/.bin/gltf-transform'), args);

mkdirSync(dirname(output), { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'garage-car-'));
const step = (name: string) => join(work, name);
try {
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/prepare_car.py'), '--', input, step('1-normalized.glb'), join(root, 'tools/car-map.json'), report]);
  gltfTransform('etc1s', step('1-normalized.glb'), step('2-ktx2.glb'), '--quality', '255');
  gltfTransform('meshopt', step('2-ktx2.glb'), output, '--level', 'medium');
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
