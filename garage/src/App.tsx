import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { QA } from './qa';
import { Scene } from './scene/Scene';
import { useGarage } from './state/store';

export function App() {
  const quality = useGarage((state) => state.quality);
  return (
    <div className="stage">
      <Canvas
        flat
        shadows
        dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: QA }}
        camera={{ position: [5.4, 1.55, 5.2], fov: 35, near: 0.05, far: 60 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
