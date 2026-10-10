// Validates public/models/m3-gtr.glb against the car asset contract (spec §4.2) and its budgets.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetErrors } from '../src/car/manifest.ts';

const file = resolve(import.meta.dirname, '../public/models/m3-gtr.glb');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const root = (await io.read(file)).getRoot();

const triangles = root
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, primitive) => sum + (primitive.getIndices() ?? primitive.getAttribute('POSITION'))!.getCount() / 3, 0);
const bytes = statSync(file).size;
const textureMimeTypes = root.listTextures().map((texture) => texture.getMimeType());

const errors = assetErrors({
  nodeNames: root.listNodes().map((node) => node.getName()),
  bytes,
  triangles,
  textureMimeTypes,
  paintMeshes: root.listNodes().filter((node) => node.getExtras().role === 'paint').length,
});
if (errors.length > 0) {
  console.error(`m3-gtr.glb breaks the asset contract:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`m3-gtr.glb OK: ${(bytes / 1048576).toFixed(1)} MB, ${Math.round(triangles)} triangles, ${textureMimeTypes.length} KTX2 textures.`);
