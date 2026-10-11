import { useFrame, useLoader } from '@react-three/fiber';
import { Component, use, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { QA } from '../qa';
import { poseInternals, prepareInternals } from './internals';
import { insideLive } from './live';
import { loadKinematics } from './p60';

export const INTERNALS_URL = `${import.meta.env.BASE_URL}models/p60b40-internals.glb`;

/** The x-ray runs this many times slower than the engine, so each stroke can be followed. */
export const SLOW_MOTION = 40;

/**
 * The moving parts, inside the engine node, posed every frame from p60.wasm's kinematics. The crank turns at the
 * engine's speed slowed by SLOW_MOTION; cylinders flash as they fire while the engine burns fuel.
 */
function MovingParts({ engine }: { engine: Object3D }) {
  const gltf = useLoader(GLTFLoader, INTERNALS_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const kinematics = use(loadKinematics());
  const rig = useMemo(() => prepareInternals(gltf.scene), [gltf]);
  const crank = useRef(insideLive.crank);

  useLayoutEffect(() => {
    engine.add(rig.root);
    poseInternals(rig, kinematics.frame(crank.current), false);
    if (QA) Object.assign(window, { garagePistons: () => rig.pistons.map((piston) => piston.position.toArray()) });
    return () => {
      engine.remove(rig.root);
      insideLive.firing = 0;
    };
  }, [engine, rig, kinematics]);

  useFrame((_, dt) => {
    const burning = engineLive.status === 'running';
    crank.current = (crank.current + (engineLive.rpm / SLOW_MOTION) * 6 * Math.min(dt, 0.1)) % 720;
    poseInternals(rig, kinematics.frame(crank.current), burning);
    insideLive.crank = crank.current;
    insideLive.firing = burning ? kinematics.firing(crank.current) : 0;
  });
  return null;
}

/** If the parts can't load, the x-ray simply stays empty; the rest of the garage carries on. */
class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Internals({ engine }: { engine: Object3D }) {
  return (
    <Optional>
      <MovingParts engine={engine} />
    </Optional>
  );
}
