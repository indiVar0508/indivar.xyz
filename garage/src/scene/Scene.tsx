import { ContactShadows, Sparkles } from '@react-three/drei';
import { Car } from '../car/Car';
import { engineOrigin } from '../car/shots';
import { Bay } from '../engine/Bay';
import { P60B40 } from '../engine/P60B40';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { FrameMonitor } from './FrameMonitor';
import { Garage } from './Garage';
import { Lighting } from './Lighting';
import { ReadySignal } from './ReadySignal';

export function Scene() {
  return (
    <>
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 14, 32]} />
      <Lighting />
      <Garage />
      <Car>
        {(rig) => (
          <>
            <CameraRig bay={rig.anchors.engineBay} />
            <Bay />
            <P60B40 origin={engineOrigin(rig.anchors.engineBay)} />
          </>
        )}
      </Car>
      <ContactShadows position={[0, 0.005, 0]} scale={9} resolution={1024} far={1.6} blur={2.4} opacity={0.8} frames={1} />
      <Sparkles count={70} scale={[12, 3.5, 12]} position={[0, 1.8, 0]} size={1.6} speed={0.12} opacity={0.22} color="#ffd9a6" />
      <Effects />
      <FrameMonitor />
      <ReadySignal />
    </>
  );
}
