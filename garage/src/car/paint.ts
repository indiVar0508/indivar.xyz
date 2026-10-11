import { BackSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';

/** Clear-coated metallic paint. The livery stays in the base-color texture. */
export const PAINT = { metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 } as const;

export function paintMaterial(source: Material): MeshPhysicalMaterial {
  const original = source as MeshStandardMaterial;
  return new MeshPhysicalMaterial({
    name: `${original.name}-paint`,
    map: original.map ?? null,
    color: original.color?.clone(),
    side: original.side,
    ...PAINT,
  });
}

export function glassMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    name: 'glass',
    color: '#05080c',
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.5,
  });
}

/** Matte primer for the inside of the hood, which the source model textures with the livery. */
export function primerMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'primer', color: '#17191c', roughness: 0.78, metalness: 0.15, side: BackSide });
}
