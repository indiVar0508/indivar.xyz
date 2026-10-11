import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial, Texture, type WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import { ENGINE_PARTS, partNode } from './manifest';
import { prepareEngine, setHighlight, setXray } from './prepareEngine';

/** The engine GLB's shape: Engine and Bay roots, a Part_* node per part, meshes sharing materials across parts. */
function fakeEngine(omit?: string) {
  const shared = new MeshStandardMaterial({ aoMap: new Texture() });
  const root = new Group();
  const engine = Object.assign(new Object3D(), { name: 'Engine' });
  const bay = Object.assign(new Object3D(), { name: 'Bay' });
  root.add(engine, bay);
  for (const id of ENGINE_PARTS) {
    const part = Object.assign(new Group(), { name: partNode(id) });
    part.add(new Mesh(new BoxGeometry(), shared));
    engine.add(part);
  }
  bay.add(new Mesh(new BoxGeometry(), shared));
  if (omit) root.getObjectByName(omit)!.removeFromParent();
  return { root, shared };
}

const materialOf = (object: Object3D) => ((object.children[0] as Mesh).material as MeshStandardMaterial);

describe('prepareEngine', () => {
  it('names every missing contract node', () => {
    expect(() => prepareEngine(fakeEngine('Part_heads').root)).toThrow('missing nodes: Part_heads');
  });

  it('gives each part its own materials, so highlighting one part lights only that part', () => {
    const { root, shared } = fakeEngine();
    const rig = prepareEngine(root);
    expect(materialOf(rig.parts.heads)).not.toBe(shared);
    expect(materialOf(rig.parts.heads)).not.toBe(materialOf(rig.parts.layout));
    setHighlight(rig, 'heads');
    expect(materialOf(rig.parts.heads).emissiveIntensity).toBeGreaterThan(0);
    expect(materialOf(rig.parts.layout).emissiveIntensity).toBe(0);
    setHighlight(rig, null);
    expect(materialOf(rig.parts.heads).emissiveIntensity).toBe(0);
  });

  it('lets the baked occlusion darken direct light too, not only ambient light', () => {
    const rig = prepareEngine(fakeEngine().root);
    const material = materialOf(rig.parts.crank);
    const shader = { fragmentShader: 'before\n#include <aomap_fragment>\nafter' } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, undefined as never);
    expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse *=');
    expect(shader.fragmentShader.indexOf('#include <aomap_fragment>')).toBeLessThan(shader.fragmentShader.indexOf('directDiffuse'));
    expect(material.customProgramCacheKey()).toBe('direct-ao');
  });

  it('casts and receives shadows, and prepares a model only once', () => {
    const { root } = fakeEngine();
    const rig = prepareEngine(root);
    const mesh = rig.parts.fuel.children[0] as Mesh;
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    expect(prepareEngine(root)).toBe(rig);
  });
});

describe('setXray', () => {
  it('turns the engine, not the bay, into a shadowless ghost, brightest on the selected part, and back', () => {
    const { root } = fakeEngine();
    const rig = prepareEngine(root);
    const solid = materialOf(rig.parts.heads);
    const bay = (rig.bay.children[0] as Mesh).material;
    setXray(rig, true, 'heads');
    const ghost = (rig.parts.heads.children[0] as Mesh).material as ShaderMaterial;
    expect(ghost).toBeInstanceOf(ShaderMaterial);
    expect(ghost.depthWrite).toBe(false);
    expect(rig.parts.heads.children[0]!.castShadow).toBe(false);
    const edge = (id: keyof typeof rig.parts) => ((rig.parts[id].children[0] as Mesh).material as ShaderMaterial).uniforms.edge!.value as number;
    expect(edge('heads')).toBeGreaterThan(edge('layout'));
    expect((rig.bay.children[0] as Mesh).material).toBe(bay);
    setXray(rig, true, 'layout');
    expect(edge('layout')).toBeGreaterThan(edge('heads'));
    setXray(rig, false, null);
    expect(materialOf(rig.parts.heads)).toBe(solid);
    expect(rig.parts.heads.children[0]!.castShadow).toBe(true);
  });
});
