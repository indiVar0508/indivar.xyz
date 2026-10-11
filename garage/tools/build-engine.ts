// Builds public/models/p60b40.glb, the P60B40 and its engine bay, from tools/blender/build_engine.py:
// Blender models the parts and bakes ambient occlusion, then glTF-Transform adds the AO map, compresses the
// textures to KTX2 and the geometry with meshopt.
// Usage: npm run build:engine [-- preview-dir]   (a preview dir also saves the raw GLB and the AO bake there)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { BAY, ENGINE_ANCHORS, ENGINE_OFFSET, RADIATOR } from '../src/engine/anchors.ts';
import { cylinderLayout } from '../src/engine/geometry.ts';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv[2] ? resolve(process.argv[2]) : null;
const ktxDir = join(root, 'tools/bin/ktx');
const car = join(root, 'public/models/m3-gtr.glb');
const output = join(root, 'public/models/p60b40.glb');

if (!existsSync(join(ktxDir, 'bin/ktx'))) throw new Error('Missing KTX-Software. Run tools/install-ktx.sh first.');
if (!existsSync(car)) throw new Error(`Missing ${car}. Run npm run prepare:car first.`);

const env = {
  ...process.env,
  PATH: `${join(ktxDir, 'bin')}:${process.env.PATH ?? ''}`,
  LD_LIBRARY_PATH: `${join(ktxDir, 'lib')}:${process.env.LD_LIBRARY_PATH ?? ''}`,
};
const run = (command: string, args: string[]) => execFileSync(command, args, { stdio: 'inherit', env });
const gltfTransform = (...args: string[]) => run(join(root, 'node_modules/.bin/gltf-transform'), args);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// The engine sits where the runtime puts it: Marker_EngineBay plus ENGINE_OFFSET, in car space.
const marker = (await io.read(car)).getRoot().listNodes().find((node) => node.getName() === 'Marker_EngineBay');
if (!marker) throw new Error('m3-gtr.glb has no Marker_EngineBay');
const bay = marker.getWorldTranslation();
const origin = bay.map((v, axis) => v + ENGINE_OFFSET[axis]!);

mkdirSync(dirname(output), { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'garage-engine-'));
const step = (name: string) => join(work, name);
try {
  writeFileSync(step('layout.json'), JSON.stringify({ origin, bay: BAY, radiator: RADIATOR, cylinders: cylinderLayout(), anchors: ENGINE_ANCHORS }, null, 2));
  run('blender', ['-b', '--factory-startup', '--python', join(root, 'tools/blender/build_engine.py'), '--', step('layout.json'), step('1-raw.glb'), step('ao.png')]);

  // Every mesh shares one UV atlas, so one baked AO map serves every material.
  const document = await io.read(step('1-raw.glb'));
  const ao = document.createTexture('ao').setImage(readFileSync(step('ao.png'))).setMimeType('image/png').setURI('ao.png');
  for (const material of document.getRoot().listMaterials()) {
    material.setOcclusionTexture(ao);
    material.getOcclusionTextureInfo()!.setTexCoord(0);
  }
  await io.write(step('2-ao.glb'), document);

  gltfTransform('etc1s', step('2-ao.glb'), step('3-ktx2.glb'), '--quality', '255');
  gltfTransform('meshopt', step('3-ktx2.glb'), output, '--level', 'medium');
  if (preview) {
    mkdirSync(preview, { recursive: true });
    for (const name of ['1-raw.glb', 'ao.png', 'layout.json']) copyFileSync(step(name), join(preview, name));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
run('node', [join(root, 'tools/check-assets.ts')]);
