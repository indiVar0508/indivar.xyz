import { Canvas } from '@react-three/fiber';

export function App() {
  return (
    <div className="stage">
      <Canvas camera={{ position: [3, 2, 4], fov: 40 }}>
        <color attach="background" args={['#07090c']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 2]} intensity={2} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#3d7bff" />
        </mesh>
      </Canvas>
    </div>
  );
}
