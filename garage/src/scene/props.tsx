import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, PlaneGeometry, type InstancedMesh, type MeshStandardMaterial, type PointLight, type Texture } from 'three';
import type { Vec3 } from '../math';
import { flickerLevel } from './flicker';

type Placed = { position: Vec3; rotationY?: number };

const TUBE_GLOW = 4;
/** Candela. A point light per tube: RectAreaLight would add three's ~100 KB gzip LTC tables to the bundle. */
const TUBE_LIGHT = 3;
const frame = { color: '#2a2d31', metalness: 0.7, roughness: 0.5 } as const;

export function HangingTube({ position, flicker = false }: { position: Vec3; flicker?: boolean }) {
  const glow = useRef<MeshStandardMaterial>(null);
  const light = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    if (!flicker) return;
    const level = flickerLevel(clock.elapsedTime);
    if (glow.current) glow.current.emissiveIntensity = TUBE_GLOW * level;
    if (light.current) light.current.intensity = TUBE_LIGHT * level;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[1.7, 0.07, 0.18]} />
        <meshStandardMaterial color="#2c3036" roughness={0.5} metalness={0.8} />
      </mesh>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 1.55, 12]} />
        <meshStandardMaterial ref={glow} color="#111111" emissive="#e4ecff" emissiveIntensity={TUBE_GLOW} />
      </mesh>
      <pointLight ref={light} args={['#e4ecff', TUBE_LIGHT, 0, 2]} position={[0, -0.08, 0]} />
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.42, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.65, 4]} />
          <meshStandardMaterial color="#1a1c1f" />
        </mesh>
      ))}
    </group>
  );
}

const TOOLS: [number, number, number, number][] = [
  [-0.8, 1.8, 0.04, 0.38], [-0.6, 1.75, 0.05, 0.3], [-0.4, 1.82, 0.03, 0.42], [-0.1, 1.7, 0.22, 0.04],
  [0.2, 1.85, 0.04, 0.34], [0.45, 1.6, 0.3, 0.05], [0.8, 1.78, 0.05, 0.36],
];

export function Workbench({ position, rotationY = 0 }: Placed) {
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.06, 0.75]} />
        <meshStandardMaterial color="#4a3b2c" roughness={0.85} />
      </mesh>
      {[[-1, -0.32], [1, -0.32], [-1, 0.32], [1, 0.32]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x!, 0.45, z!]} castShadow>
          <boxGeometry args={[0.06, 0.9, 0.06]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[2.1, 0.03, 0.65]} />
        <meshStandardMaterial {...frame} />
      </mesh>
      <mesh position={[0, 1.65, -0.36]} receiveShadow>
        <boxGeometry args={[2.2, 1.2, 0.02]} />
        <meshStandardMaterial color="#6b5a43" roughness={0.9} />
      </mesh>
      {TOOLS.map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, -0.33]}>
          <boxGeometry args={[w, h, 0.02]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#b2412f' : '#8e959c'} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0.7, 1.02, 0.1]} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.22]} />
        <meshStandardMaterial color="#2d5d9f" roughness={0.5} metalness={0.4} />
      </mesh>
      <RoundedBox args={[0.5, 0.22, 0.24]} radius={0.02} position={[-0.6, 1.04, 0.05]} castShadow>
        <meshStandardMaterial color="#b2412f" roughness={0.45} metalness={0.3} />
      </RoundedBox>
    </group>
  );
}

