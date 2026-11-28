import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { Box3, Vector3, type Object3D } from 'three';
import { engineLive } from '../audio/engineSound';
import { dogOffset, gearboxRatio, liveShaftSpeeds, ordinal, shaftSpeeds, type Gearbox, type ShaftSpeeds } from './gears';
import type { DriveRig } from './prepareDrivetrain';
import type { Change, ReplayPose } from './shiftReplay';

/** What the gearbox is showing this frame: a replayed change's pose, if one is playing. */
export type ShownChange = { change: Change; pose: ReplayPose } | null;

/** Labels redraw this often (s), so their numbers can be read. */
const REDRAW = 0.12;
/** Pixels from a label to the part it names: the gears' close, the shafts' a row further out, clear of them. */
const NEAR = 12;
const FAR = 48;
const TITLES: Record<string, string> = { clutch: 'Clutch', input: 'Input shaft', layshaft: 'Layshaft', output: 'Output shaft' };

const rpm = (n: number) => `${(Math.round(Math.max(0, n) / 10) * 10).toLocaleString('en-US')} rpm`;
const ringOf = (gear: number) => Math.floor((gear - 1) / 2);

/** Where some parts' meshes sit, in the drivetrain's own space. */
function boxOf(rig: DriveRig, ...nodes: Object3D[]): Box3 {
  rig.root.updateMatrixWorld(true);
  const box = new Box3();
  for (const node of nodes) box.union(new Box3().setFromObject(node));
  return box.applyMatrix4(rig.root.matrixWorld.clone().invert());
}

type Spot = { key: string; at: Vector3; kind: 'gear' | 'part'; side: 'above' | 'below'; stem: number };

function placeLabels(rig: DriveRig): Spot[] {
  const axis = boxOf(rig, rig.output);
  const shaftY = (axis.min.y + axis.max.y) / 2;
  const lay = boxOf(rig, rig.layshaft);
  const clutch = boxOf(rig, ...rig.clutch.map(({ node }) => node));
  const input = boxOf(rig, rig.input);
  const middle = (b: Box3) => (b.min.z + b.max.z) / 2;
  // The even gears are labelled above the gearbox and the odd ones below it, so neighbours' labels never meet.
  const spots: Spot[] = rig.gears.map((gear, k) => {
    const even = (k + 1) % 2 === 0;
    const y = even ? boxOf(rig, gear).max.y + 0.004 : boxOf(rig, rig.lays[k]!).min.y - 0.004;
    return { key: `gear-${k + 1}`, at: new Vector3(0, y, middle(boxOf(rig, gear))), kind: 'gear', side: even ? 'above' : 'below', stem: NEAR };
  });
  spots.push(
    { key: 'clutch', at: new Vector3(0, clutch.max.y + 0.004, middle(clutch)), kind: 'part', side: 'above', stem: NEAR },
    { key: 'input', at: new Vector3(0, shaftY - 0.014, (clutch.min.z + input.min.z) / 2), kind: 'part', side: 'below', stem: NEAR },
    { key: 'layshaft', at: new Vector3(0, lay.min.y - 0.004, input.min.z + 0.01), kind: 'part', side: 'below', stem: FAR },
    { key: 'output', at: new Vector3(0, shaftY + 0.018, boxOf(rig, rig.gears[0]!).min.z - 0.05), kind: 'part', side: 'above', stem: FAR },
  );
  return spots;
}

/**
 * Labels the gearbox as it runs: the clutch, and the input shaft, the layshaft and the output shaft with their speeds;
 * and each of the six gears with its speed and whether it is driving the wheels, locked with the clutch open, or free.
 * A locked gear turns at the output shaft's speed; the free ones each turn at their own. While a change replays, the
 * labels show the change, not the live engine, which has already moved on.
 */
export function GearboxLabels({ rig, box, shown }: { rig: DriveRig; box: Gearbox; shown: RefObject<ShownChange> }) {
  const spots = useMemo(() => placeLabels(rig), [rig]);
  const els = useRef<Record<string, HTMLDivElement | null>>({});
  const since = useRef(REDRAW);

  useFrame((_, dt) => {
    since.current += dt;
    if (since.current < REDRAW) return;
    since.current = 0;
    const now = shown.current;
    const live = liveShaftSpeeds(box, engineLive);
    let speeds: ShaftSpeeds = live;
    let locked = (gear: number) => gear === engineLive.gear;
    let open = engineLive.gear === 0 ? 1 : 0;
    if (now) {
      // The change as replayed: the old gear's speeds until its ring is out, the new gear's once its ring is in.
      const { change, pose } = now;
      const input = pose.gear === change.from ? change.rpmBefore : (change.rpmAfter ?? live.input);
      if (pose.gear > 0) speeds = shaftSpeeds(box, { input, output: input / gearboxRatio(box, pose.gear) });
      locked = (gear) => Math.abs(pose.rings[ringOf(gear)]! - dogOffset(ringOf(gear), gear)) < 0.05;
      open = pose.clutch;
    }
    rig.gears.forEach((_, k) => {
      const el = els.current[`gear-${k + 1}`];
      if (!el) return;
      const state = locked(k + 1) ? (open < 0.5 ? 'driving' : 'locked') : 'free';
      el.className = `gearbox-label gear is-${state}`;
      el.children[1]!.textContent = rpm(speeds.gears[k]!);
      el.children[2]!.textContent = state;
    });
    const slipping = !now && engineLive.gear > 0 && Math.abs(engineLive.rpm - speeds.input) > 80;
    const clutch = open > 0.5 ? 'open' : open > 0.02 ? (now?.pose.step === 'close' ? 'closing' : 'opening') : slipping ? 'slipping' : 'shut';
    const words: Record<string, string> = { clutch, input: rpm(speeds.input), layshaft: rpm(speeds.layshaft), output: `${rpm(speeds.output)} → wheels` };
    for (const [key, value] of Object.entries(words)) {
      const el = els.current[key];
      if (el) el.children[1]!.textContent = value;
    }
  });

  return (
    <>
      {spots.map(({ key, at, kind, side, stem }) => (
        <Html key={key} position={at} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`gearbox-pin is-${side}`}>
            <div ref={(el) => void (els.current[key] = el)} className={`gearbox-label ${kind === 'gear' ? 'gear is-free' : 'part'}`}>
              <b>{kind === 'gear' ? ordinal(Number(key.slice(5))) : TITLES[key]}</b>
              <span />
              {kind === 'gear' && <span />}
            </div>
            <i className="gearbox-stem" style={{ height: stem }} />
          </div>
        </Html>
      ))}
    </>
  );
}
