import { CameraControls, Environment, Lightformer } from '@react-three/drei';
import { Car } from '../car/Car';
import { ReadySignal } from './ReadySignal';

export function Scene() {
  return (
    <>
      <color attach="background" args={['#0b0e12']} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 6, 3]} intensity={2.5} castShadow />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 1, 1]} />
      </Environment>
      <Car />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2d31" />
      </mesh>
      <CameraControls makeDefault />
      <ReadySignal />
    </>
  );
}
