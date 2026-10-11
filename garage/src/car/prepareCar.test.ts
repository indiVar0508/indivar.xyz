import { BackSide, BoxGeometry, DoubleSide, FrontSide, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { prepareCar } from './prepareCar';

function fakeCar(omit?: string): Group {
  const root = new Group();
  const add = <T extends Object3D>(parent: Object3D, name: string, object: T): T => {
    object.name = name;
    parent.add(object);
    return object;
  };
  const body = add(root, 'Body', new Object3D());
  const shell = add(body, 'Paint_Shell', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: new Texture(), side: DoubleSide })));
  shell.userData.role = 'paint';
  add(body, 'Glass', new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  add(body, 'Grille', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0 })));
  const hood = add(root, 'Hood', new Object3D());
  hood.position.set(0, 0.79, 0.84);
  const panel = add(hood, 'Hood_Panel', new Mesh(new BoxGeometry(), new MeshStandardMaterial({ side: DoubleSide })));
  panel.userData.role = 'paint';
  const wheels: Record<string, [number, number, number]> = { FL: [0.8, 0.32, 1.45], FR: [-0.8, 0.32, 1.45], RL: [0.8, 0.32, -1.21], RR: [-0.8, 0.32, -1.21] };
  for (const [label, position] of Object.entries(wheels)) add(root, `Marker_Wheel_${label}`, new Object3D()).position.set(...position);
  add(root, 'Marker_EngineBay', new Object3D()).position.set(0, 0.32, 1.49);
  if (omit) root.getObjectByName(omit)!.removeFromParent();
  return root;
}

describe('prepareCar', () => {
  it('names every missing contract node', () => {
    expect(() => prepareCar(fakeCar('Marker_EngineBay'))).toThrow('missing nodes: Marker_EngineBay');
  });

  it('turns paint into clear-coated physical paint and keeps the livery texture', () => {
    const rig = prepareCar(fakeCar());
    const shell = rig.root.getObjectByName('Paint_Shell') as Mesh;
    expect(shell.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect((shell.material as MeshPhysicalMaterial).clearcoat).toBe(1);
    expect((shell.material as MeshPhysicalMaterial).map).toBeInstanceOf(Texture);
  });

  it('keeps trim from rendering as a perfect mirror', () => {
    const rig = prepareCar(fakeCar());
    expect(((rig.root.getObjectByName('Grille') as Mesh).material as MeshStandardMaterial).roughness).toBeGreaterThanOrEqual(0.18);
  });

  it('gives the hood a primer underside and paints only its top', () => {
    const rig = prepareCar(fakeCar());
    const panel = rig.root.getObjectByName('Hood_Panel') as Mesh;
    expect((panel.material as MeshStandardMaterial).side).toBe(FrontSide);
    const undersides = panel.children.filter((c) => c.userData.underside);
    expect(undersides).toHaveLength(1);
    expect(((undersides[0] as Mesh).material as MeshStandardMaterial).side).toBe(BackSide);
  });

  it('reads anchors from the markers and is safe to call twice', () => {
    const root = fakeCar();
    const first = prepareCar(root);
    const second = prepareCar(root);
    expect(second).toBe(first);
    expect(first.anchors.engineBay).toEqual([0, 0.32, 1.49]);
    expect(first.anchors.wheelFL).toEqual([0.8, 0.32, 1.45]);
    expect(first.hood.name).toBe('Hood');
    expect((root.getObjectByName('Hood_Panel') as Mesh).children.filter((c) => c.userData.underside)).toHaveLength(1);
  });
});