export function ToolChest({ position, rotationY = 0 }: Placed) {
  const casters = [-0.38, 0.38].flatMap((x) => [-0.18, 0.18].map((z) => [x, z] as const));
  return (
    <group position={position} rotation-y={rotationY}>
      <RoundedBox args={[0.9, 1.0, 0.5]} radius={0.02} position={[0, 0.58, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#a3221b" roughness={0.35} metalness={0.2} clearcoat={0.6} />
      </RoundedBox>
      {[0.2, 0.36, 0.52, 0.68, 0.84, 0.98].map((y) => (
        <mesh key={y} position={[0, y, 0.255]}>
          <boxGeometry args={[0.6, 0.015, 0.02]} />
          <meshStandardMaterial color="#c9ced6" metalness={1} roughness={0.25} />
        </mesh>
      ))}
      {casters.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.05, z]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 12]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}

export function TireStack({ position, count = 4 }: { position: Vec3; count?: number }) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 1.7) * 0.03, 0.12 + i * 0.235, Math.cos(i * 2.3) * 0.03]} rotation-x={Math.PI / 2} castShadow receiveShadow>
          <torusGeometry args={[0.24, 0.115, 16, 40]} />
          <meshStandardMaterial color="#121314" roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

export function OilDrum({ position, color = '#1f4f8a' }: { position: Vec3; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.29, 0.88, 32]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.5} />
      </mesh>
      {[0.3, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.292, 0.012, 8, 40]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

const SHELF_LEVELS = [0.15, 0.75, 1.35, 1.95];
const BOXES: [number, number, number, number, string][] = [
  [-0.6, 0, 0.5, 0.35, '#6d5638'], [0.1, 0, 0.4, 0.3, '#6d5638'], [0.6, 1, 0.35, 0.25, '#2f5d8a'],
  [-0.5, 1, 0.3, 0.42, '#8a2f2a'], [0.2, 2, 0.6, 0.3, '#6d5638'], [-0.55, 3, 0.4, 0.2, '#3e4a3a'],
];

export function Shelf({ position, rotationY = 0 }: Placed) {
  const posts = [-0.98, 0.98].flatMap((x) => [-0.23, 0.23].map((z) => [x, z] as const));
  return (
    <group position={position} rotation-y={rotationY}>
      {SHELF_LEVELS.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 0.04, 0.5]} />
          <meshStandardMaterial color="#3b4047" metalness={0.6} roughness={0.55} />
        </mesh>
      ))}
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 1.05, z]}>
          <boxGeometry args={[0.04, 2.1, 0.04]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      {BOXES.map(([x, level, w, h, color], i) => (
        <mesh key={i} position={[x, SHELF_LEVELS[level]! + 0.02 + h / 2, 0]} castShadow>
          <boxGeometry args={[w, h, 0.36]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function RollerDoor({ position, map }: { position: Vec3; map: Texture }) {
  const slats = 30;
  const slat = 0.115;
  const width = 5;
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    for (let i = 0; i < slats; i++) mesh.current!.setMatrixAt(i, matrix.makeTranslation(0, slat / 2 + i * slat, 0));
    mesh.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group position={position}>
      <instancedMesh ref={mesh} args={[undefined, undefined, slats]} receiveShadow>
        <boxGeometry args={[width, slat * 0.92, 0.04]} />
        <meshStandardMaterial color="#5f6670" map={map} roughness={0.6} metalness={0.6} />
      </instancedMesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.06), (slats * slat) / 2, 0]}>
          <boxGeometry args={[0.1, slats * slat, 0.1]} />
          <meshStandardMaterial {...frame} />
        </mesh>
      ))}
      <mesh position={[0, slats * slat + 0.18, 0.1]}>
        <boxGeometry args={[width + 0.3, 0.36, 0.36]} />
        <meshStandardMaterial {...frame} />
      </mesh>
    </group>
  );
}

function corrugated(width: number, height: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, Math.round(width / 0.02), 1);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin((position.getX(i) / 0.076) * Math.PI * 2) * 0.012);
  geometry.computeVertexNormals();
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function CorrugatedWall({ width, height, position, rotationY = 0, map }: Placed & { width: number; height: number; map: Texture }) {
  const geometry = useMemo(() => corrugated(width, height), [width, height]);
  return (
    <mesh geometry={geometry} position={position} rotation-y={rotationY} receiveShadow>
      <meshStandardMaterial color="#7c838c" map={map} roughness={0.7} metalness={0.55} side={DoubleSide} />
    </mesh>
  );
}
