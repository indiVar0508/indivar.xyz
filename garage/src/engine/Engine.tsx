import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { getKtx2Loader } from '../car/loaders';
import { ENGINE_TOPIC_IDS, type EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { ENGINE_PARTS } from './manifest';
import { prepareEngine, setHighlight } from './prepareEngine';

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

  useEffect(() => {
    rig.engine.position.set(...origin);
  }, [rig, origin]);
  useEffect(() => setHighlight(rig, open ? selected : null), [rig, open, selected]);
  // Nothing sees the engine while the hood is shut (the radiator fills the grille), so skip drawing it then.
  useFrame(() => {
    rig.engine.visible = hood.rotation.x !== 0;
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
      <group position={origin}>{open && hotspots && ENGINE_TOPIC_IDS.map((id) => <group key={id}>{hotspots(id, selected === id)}</group>)}</group>
    </>
  );
}
