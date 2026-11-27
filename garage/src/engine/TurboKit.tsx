import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { Color, MathUtils, Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { QA } from '../qa';
import { useGarage } from '../state/store';
import { isDriveView, isHoodOpen } from '../state/view';
import { FlowField, readFlows } from './flows';
import { Optional } from './Internals';
import { spinStep } from './motion';
import { ghostMaterial, type EngineRig } from './prepareEngine';

export const TURBO_URL = `${import.meta.env.BASE_URL}models/p60b40-turbo.glb`;

/** How hot the turbines glow at full boost (brighter than white, for the bloom pass). */
const TURBINE_GLOW = new Color(1.6, 0.4, 0.08);
/** Compressor speed against crank speed, for the spin shown on screen (capped like the pulleys). */
const COMPRESSOR_RATIO = 12;

type Kit = { root: Object3D; compressors: Object3D[]; turbine: MeshStandardMaterial | null; solid: Map<Mesh, Material>; flows: FlowField };

function prepareTurbo(root: Object3D): Kit {
  if (root.userData.kit) return root.userData.kit as Kit;
  const solid = new Map<Mesh, Material>();
  let turbine: MeshStandardMaterial | null = null;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    solid.set(object, object.material as Material);
    if ((object.material as Material).name === 'turbine_iron') turbine = object.material as MeshStandardMaterial;
  });
  const flows = new FlowField(readFlows(root));
  flows.group.visible = false;
  root.add(flows.group);
  const kit: Kit = { root, compressors: ['Compressor_left', 'Compressor_right'].map((name) => root.getObjectByName(name)!), turbine, solid, flows };
  root.userData.kit = kit;
  return kit;
}

/** The kit itself: on the engine, with the stock tail pipes off, spinning and glowing with boost. */
function Kit({ rig }: { rig: EngineRig }) {
  const gltf = useLoader(GLTFLoader, TURBO_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const kit = useMemo(() => prepareTurbo(gltf.scene), [gltf]);
  const xray = useGarage((state) => state.inside && isHoodOpen(state.view));
  const ghosted = useGarage((state) => isDriveView(state.view)) || xray;
  const ghost = useMemo(ghostMaterial, []);
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    rig.engine.add(kit.root);
    for (const pipe of rig.tailpipes) pipe.visible = false;
    if (QA) Object.assign(window, { garageTurbo: () => kit.compressors.map((compressor) => compressor.rotation.z) });
    return () => {
      rig.engine.remove(kit.root);
      for (const pipe of rig.tailpipes) pipe.visible = true;
    };
  }, [rig, kit]);

  useEffect(() => {
    for (const [mesh, material] of kit.solid) {
      mesh.material = ghosted ? ghost : material;
      mesh.castShadow = !ghosted;
    }
    kit.flows.group.visible = xray;
  }, [kit, xray, ghosted, ghost]);

  useFrame((state, dt) => {
    const { boost, rpm, status } = engineLive;
    for (const compressor of kit.compressors) compressor.rotation.z -= MathUtils.degToRad(spinStep(rpm * boost, COMPRESSOR_RATIO, Math.min(dt, 0.1)));
    kit.turbine?.emissive.copy(TURBINE_GLOW).multiplyScalar(boost * boost);
    if (!kit.flows.group.visible) return;
    const running = status !== 'off';
    const along = state.clock.elapsedTime * (0.15 + 0.6 * boost);
    for (const side of ['left', 'right']) {
      kit.flows.stream(`Flow_charge_${side}`, along, running ? 0.15 + 0.85 * boost : 0);
      kit.flows.stream(`Flow_exhaust_turbo_${side}`, along * 1.5, running ? 0.6 : 0);
    }
    kit.flows.setScale(size.height * state.viewport.dpr * 0.5 * camera.projectionMatrix.elements[5]!);
    kit.flows.commit();
  });
  return null;
}

/**
 * The game turbo kit, loaded the first time its switch turns on. The real P60B40 is naturally aspirated; the kit is
 * only in Need for Speed: Most Wanted, and the switch says so.
 */
export function TurboKit({ rig }: { rig: EngineRig }) {
  const fitted = useGarage((state) => state.turbo);
  if (!fitted) return null;
  return (
    <Optional>
      <Suspense fallback={null}>
        <Kit rig={rig} />
      </Suspense>
    </Optional>
  );
}
