import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_BOUNDS, fovFor, orbitLimits, shotFor } from '../car/shots';
import type { Vec3 } from '../math';
import { QA } from '../qa';
import { useGarage } from '../state/store';
import { stepDrift } from './drift';

/** Flies to the shot for each view; drifts slowly around the car while the showroom is idle. */
export function CameraRig({ bay }: { bay: Vec3 }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const view = useGarage((state) => state.view);
  const inside = useGarage((state) => state.inside);
  const reducedMotion = useGarage((state) => state.reducedMotion);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const timer = useMemo(() => ({ idle: 0 }), []);

  const coveredBottom = useGarage((state) => state.coveredBottom);
  const coveredTop = useGarage((state) => state.coveredTop);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = fovFor(size.width / size.height);
    // Shift the picture by half of each covered strip, so each shot's subject sits in the middle of what's visible.
    const shift = (coveredBottom - coveredTop) / 2;
    if (shift !== 0) camera.setViewOffset(size.width, size.height, 0, shift, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size, coveredBottom, coveredTop]);

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    const shot = shotFor(view, bay, inside);
    const limits = orbitLimits(view, shot);
    rig.minAzimuthAngle = limits.minAzimuth;
    rig.maxAzimuthAngle = limits.maxAzimuth;
    rig.minPolarAngle = limits.minPolar;
    rig.maxPolarAngle = limits.maxPolar;
    rig.minDistance = limits.minDistance;
    rig.maxDistance = limits.maxDistance;
    const { position: p, target: t } = shot;
    void rig.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], !reducedMotion);
    rig.normalizeRotations(); // after a long drift, turn the short way round to the new shot
    timer.idle = 0;
  }, [view, bay, inside, reducedMotion]);

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    // Keep the camera in the room, and leave the target to the shots: no panning by mouse or touch.
    rig.setBoundary(new Box3(new Vector3(...CAMERA_BOUNDS.min), new Vector3(...CAMERA_BOUNDS.max)));
    rig.boundaryEnclosesCamera = true;
    rig.mouseButtons.right = CameraControlsImpl.ACTION.NONE;
    rig.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY;
    rig.touches.three = CameraControlsImpl.ACTION.NONE;
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
      smoothTime={0.55}
      draggingSmoothTime={0.12}
    />
  );
}
