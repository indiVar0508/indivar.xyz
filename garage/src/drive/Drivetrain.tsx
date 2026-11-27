import { useFrame, useLoader } from '@react-three/fiber';
import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { setCarXray, type CarRig } from '../car/prepareCar';
import { Optional } from '../engine/Internals';
import { crankTurn, wheelTurn } from '../engine/motion';
import { loadKinematics } from '../engine/p60';
import { QA } from '../qa';
import { useGarage } from '../state/store';
import { isDriveView, isHoodOpen } from '../state/view';
import { DriveSpin } from './gears';
import { poseDrivetrain, prepareDrivetrain, setDriveGlow } from './prepareDrivetrain';
import { replayCue, replayPose, replaySeconds, type Change, type ReplayPose, type ReplayStep } from './shiftReplay';

export const DRIVETRAIN_URL = `${import.meta.env.BASE_URL}models/drivetrain.glb`;

/** Torque through the clutch at which the drive's path glows fully: about the engine's quoted 480 N·m peak. */
const FULL_GLOW_TORQUE = 480;
const TURN = 2 * Math.PI;

/** A gear change being replayed: what changed, how long it has played, and the step it last reported. */
type Replay = { change: Change; elapsed: number; step: ReplayStep | null | undefined };

/**
 * The rolling road under the rear wheels, always there, and the driveline behind the engine, shown with the body as an
 * x-ray around it in the gearbox and drive view and when looking inside the engine. The rear wheels and the rollers
 * turn at the speed the audio thread reports. In the x-ray everything turns slowed 40× like the engine's moving parts,
 * each shaft at its true ratio, and each gear change is replayed slowed as much, a step at a time.
 */
function Model({ car }: { car: CarRig }) {
  const gltf = useLoader(GLTFLoader, DRIVETRAIN_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const box = use(loadKinematics()).gearbox;
  const rig = useMemo(() => prepareDrivetrain(gltf.scene, box), [gltf, box]);
  const spin = useMemo(() => new DriveSpin(box), [box]);
  const drive = useGarage((state) => isDriveView(state.view) || (state.inside && isHoodOpen(state.view)));
  const replay = useRef<Replay | null>(null);
  const seen = useRef({ gear: engineLive.gear, rpm: engineLive.rpm });

  useEffect(() => {
    rig.driveline.visible = drive;
    setCarXray(car, drive);
    if (!drive) {
      replay.current = null;
      useGarage.getState().setReplay(null);
    }
  }, [rig, car, drive]);
  useEffect(() => {
    if (QA) {
      Object.assign(window, {
        garageDrive: () => ({
          wheels: car.wheels.map((wheel) => wheel.rotation.x),
          rollers: rig.rollers.map(({ node }) => node.rotation.x),
          input: rig.input.rotation.z,
          dogs: rig.dogs.map(({ ring, rest }) => ring.position.z - rest),
          clutch: rig.clutch.map(({ node, rest }) => rest - node.position.z),
          driveline: rig.driveline.visible,
        }),
      });
    }
  }, [rig, car]);

  /** Starts replaying a change the x-ray saw, advances the one playing, and returns where it has the parts. */
  const advanceReplay = (gear: number, rpm: number, step: number): ReplayPose | null => {
    if (gear !== seen.current.gear) {
      replay.current = drive ? { change: { from: seen.current.gear, to: gear, rpmBefore: seen.current.rpm, rpmAfter: null }, elapsed: 0, step: undefined } : null;
      seen.current.gear = gear;
    }
    seen.current.rpm = rpm;
    const playing = replay.current;
    if (!playing) return null;
    playing.elapsed += step;
    // The crate's change is over in shiftSeconds; once the clutch has taken up the new gear, the revs show where it left them.
    if (playing.change.rpmAfter === null && playing.elapsed >= 2 * box.shiftSeconds) {
      playing.change = { ...playing.change, rpmAfter: rpm };
      playing.step = undefined;
    }
    const progress = playing.elapsed / replaySeconds(box.shiftSeconds);
    const pose = replayPose(playing.change, progress);
    if (pose.step !== playing.step) {
      playing.step = pose.step;
      useGarage.getState().setReplay({ change: playing.change, step: pose.step });
    }
    if (progress >= 1) replay.current = null;
    return pose;
  };

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const { rpm, wheel, gear, clutch } = engineLive;
    const turn = wheelTurn(wheel, step, drive);
    spin.step(drive ? crankTurn(rpm, step) : 0, turn, gear);
    for (const driven of car.wheels) driven.rotation.x = spin.wheel;
    // The rollers turn the other way, faster by the ratio of the radii; each keeps its own angle, so wrapping the
    // tyre's never makes them jump.
    for (const { node, ratio } of rig.rollers) node.rotation.x = (node.rotation.x - turn * ratio) % TURN;
    const pose = advanceReplay(gear, rpm, step);
    if (drive) {
      poseDrivetrain(rig, spin, gear, step, pose);
      const load = Math.abs(clutch) / FULL_GLOW_TORQUE;
      // While the replay has the clutch open, no drive goes through, whatever the live engine is doing by now.
      if (pose) setDriveGlow(rig, pose.gear, load * (1 - pose.clutch), replayCue(pose));
      else setDriveGlow(rig, gear, load);
    }
  });

  return <primitive object={rig.root} />;
}

/** If the drivetrain can't load, the wheels simply stay still and the rest of the garage carries on. */
export function Drivetrain({ car }: { car: CarRig }) {
  return (
    <Optional>
      <Suspense fallback={null}>
        <Model car={car} />
      </Suspense>
    </Optional>
  );
}
