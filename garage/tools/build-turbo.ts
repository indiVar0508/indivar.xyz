// Builds public/models/p60b40-turbo.glb, the game turbo kit, from tools/blender/build_turbo.py. The real P60B40 is
// naturally aspirated; the kit is only in Need for Speed: Most Wanted, and the page labels it so.
// Usage: npm run build:turbo [-- preview-dir]   (a preview dir also keeps the raw GLB)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv[2] ? resolve(process.argv[2]) : null;
const output = join(root, 'public/models/p60b40-turbo.glb');
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit' });

const work = mkdtempSync(join(tmpdir(), 'garage-turbo-'));
try {
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/build_turbo.py'), '--', join(work, 'raw.glb')]);
  run(join(root, 'node_modules/.bin/gltf-transform'), ['meshopt', join(work, 'raw.glb'), output, '--level', 'medium']);
  if (preview) {
    mkdirSync(preview, { recursive: true });
    copyFileSync(join(work, 'raw.glb'), join(preview, 'turbo-raw.glb'));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
