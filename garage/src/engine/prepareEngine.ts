import { AdditiveBlending, Color, DoubleSide, Mesh, MeshStandardMaterial, ShaderMaterial, type Material, type Object3D, type Vector3 } from 'three';
import type { EngineTopicId } from '../content/engine';
import { ENGINE_NODES, ENGINE_PARTS, partNode, SPIN_NODES } from './manifest';

type PartId = (typeof ENGINE_PARTS)[number];
export type EngineRig = {
  root: Object3D;
  engine: Object3D;
  bay: Object3D;
  parts: Record<PartId, Object3D>;
  materials: Record<PartId, MeshStandardMaterial[]>;
  /** One x-ray material per part, so the selected part's can be brighter. */
  ghosts: Record<PartId, ShaderMaterial>;
  /** The bay's x-ray material. */
  bayGhost: ShaderMaterial;
  /** The belt drive's pulleys, each with its speed relative to the crank. */
  spins: { node: Object3D; ratio: number }[];
  /** Throttle butterflies for cylinders 1–8, with the side of the engine each sits on (-1 right, 1 left). */
  throttles: { node: Object3D; side: number }[];
  /** Injector tips for cylinders 1–8, in engine space. */
  injectors: Vector3[];
  /** The stock tail pipes, which the game turbo kit's downpipes replace. */
  tailpipes: Object3D[];
};

const HIGHLIGHT = new Color('#2f6bff');
const HIGHLIGHT_INTENSITY = 0.55;
const NONE = new Color(0);

/**
 * How much of the baked occlusion reaches direct light. three.js applies an AO map to ambient and environment light
 * only, but this garage is lit mostly by spotlights, so without this the seams and undersides would glow.
 */
const DIRECT_OCCLUSION = 0.75;

function occludeDirectLight(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
#ifdef USE_AOMAP
  reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${DIRECT_OCCLUSION.toFixed(2)});
  reflectedLight.directSpecular *= mix(1.0, ambientOcclusion, ${DIRECT_OCCLUSION.toFixed(2)});
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'direct-ao';
}

/** Validates the engine contract and readies the model: per-part materials, shadows, occlusion. Mutates `root` once. */
export function prepareEngine(root: Object3D): EngineRig {
  if (root.userData.rig) return root.userData.rig as EngineRig;

  const names = new Set<string>();
  root.traverse((object) => names.add(object.name));
  const missing = ENGINE_NODES.filter((name) => !names.has(name));
  if (missing.length > 0) throw new Error(`p60b40.glb is missing nodes: ${missing.join(', ')}`);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const parts = {} as Record<PartId, Object3D>;
  const materials = {} as Record<PartId, MeshStandardMaterial[]>;
  for (const id of ENGINE_PARTS) {
    const part = root.getObjectByName(partNode(id))!;
    // Parts share materials in the file; clone them per part so a highlight lights one part only.
    const clones = new Map<Material, MeshStandardMaterial>();
    part.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
      const original = object.material;
      if (!clones.has(original)) clones.set(original, original.clone());
      object.material = clones.get(original)!;
    });
    parts[id] = part;
    materials[id] = [...clones.values()];
  }
  root.traverse((object) => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.aoMap) occludeDirectLight(object.material);
  });

  const ghosts = Object.fromEntries(ENGINE_PARTS.map((id) => [id, ghostMaterial()])) as Record<PartId, ShaderMaterial>;
  const named = (name: string) => root.getObjectByName(name)!;
  const crankRadius = named('Spin_crank').userData.radius as number;
  const cylinders = [1, 2, 3, 4, 5, 6, 7, 8];
  const rig: EngineRig = {
    root,
    engine: named('Engine'),
    bay: named('Bay'),
    parts,
    materials,
    ghosts,
    bayGhost: ghostMaterial(),
    spins: SPIN_NODES.map((name) => ({ node: named(name), ratio: crankRadius / (named(name).userData.radius as number) })),
    throttles: cylinders.map((n) => ({ node: named(`Throttle_${n}`), side: Math.sign(named(`Throttle_${n}`).position.x) })),
    injectors: cylinders.map((n) => named(`Injector_${n}`).position.clone()),
    tailpipes: ['Tailpipe_left', 'Tailpipe_right'].map(named),
  };
  root.userData.rig = rig;
  return rig;
}

/** Lights up one part (or none). */
export function setHighlight(rig: EngineRig, id: EngineTopicId | null): void {
  for (const part of ENGINE_PARTS) {
    for (const material of rig.materials[part]) {
      material.emissive.copy(part === id ? HIGHLIGHT : NONE);
      material.emissiveIntensity = part === id ? HIGHLIGHT_INTENSITY : 0;
    }
  }
}

const GHOST_EDGE = 0.32;
const GHOST_SELECTED_EDGE = 0.9;

/** A see-through x-ray: faint where a surface faces the camera, bright along its silhouette. Additive, so no sorting. */
export function ghostMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color('#3d7bff') }, base: { value: 0.018 }, edge: { value: GHOST_EDGE } },
    vertexShader: `varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -view.xyz;
  gl_Position = projectionMatrix * view;
}`,
    fragmentShader: `uniform vec3 color;
uniform float base;
uniform float edge;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  gl_FragColor = vec4(color * (base + edge * pow(1.0 - facing, 3.0)), 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/**
 * Shows the engine as an x-ray (or puts it back), so the moving parts inside show through, and with `bay` its bay too,
 * so the clutch and gearbox behind it show. Ghosts stop casting shadows, or they would still darken the parts inside.
 */
export function setXray(rig: EngineRig, on: boolean, selected: EngineTopicId | null, bay = false): void {
  const ghost = (root: Object3D, material: ShaderMaterial, ghosted: boolean) =>
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.userData.solid ??= object.material;
      object.userData.shadow ??= object.castShadow;
      object.material = ghosted ? material : object.userData.solid;
      object.castShadow = ghosted ? false : object.userData.shadow;
    });
  for (const id of ENGINE_PARTS) {
    rig.ghosts[id].uniforms.edge!.value = id === selected ? GHOST_SELECTED_EDGE : GHOST_EDGE;
    ghost(rig.parts[id], rig.ghosts[id], on);
  }
  ghost(rig.bay, rig.bayGhost, on && bay);
}
