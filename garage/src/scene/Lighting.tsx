import { Environment, Lightformer } from '@react-three/drei';
import { TUBES } from './layout';

/** Warm amber key, cool teal rim, and strip lights in the environment so the paint shows long highlights. */
export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#1d2836', '#0a0806', 0.6]} />
      <spotLight position={[3.5, 5.2, 3]} angle={0.62} penumbra={0.85} intensity={110} distance={18} decay={2} color="#ffd2a6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <spotLight position={[-4.5, 4.5, -4]} angle={0.7} penumbra={1} intensity={90} distance={16} decay={2} color="#6fa8ff" />
      <Environment resolution={256} frames={1}>
        {TUBES.map((tube) => (
          <Lightformer key={tube.position.join(',')} form="rect" intensity={4} color="#e9f0ff" position={tube.position} rotation-x={Math.PI / 2} scale={[1.6, 0.12, 1]} />
        ))}
        <Lightformer form="rect" intensity={0.6} color="#ffb46b" position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#6fa8ff" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer form="ring" intensity={0.4} color="#ffffff" position={[0, 5, -6]} scale={3} />
      </Environment>
    </>
  );
}
