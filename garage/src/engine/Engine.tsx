import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { MathUtils, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { getKtx2Loader } from '../car/loaders';
import { QA } from '../qa';
import { ENGINE_TOPIC_IDS, type EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';
import { useGarage } from '../state/store';
import { isDriveView, isHoodOpen } from '../state/view';
import { Internals } from './Internals';
import { insideLive } from './live';
import { ENGINE_PARTS } from './manifest';
import { prepareEngine, setHighlight, setXray } from './prepareEngine';
import { beltStep, butterflyAngle } from './motion';
import { newShake, stepShake } from './shake';
import { TurboKit } from './TurboKit';

const PART_IDS = new Set<string>(ENGINE_PARTS);

/** The engine part a mesh belongs to, from its Part_* ancestor. */
function partOf(object: Object3D | null): EngineTopicId | null {
  for (let node = object; node; node = node.parent) {
    const id = node.name.replace(/^Part_/, '');
    if (node.name.startsWith('Part_') && PART_IDS.has(id)) return id as EngineTopicId;
  }
  return null;
}

export const ENGINE_URL = `${import.meta.env.BASE_URL}models/p60b40.glb`;

/**
 * The P60B40 and its bay, modelled and baked by tools/blender/build_engine.py. The engine sits at `origin`; the bay is
 * in car space. With the hood open, clicking a part opens its topic and the selected part glows. Parts take clicks
 * only, not hover, so the pointer never raycasts the whole engine as it moves. `hood` is the car's hood pivot.
 * While it runs, the engine leans on its mounts with the torque it sends through the gearbox (hardest in 1st, rocking
 * back through a gear change), its belt drive turns with the revs and its throttles open; looking inside turns it
 * to an x-ray around its moving parts. In the gearbox and drive view it shows as an x-ray through the body, without
 * the bay. The game turbo kit bolts on when its switch is on.
 */
export function Engine({ origin, hood, hotspots }: { origin: Vec3; hood: Object3D; hotspots?: (id: EngineTopicId, selected: boolean) => ReactNode }) {
  const gl = useThree((state) => state.gl);
  const gltf = useLoader(GLTFLoader, ENGINE_URL, (loader) => {
    loader.setKTX2Loader(getKtx2Loader(gl));
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const rig = useMemo(() => prepareEngine(gltf.scene), [gltf]);
  const view = useGarage((state) => state.view);
  const open = isHoodOpen(view);
  const selected = view.kind === 'bay-part' ? view.id : null;
  const inside = useGarage((state) => state.inside) && open;
  const drive = useGarage((state) => isDriveView(state.view));
  const shake = useMemo(newShake, []);
  const fastest = useMemo(() => Math.max(...rig.spins.map(({ ratio }) => ratio)), [rig]);
  const throttle = useMemo(() => ({ angle: butterflyAngle(0) }), []);

  useEffect(() => {
    rig.engine.position.set(...origin);
  }, [rig, origin]);
  useEffect(() => setHighlight(rig, open ? selected : null), [rig, open, selected]);
  useEffect(() => setXray(rig, inside || drive, selected), [rig, inside, drive, selected]);
  useEffect(() => {
    rig.bay.visible = !drive;
  }, [rig, drive]);
  useEffect(() => {
    if (QA) Object.assign(window, { garageBelt: () => rig.spins.map(({ node }) => node.rotation.z), garageMount: () => rig.engine.rotation.z });
  }, [rig]);
  useFrame((_, dt) => {
    // Nothing sees the engine while the hood is shut (the radiator fills the grille), so skip drawing it then, unless
    // the body is an x-ray around the driveline.
    rig.engine.visible = hood.rotation.x !== 0 || isDriveView(useGarage.getState().view);
    const [x, y] = stepShake(shake, engineLive.rpm, engineLive.mount, engineLive.status !== 'off', dt);
    const still = useGarage.getState().reducedMotion;
    rig.engine.position.set(origin[0] + (still ? 0 : x), origin[1] + (still ? 0 : y), origin[2]);
    rig.engine.rotation.z = still ? 0 : shake.roll;
    // The belt drive: in the x-ray it follows the slowed crank; outside, slowed so its fastest pulley never strobes.
    const xray = useGarage.getState().inside && hood.rotation.x !== 0;
    for (const { node, ratio } of rig.spins) {
      if (xray) node.rotation.z = -MathUtils.degToRad(insideLive.crank * ratio);
      else node.rotation.z -= MathUtils.degToRad(beltStep(engineLive.rpm, ratio, fastest, Math.min(dt, 0.1)));
    }
    throttle.angle += (butterflyAngle(engineLive.load) - throttle.angle) * Math.min(1, dt / 0.06);
    for (const { node, side } of rig.throttles) node.rotation.z = side * MathUtils.degToRad(throttle.angle);
  });

  const select = (event: ThreeEvent<MouseEvent>) => {
    const id = partOf(event.object);
    if (!id) return; // the bay: let the click carry on
    event.stopPropagation();
    useGarage.getState().dispatch({ type: 'select-part', id });
  };

  return (
    <>
      <primitive object={rig.root} onClick={open ? select : undefined} />
      {inside && (
        <Suspense fallback={null}>
          <Internals rig={rig} />
        </Suspense>
      )}
      <TurboKit rig={rig} />
      <group position={origin}>{open && hotspots && ENGINE_TOPIC_IDS.map((id) => <group key={id}>{hotspots(id, selected === id)}</group>)}</group>
    </>
  );
}
