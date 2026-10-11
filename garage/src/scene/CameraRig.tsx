import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { PerspectiveCamera } from 'three';
import { fovFor, shotFor } from '../car/shots';
import type { Vec3 } from '../math';
import { QA } from '../qa';
import { useGarage } from '../state/store';
import { stepDrift } from './drift';

/** Flies to the shot for each view; drifts slowly around the car while the showroom is idle. */
export function CameraRig({ bay }: { bay: Vec3 }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const view = useGarage((state) => state.view);
  const reducedMotion = useGarage((state) => state.reducedMotion);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const timer = useMemo(() => ({ idle: 0 }), []);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = fovFor(size.width / size.height);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  useEffect(() => {
    const { position: p, target: t } = shotFor(view, bay);
    void controls.current?.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], !reducedMotion);
    timer.idle = 0;
  }, [view, bay, reducedMotion]);

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    const takeOver = () => {
      timer.idle = -Infinity; // the visitor is driving; no drift until the next return to the showroom
    };
    rig.addEventListener('controlstart', takeOver);
    return () => rig.removeEventListener('controlstart', takeOver);
  }, []);

  useEffect(() => {
    if (!QA) return;
    Object.assign(window, { garageCamera: () => camera.position.toArray() });
  }, [camera]);

  useFrame((_, dt) => {
    if (reducedMotion || view.kind !== 'showroom' || !controls.current) return;
    const angle = stepDrift(timer, dt);
    if (angle > 0) controls.current.azimuthAngle += angle; // a plain setter: rotate() would allocate a promise per frame
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={1.1}
      maxDistance={7.5}
      minPolarAngle={0.25}
      maxPolarAngle={1.48}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
    />
  );
}
