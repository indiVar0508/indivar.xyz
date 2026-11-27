import { useFrame, useLoader } from '@react-three/fiber';
import { Suspense, use, useEffect, useMemo } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { engineLive } from '../audio/engineSound';
import { setCarXray, type CarRig } from '../car/prepareCar';
import { Optional } from '../engine/Internals';
import { crankTurn, wheelTurn } from '../engine/motion';
import { loadKinematics } from '../engine/p60';
import { QA } from '../qa';
import { useGarage } from '../state/store';
import { isDriveView } from '../state/view';
import { DriveSpin } from './gears';
import { poseDrivetrain, prepareDrivetrain, setDriveGlow } from './prepareDrivetrain';

export const DRIVETRAIN_URL = `${import.meta.env.BASE_URL}models/drivetrain.glb`;

/** Torque through the clutch at which the drive's path glows fully: about the engine's quoted 480 N·m peak. */
const FULL_GLOW_TORQUE = 480;
const TURN = 2 * Math.PI;

/**
 * The rolling road under the rear wheels, always there, and the driveline behind the engine, shown in the gearbox and
 * drive view with the body as an x-ray around it. The rear wheels and the rollers turn at the speed the audio thread
 * reports. In the x-ray everything turns slowed 40× like the engine's moving parts, each shaft at its true ratio.
 */
function Model({ car }: { car: CarRig }) {
  const gltf = useLoader(GLTFLoader, DRIVETRAIN_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const box = use(loadKinematics()).gearbox;
  const rig = useMemo(() => prepareDrivetrain(gltf.scene, box), [gltf, box]);
  const spin = useMemo(() => new DriveSpin(box), [box]);
  const drive = useGarage((state) => isDriveView(state.view));

  useEffect(() => {
    rig.driveline.visible = drive;
    setCarXray(car, drive);
  }, [rig, car, drive]);
  useEffect(() => {
    if (QA) {
      Object.assign(window, {
        garageDrive: () => ({
          wheels: car.wheels.map((wheel) => wheel.rotation.x),
          rollers: rig.rollers.map(({ node }) => node.rotation.x),
          input: rig.input.rotation.z,
          dogs: rig.dogs.map(({ ring, rest }) => ring.position.z - rest),
          driveline: rig.driveline.visible,
        }),
      });
    }
  }, [rig, car]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const { rpm, wheel, gear, clutch } = engineLive;
    const turn = wheelTurn(wheel, step, drive);
    spin.step(drive ? crankTurn(rpm, step) : 0, turn, gear);
    for (const driven of car.wheels) driven.rotation.x = spin.wheel;
    // The rollers turn the other way, faster by the ratio of the radii; each keeps its own angle, so wrapping the
    // tyre's never makes them jump.
    for (const { node, ratio } of rig.rollers) node.rotation.x = (node.rotation.x - turn * ratio) % TURN;
    if (drive) {
      poseDrivetrain(rig, spin, gear, step);
      setDriveGlow(rig, gear, Math.abs(clutch) / FULL_GLOW_TORQUE);
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
