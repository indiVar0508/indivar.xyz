import { useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { BAY, RADIATOR } from './anchors';

/** The engine bay the source model lacks: floor, inner fenders, firewall, radiator, strut towers. */
export function Bay() {
  const { rearZ, frontZ, wallFrontZ, halfWidth, floorY, topY, wallTopY } = BAY;
  const length = frontZ - rearZ;
  const mid = (frontZ + rearZ) / 2;
  const height = topY - floorY;
  const tub = useMemo(() => new MeshStandardMaterial({ color: '#15171a', roughness: 0.8, metalness: 0.25 }), []);
  return (
    <group>
      <mesh position={[0, floorY, mid]} material={tub} receiveShadow>
        <boxGeometry args={[halfWidth * 2, 0.02, length]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * halfWidth, (floorY + wallTopY) / 2, (rearZ + wallFrontZ) / 2]} material={tub} receiveShadow>
          <boxGeometry args={[0.03, wallTopY - floorY, wallFrontZ - rearZ]} />
        </mesh>
      ))}
      <mesh position={[0, floorY + height / 2, rearZ]} material={tub} receiveShadow>
        <boxGeometry args={[halfWidth * 2, height, 0.03]} />
      </mesh>
      <mesh position={[0, RADIATOR.top - RADIATOR.height / 2, RADIATOR.z]}>
        <boxGeometry args={[RADIATOR.halfWidth * 2, RADIATOR.height, 0.05]} />
        <meshStandardMaterial color="#2b2e33" metalness={0.8} roughness={0.45} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`tower-${side}`} position={[side * (halfWidth - 0.09), wallTopY + 0.02, 1.45]} material={tub}>
          <cylinderGeometry args={[0.09, 0.1, 0.12, 24]} />
        </mesh>
      ))}
    </group>
  );
}
