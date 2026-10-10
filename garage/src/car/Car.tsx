import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { hoodAngle, stepHood } from './hood';
import { getKtx2Loader } from './loaders';
import { prepareCar, type CarRig } from './prepareCar';

export const CAR_URL = `${import.meta.env.BASE_URL}models/m3-gtr.glb`;

export function Car({ children }: { children?: (rig: CarRig) => ReactNode }) {
  const gl = useThree((state) => state.gl);
  const gltf = useLoader(GLTFLoader, CAR_URL, (loader) => {
    loader.setKTX2Loader(getKtx2Loader(gl));
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const rig = useMemo(() => prepareCar(gltf.scene), [gltf]);
  const progress = useRef(0);

  useFrame((_, dt) => {
    const { view, reducedMotion } = useGarage.getState();
    progress.current = stepHood(progress.current, isHoodOpen(view), dt, reducedMotion);
    rig.hood.rotation.x = hoodAngle(progress.current);
  });

  return (
    <>
      <primitive object={rig.root} />
      {children?.(rig)}
    </>
  );
}
