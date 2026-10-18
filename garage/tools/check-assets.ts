// Validates public/models/m3-gtr.glb against the car asset contract (spec §4.2), public/models/p60b40.glb against
// the engine contract (spec 2026-10-11 §2), and public/models/p60b40-internals.glb against the moving parts' contract
// (spec 2026-10-11 "engine running" §3), and public/models/p60b40-turbo.glb against the game turbo kit's (spec 2026-10-18
// §2), each with its budgets.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBounds, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetErrors } from '../src/car/manifest.ts';
import { ENGINE_PARTS, engineAssetErrors, INTERNALS_NODES, internalsAssetErrors, partNode, turboAssetErrors, type Box } from '../src/engine/manifest.ts';
import type { Vec3 } from '../src/math.ts';

const models = resolve(import.meta.dirname, '../public/models');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const triangleCount = (document: Document) =>
  document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + (primitive.getIndices() ?? primitive.getAttribute('POSITION'))!.getCount() / 3, 0);

async function check(file: string, errorsFor: (document: Document, bytes: number) => string[]): Promise<boolean> {
  const path = resolve(models, file);
  const document = await io.read(path);
  const bytes = statSync(path).size;
  const errors = errorsFor(document, bytes);
  if (errors.length > 0) {
    console.error(`${file} breaks its asset contract:\n${errors.join('\n')}`);
    return false;
  }
  const textures = document.getRoot().listTextures().length;
  console.log(`${file} OK: ${(bytes / 1048576).toFixed(1)} MB, ${Math.round(triangleCount(document))} triangles, ${textures} KTX2 textures.`);
  return true;
}

const car = await check('m3-gtr.glb', (document, bytes) => {
  const root = document.getRoot();
  return assetErrors({
    nodeNames: root.listNodes().map((node) => node.getName()),
    bytes,
    triangles: triangleCount(document),
    textureMimeTypes: root.listTextures().map((texture) => texture.getMimeType()),
    paintMeshes: root.listNodes().filter((node) => node.getExtras().role === 'paint').length,
  });
});

const engine = await check('p60b40.glb', (document, bytes) => {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const origin = nodes.find((node) => node.getName() === 'Engine')?.getWorldTranslation() ?? [0, 0, 0];
  const partBounds: Record<string, Box> = {};
  for (const id of ENGINE_PARTS) {
    const node = nodes.find((candidate) => candidate.getName() === partNode(id));
    if (!node) continue;
    const { min, max } = getBounds(node);
    partBounds[partNode(id)] = { min: min.map((v, axis) => v - origin[axis]!) as Vec3, max: max.map((v, axis) => v - origin[axis]!) as Vec3 };
  }
  // A pivot's mesh hangs off a child named <pivot>_mesh; only the pivots themselves count.
  const named = (prefix: string) => nodes.filter((node) => node.getName().startsWith(prefix) && !node.getName().endsWith('_mesh'));
  return engineAssetErrors({
    nodeNames: nodes.map((node) => node.getName()),
    bytes,
    triangles: triangleCount(document),
    textureMimeTypes: root.listTextures().map((texture) => texture.getMimeType()),
    partBounds,
    pivotsWithMeshes: [...named('Spin_'), ...named('Throttle_'), ...named('Tailpipe_')].filter((node) => node.getMesh()).map((node) => node.getName()),
    spinRadii: Object.fromEntries(named('Spin_').map((node) => [node.getName(), node.getExtras().radius])),
    flows: Object.fromEntries(named('Flow_').map((node) => [node.getName(), node.getExtras().points])),
  });
});

const internals = await check('p60b40-internals.glb', (document, bytes) => {
  const nodes = document.getRoot().listNodes();
  return internalsAssetErrors({
    nodeNames: nodes.map((node) => node.getName()),
    bytes,
    triangles: triangleCount(document),
    valveAxes: Object.fromEntries(nodes.filter((node) => node.getName().startsWith('Valve_')).map((node) => [node.getName(), node.getExtras().axis])),
    pivotsWithMeshes: nodes.filter((node) => INTERNALS_NODES.includes(node.getName()) && node.getMesh()).map((node) => node.getName()),
  });
});

const turbo = await check('p60b40-turbo.glb', (document, bytes) => {
  const nodes = document.getRoot().listNodes();
  return turboAssetErrors({
    nodeNames: nodes.map((node) => node.getName()),
    bytes,
    triangles: triangleCount(document),
    pivotsWithMeshes: nodes.filter((node) => /^Compressor_(left|right)$/.test(node.getName()) && node.getMesh()).map((node) => node.getName()),
    flows: Object.fromEntries(nodes.filter((node) => node.getName().startsWith('Flow_')).map((node) => [node.getName(), node.getExtras().points])),
  });
});

if (!car || !engine || !internals || !turbo) process.exit(1);
