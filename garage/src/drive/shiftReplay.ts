/**
 * A gear change, replayed slowly enough to follow. The crate changes gear in a tenth of a second: the clutch opens,
 * the gearbox swaps gears, and the clutch closes again. The x-ray replays each change slowed like its moving parts,
 * one step at a time: the clutch opens, the old gear's dog ring slides out, the new gear's slides in, and the clutch
 * closes. The live engine, the sound and the gauges carry on at full speed meanwhile.
 */
import { SLOW_MOTION } from '../engine/motion';
import { dogOffset, ordinal } from './gears';
import { CLUTCH_NODES, DOG_NODES, FORK_NODES } from './manifest';

/** A change from one gear to another (0 is neutral), with the revs before it and, once known, after it. */
export type Change = { from: number; to: number; rpmBefore: number; rpmAfter: number | null };

export type ReplayStep = 'open' | 'out' | 'in' | 'close';

export type ReplayPose = {
  /** The step under way, or null once the replay has finished its steps. */
  step: ReplayStep | null;
  /** How far the clutch is open: 0 shut, 1 wide open. */
  clutch: number;
  /** Each dog ring's slide, 1-2, 3-4 and 5-6: -1 toward its lower gear, 1 toward its upper, 0 centred. */
  rings: number[];
  /** The ring sliding now, if any. */
  moving: number | null;
  /** The gear that carries the drive whenever the clutch is shut (0 for none). */
  gear: number;
};

/** The replay runs this many times slower than the change, like the rest of the x-ray. */
export const REPLAY_SLOWDOWN = SLOW_MOTION;
/** The share of the replay its steps take; it holds the finished change for the rest. */
const ACTIVE = 0.9;
const RINGS = 3;

export const replaySeconds = (shiftSeconds: number): number => shiftSeconds * REPLAY_SLOWDOWN;

const ringOf = (gear: number): number | null => (gear > 0 ? Math.floor((gear - 1) / 2) : null);
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The steps a change goes through. Out of neutral the clutch is already open; into it, it stays open. */
export function replaySteps({ from, to }: Change): ReplayStep[] {
  const steps: ReplayStep[] = [];
  if (from > 0) steps.push('open', 'out');
  if (to > 0) steps.push('in', 'close');
  return steps;
}

/** Where everything is a share `progress` (0 to 1) of the way through replaying `change`. */
export function replayPose(change: Change, progress: number): ReplayPose {
  const steps = replaySteps(change);
  const span = ACTIVE / steps.length;
  const p = clamp01(progress);
  const index = Math.min(Math.floor(p / span), steps.length);
  const step = steps[index] ?? null;
  // How far each step has got: 1 once it is over, 0 before it starts.
  const done = (name: ReplayStep) => {
    const k = steps.indexOf(name);
    return k < 0 ? 0 : ease(clamp01((p - k * span) / span));
  };

  const rings = Array.from({ length: RINGS }, (_, k) => dogOffset(k, change.from));
  const out = ringOf(change.from);
  const into = ringOf(change.to);
  if (out !== null) rings[out] = dogOffset(out, change.from) * (1 - done('out'));
  // 1st and 2nd share a ring (as do 3rd and 4th, 5th and 6th): it slides out to the middle, then on into the other.
  if (into !== null && (into !== out || done('in') > 0)) rings[into] = dogOffset(into, change.to) * done('in');

  const open = change.from > 0 ? done('open') : 1;
  const clutch = change.to > 0 ? open * (1 - done('close')) : open;
  const moving = step === 'out' ? out : step === 'in' ? into : null;
  const swapped = change.to > 0 ? done('in') >= 1 : done('out') >= 1;
  return { step, clutch, rings: rings.map((v) => v + 0), moving, gear: swapped ? change.to : change.from }; // + 0 makes -0 a plain 0
}

/** The parts a step is moving, for the x-ray to pick out: the clutch pack, or the sliding ring and its fork. */
export function replayCue(pose: ReplayPose): readonly string[] {
  if (pose.step === 'open' || pose.step === 'close') return CLUTCH_NODES;
  if (pose.moving !== null) return [DOG_NODES[pose.moving]!, FORK_NODES[pose.moving]!];
  return [];
}

/** A step's short name. */
export function stepTitle(step: ReplayStep, { from, to }: Change): string {
  switch (step) {
    case 'open':
      return 'Clutch opens';
    case 'out':
      return `Out of ${ordinal(from)}`;
    case 'in':
      return `Into ${ordinal(to)}`;
    case 'close':
      return 'Clutch closes';
  }
}

const rpm = (n: number) => (Math.round(n / 10) * 10).toLocaleString('en-US');

/** What happens in a step, in a sentence or two. */
export function stepText(step: ReplayStep, change: Change): string {
  const { from, to, rpmBefore, rpmAfter } = change;
  switch (step) {
    case 'open':
      if (to === 0) return 'The clutch opens, so the engine lets go of the gearbox.';
      return to > from
        ? 'The spark is cut and the clutch opens, so the engine lets go of the gearbox.'
        : 'The clutch opens and the throttle blips, revving the engine up for the lower gear.';
    case 'out':
      return `A fork slides the dog ring out of ${ordinal(from)}, which now spins free on the output shaft.`;
    case 'in':
      return `A fork slides the dog ring into ${ordinal(to)}, locking that gear to the output shaft.`;
    case 'close': {
      const drive = `The clutch closes and ${ordinal(to)} takes up the drive.`;
      if (rpmAfter === null || Math.abs(rpmAfter - rpmBefore) < 100) return drive;
      return `${drive} The revs ${rpmAfter < rpmBefore ? 'fall' : 'rise'} from ${rpm(rpmBefore)} to ${rpm(rpmAfter)} rpm to match it.`;
    }
  }
}

export type ListedStep = { step: ReplayStep; title: string; state: 'done' | 'now' | 'next'; text: string | null };

/** The change's steps for the panel, at `current` (null once played): only the step under way, or the last once played, is explained. */
export function replayList(change: Change, current: ReplayStep | null): ListedStep[] {
  const steps = replaySteps(change);
  const at = current === null ? steps.length : steps.indexOf(current);
  const explained = Math.min(at, steps.length - 1);
  return steps.map((step, k) => ({
    step,
    title: stepTitle(step, change),
    state: k < at ? 'done' : k === at ? 'now' : 'next',
    text: k === explained ? stepText(step, change) : null,
  }));
}

/** The gears either side of a change, for the list's heading. */
export function replayCaption({ from, to }: Change): string {
  const name = (gear: number) => (gear > 0 ? ordinal(gear) : 'neutral');
  const words = `${name(from)} to ${name(to)}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
