import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Component, use, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { QA } from '../qa';
import { FlowField, readFlows, type FlowKind, type FlowPath } from './flows';
import { cylinderLayout } from './geometry';
import { poseInternals, prepareInternals, turnPump, type InternalsRig } from './internals';
import { insideLive } from './live';
import { slowStep } from './motion';
import { FRAME, loadKinematics } from './p60';
import type { EngineRig } from './prepareEngine';

export const INTERNALS_URL = `${import.meta.env.BASE_URL}models/p60b40-internals.glb`;

/** How far up the bore each plug's spark gap sits. */
const SPARK_HEIGHT = 0.2515;
/** Metres per second each fluid moves in the x-ray at idle; it speeds up with rpm. */
const SPEED: Partial<Record<FlowKind, number>> = { air: 0.3, exhaust: 0.5, oil: 0.06, fuel: 0.04, coolant: 0.08, spray: 0.25, jet: 0.4 };
/**
 * Each piston's oil jet: from a nozzle low in the block beside the bore, up toward the piston's underside (m from the
 * crank's axis, and out to the side). Illustrative: race engines commonly cool their pistons this way.
 */
const JET = { from: 0.1, to: 0.17, aside: 0.028 };

/** Paths the page adds to the engine's own: each injector's spray onto its intake valve, and each plug's spark. */
function sprayAndSparks(rig: EngineRig, parts: InternalsRig): FlowPath[] {
  return cylinderLayout().flatMap(({ number, axis, center }, i) => {
    const valve = parts.valves.find((v) => v.cylinder === i && !v.exhaust)!.rest;
    const gap = new Vector3(...axis).multiplyScalar(SPARK_HEIGHT).setZ(center[2]);
    return [
      { name: `Spray_${number}`, kind: 'spray' as const, cylinder: number, points: [rig.injectors[i]!.clone(), valve.clone()] },
      { name: `Spark_${number}`, kind: 'spark' as const, cylinder: number, points: [gap, gap.clone().addScaledVector(new Vector3(...axis), 0.002)] },
    ];
  });
}

/** An oil jet under each piston, aimed up its bore from beside it, on the side away from the V. */
function oilJets(): FlowPath[] {
  return cylinderLayout().map(({ number, axis, center }) => {
    const up = new Vector3(...axis);
    const aside = new Vector3(-axis[1], axis[0], 0).multiplyScalar(-Math.sign(axis[0]));
    return {
      name: `Jet_${number}`,
      kind: 'jet' as const,
      cylinder: number,
      points: [up.clone().multiplyScalar(JET.from).addScaledVector(aside, JET.aside).setZ(center[2]), up.clone().multiplyScalar(JET.to).setZ(center[2])],
    };
  });
}

/**
 * The moving parts, inside the engine node, posed every frame from p60.wasm's kinematics, with the fuel, air,
 * exhaust, oil and coolant that move through them, the timing chains, the oil pump and the jets under the pistons.
 * The crank turns at the engine's speed slowed by SLOW_MOTION.
 */
function MovingParts({ rig }: { rig: EngineRig }) {
  const gltf = useLoader(GLTFLoader, INTERNALS_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const kinematics = use(loadKinematics());
  const parts = useMemo(() => prepareInternals(gltf.scene), [gltf]);
  const flows = useMemo(() => {
    const engine = [...Object.values(rig.parts).flatMap(readFlows), ...readFlows(parts.root), ...sprayAndSparks(rig, parts), ...oilJets()];
    return { engine: new FlowField(engine), bay: new FlowField(readFlows(rig.bay)), paths: [...engine, ...readFlows(rig.bay)] };
  }, [rig, parts]);
  const crank = useRef(insideLive.crank);
  /** Radians of crank turned, which with a sprocket's radius gives how far its chain has run. */
  const chain = useRef(0);
  const travelled = useRef<Partial<Record<FlowKind, number>>>({});
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    rig.engine.add(parts.root, flows.engine.group);
    rig.bay.add(flows.bay.group);
    poseInternals(parts, kinematics.frame(crank.current), false);
    if (QA) {
      Object.assign(window, {
        garagePistons: () => parts.pistons.map((piston) => piston.position.toArray()),
        garageFlows: () => flows.engine.shown() + flows.bay.shown(),
      });
    }
    return () => {
      rig.engine.remove(parts.root, flows.engine.group);
      rig.bay.remove(flows.bay.group);
      insideLive.firing = 0;
    };
  }, [rig, parts, flows, kinematics]);

  useFrame((state, dt) => {
    const { rpm, load, status } = engineLive;
    const running = status !== 'off';
    const burning = status === 'running';
    const step = Math.min(dt, 0.1);
    const turned = slowStep(rpm, step);
    crank.current = (crank.current + turned) % 720;
    chain.current = (chain.current + (turned * Math.PI) / 180) % 10_000;
    turnPump(parts, turned);
    const frame = kinematics.frame(crank.current, load, rpm);
    poseInternals(parts, frame, burning);
    insideLive.crank = crank.current;
    insideLive.firing = burning ? kinematics.firing(crank.current) : 0;

    const pace = rpm / 1500;
    for (const kind of Object.keys(SPEED) as FlowKind[]) travelled.current[kind] = (travelled.current[kind] ?? 0) + SPEED[kind]! * pace * step;
    for (const { name, kind, cylinder, radius } of flows.paths) {
      const field = flows.engine.has(name) ? flows.engine : flows.bay;
      const i = (cylinder ?? 1) - 1;
      const along = travelled.current[kind] ?? 0;
      if (kind === 'exhaust' && cylinder) field.slug(name, frame[FRAME.exhaustPulse(i)]!, burning ? 1 : 0.35);
      else if (kind === 'air' && cylinder) field.stream(name, along, running ? frame[FRAME.intakeLift(i)]! / 0.012 : 0);
      else if (kind === 'air') field.stream(name, along, running ? 0.25 + 0.75 * load : 0);
      else if (kind === 'spray') field.stream(name, along, burning ? frame[FRAME.injection(i)]! : 0);
      else if (kind === 'spark') field.stream(name, 0, burning ? frame[FRAME.spark(i)]! : 0);
      else if (kind === 'chain') field.stream(name, chain.current * (radius ?? 0), 1);
      else if (kind === 'jet') field.stream(name, along, running ? 0.8 : 0);
      else field.stream(name, along, running ? 0.7 : 0);
    }
    const scale = size.height * state.viewport.dpr * 0.5 * camera.projectionMatrix.elements[5]!;
    for (const field of [flows.engine, flows.bay]) {
      field.setScale(scale);
      field.commit();
    }
  });
  return null;
}

/** If the parts can't load, the x-ray simply stays empty; the rest of the garage carries on. */
export class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Internals({ rig }: { rig: EngineRig }) {
  return (
    <Optional>
      <MovingParts rig={rig} />
    </Optional>
  );
}
