import { Box3, FrontSide, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three';
import type { Vec3 } from '../math';
import { missingNodes } from './manifest';
import { glassMaterial, paintMaterial, primerMaterial } from './paint';

/** The source's Maya export leaves some trim at roughness 0, which renders as a perfect mirror. */
const MIN_TRIM_ROUGHNESS = 0.18;

export type CarAnchors = { wheelFL: Vec3; wheelFR: Vec3; wheelRL: Vec3; wheelRR: Vec3; engineBay: Vec3 };
export type CarRig = { root: Object3D; hood: Object3D; anchors: CarAnchors; bounds: Box3 };

/** Validates the car contract, upgrades materials, and returns the handles the scene needs. Mutates `root` once. */
export function prepareCar(root: Object3D): CarRig {
  if (root.userData.rig) return root.userData.rig as CarRig;

  const names: string[] = [];
  root.traverse((object) => names.push(object.name));
  const missing = missingNodes(names);
  if (missing.length > 0) throw new Error(`m3-gtr.glb is missing nodes: ${missing.join(', ')}`);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const role = object.userData.role ?? object.parent?.userData.role;
    if (role === 'paint') object.material = paintMaterial(object.material as Material);
    else if (object.material instanceof MeshStandardMaterial) object.material.roughness = Math.max(object.material.roughness, MIN_TRIM_ROUGHNESS);
  });
  root.getObjectByName('Glass')!.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = glassMaterial();
    object.castShadow = false;
  });

  // The source model shows the livery on the hood's underside, so paint only the top and add primer below.
  const hood = root.getObjectByName('Hood')!;
  const primer = primerMaterial();
  const hoodMeshes: Mesh[] = [];
  hood.traverse((object) => {
    if (object instanceof Mesh) hoodMeshes.push(object);
  });
  for (const mesh of hoodMeshes) {
    (mesh.material as Material).side = FrontSide;
    const underside = new Mesh(mesh.geometry, primer);
    underside.userData.underside = true;
    underside.receiveShadow = true;
    mesh.add(underside);
  }

  root.updateMatrixWorld(true);
  const at = (name: string): Vec3 => root.worldToLocal(root.getObjectByName(name)!.getWorldPosition(new Vector3())).toArray();
  const rig: CarRig = {
    root,
    hood,
    anchors: {
      wheelFL: at('Marker_Wheel_FL'),
      wheelFR: at('Marker_Wheel_FR'),
      wheelRL: at('Marker_Wheel_RL'),
      wheelRR: at('Marker_Wheel_RR'),
      engineBay: at('Marker_EngineBay'),
    },
    bounds: new Box3().setFromObject(root),
  };
  root.userData.rig = rig;
  return rig;
}
