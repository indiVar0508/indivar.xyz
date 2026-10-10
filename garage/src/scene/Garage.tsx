import { MeshReflectorMaterial } from '@react-three/drei';
import { useMemo } from 'react';
import { useGarage } from '../state/store';
import { ROOM, TUBES } from './layout';
import { CorrugatedWall, HangingTube, OilDrum, RollerDoor, Shelf, TireStack, ToolChest, Workbench } from './props';
import { garageTextures } from './textures';

export function Garage() {
  const textures = useMemo(garageTextures, []);
  const high = useGarage((state) => state.quality) === 'high';
  const depth = ROOM.front - ROOM.back;
  const zMid = (ROOM.front + ROOM.back) / 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, zMid]} receiveShadow>
        <planeGeometry args={[ROOM.halfWidth * 2, depth]} />
        <MeshReflectorMaterial
          color="#62666b"
          map={textures.floor}
          roughnessMap={textures.floorRoughness}
          roughness={1}
          metalness={0.2}
          blur={high ? [400, 120] : [0, 0]}
          resolution={high ? 1024 : 256}
          mixBlur={1}
          mixStrength={high ? 2.2 : 0.8}
          mixContrast={1}
          depthScale={1.2}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          mirror={0}
        />
      </mesh>
      <mesh position={[0, ROOM.height, zMid]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[ROOM.halfWidth * 2, depth]} />
        <meshStandardMaterial color="#0b0d10" roughness={1} />
      </mesh>
      {[-4, 0, 4].map((z) => (
        <mesh key={z} position={[0, ROOM.height - 0.15, z]}>
          <boxGeometry args={[ROOM.halfWidth * 2, 0.3, 0.16]} />
          <meshStandardMaterial color="#1c1f23" metalness={0.6} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, ROOM.height / 2, ROOM.back]} receiveShadow>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.height]} />
        <meshStandardMaterial map={textures.backWall} color="#8a8e94" roughness={0.95} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, ROOM.front]} rotation-y={Math.PI}>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.height]} />
        <meshStandardMaterial map={textures.backWall} color="#6e7278" roughness={0.95} />
      </mesh>
      <CorrugatedWall width={depth} height={ROOM.height} position={[ROOM.halfWidth, 0, zMid]} rotationY={-Math.PI / 2} map={textures.wall} />
      <CorrugatedWall width={depth} height={ROOM.height} position={[-ROOM.halfWidth, 0, zMid]} rotationY={Math.PI / 2} map={textures.wall} />
      <RollerDoor position={[0, 0, ROOM.back + 0.06]} map={textures.door} />
      <Workbench position={[7.95, 0, -2.2]} rotationY={-Math.PI / 2} />
      <ToolChest position={[8.0, 0, 1.6]} rotationY={-Math.PI / 2} />
      <Shelf position={[-8.15, 0, -2.6]} rotationY={Math.PI / 2} />
      <TireStack position={[-7.6, 0, 1.2]} />
      <TireStack position={[-7.0, 0, 1.9]} count={3} />
      <OilDrum position={[-7.7, 0, 3.2]} />
      <OilDrum position={[-7.1, 0, 3.6]} color="#7a2a22" />
      {TUBES.map((tube) => (
        <HangingTube key={tube.position.join(',')} position={tube.position} flicker={tube.flicker} />
      ))}
    </group>
  );
}
