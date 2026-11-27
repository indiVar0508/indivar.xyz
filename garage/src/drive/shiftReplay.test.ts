import { describe, expect, it } from 'vitest';
import { CLUTCH_NODES } from './manifest';
import { REPLAY_SLOWDOWN, replayCaption, replayCue, replayList, replayPose, replaySeconds, replaySteps, stepText, stepTitle, type Change } from './shiftReplay';

const change = (from: number, to: number, rpmBefore = 5800, rpmAfter: number | null = 4600): Change => ({ from, to, rpmBefore, rpmAfter });

/** The pose a share `p` of the way through the replay. */
const at = (c: Change, p: number) => replayPose(c, p);

describe('a gear change, replayed', () => {
  it('lasts the crate’s change time, slowed like the rest of the x-ray', () => {
    expect(REPLAY_SLOWDOWN).toBe(40);
    expect(replaySeconds(0.12)).toBeCloseTo(4.8);
  });

  it('opens the clutch, slides one ring out and one in, then closes the clutch, in that order', () => {
    expect(replaySteps(change(2, 3))).toEqual(['open', 'out', 'in', 'close']);
    const steps = [0.01, 0.2, 0.3, 0.5, 0.55, 0.75, 0.85].map((p) => at(change(2, 3), p).step);
    expect(steps.filter((step, k) => step !== steps[k - 1])).toEqual(['open', 'out', 'in', 'close']);
    expect(at(change(2, 3), 0.95).step).toBeNull();
  });

  it('starts in the old gear with the clutch shut, and ends in the new one with it shut again', () => {
    const start = at(change(2, 3), 0);
    expect(start.clutch).toBe(0);
    expect(start.rings).toEqual([1, 0, 0]);
    expect(start.gear).toBe(2);
    const end = at(change(2, 3), 1);
    expect(end.clutch).toBe(0);
    expect(end.rings).toEqual([0, -1, 0]);
    expect(end.gear).toBe(3);
  });

  it('holds the clutch wide open while the rings move, so no drive goes through', () => {
    for (const p of [0.25, 0.4, 0.5, 0.6, 0.65]) {
      const pose = at(change(2, 3), p);
      expect(pose.clutch, `at ${p}`).toBe(1);
    }
    expect(at(change(2, 3), 0.1).clutch).toBeGreaterThan(0);
    expect(at(change(2, 3), 0.1).clutch).toBeLessThan(1);
  });

  it('moves only the ring for the old gear on the way out, and only the new one’s on the way in', () => {
    const out = at(change(2, 3), 0.35);
    expect(out.moving).toBe(0);
    expect(out.rings[0]).toBeGreaterThan(0);
    expect(out.rings[0]).toBeLessThan(1);
    expect(out.rings[1]).toBe(0);
    const into = at(change(2, 3), 0.58);
    expect(into.moving).toBe(1);
    expect(into.rings[0]).toBe(0);
    expect(into.rings[1]).toBeLessThan(0);
    expect(into.rings[1]).toBeGreaterThan(-1);
  });

  it('slides one ring right across when both gears share it, as 1st and 2nd do', () => {
    expect(at(change(1, 2), 0).rings[0]).toBe(-1);
    expect(at(change(1, 2), 0.45).rings[0]).toBe(0);
    expect(at(change(1, 2), 1).rings[0]).toBe(1);
    expect(at(change(1, 2), 0.35).moving).toBe(0);
    expect(at(change(1, 2), 0.58).moving).toBe(0);
  });

  it('only slides a ring in from neutral, with the clutch already open, then closes it', () => {
    expect(replaySteps(change(0, 1, 1500, 1500))).toEqual(['in', 'close']);
    expect(at(change(0, 1), 0).clutch).toBe(1);
    expect(at(change(0, 1), 0).rings).toEqual([0, 0, 0]);
    expect(at(change(0, 1), 1).rings).toEqual([-1, 0, 0]);
    expect(at(change(0, 1), 1).clutch).toBe(0);
  });

  it('into neutral, opens the clutch and slides the ring out, and leaves the clutch open', () => {
    expect(replaySteps(change(1, 0))).toEqual(['open', 'out']);
    expect(at(change(1, 0), 1).rings).toEqual([0, 0, 0]);
    expect(at(change(1, 0), 1).clutch).toBe(1);
    expect(at(change(1, 0), 1).gear).toBe(0);
  });

  it('picks out the clutch while it opens and closes, and the sliding ring and its fork while they move', () => {
    expect(replayCue(at(change(2, 3), 0.1))).toEqual([...CLUTCH_NODES]);
    expect(replayCue(at(change(2, 3), 0.35))).toEqual(['Dog_12', 'Fork_12']);
    expect(replayCue(at(change(2, 3), 0.58))).toEqual(['Dog_34', 'Fork_34']);
    expect(replayCue(at(change(2, 3), 0.8))).toEqual([...CLUTCH_NODES]);
    expect(replayCue(at(change(2, 3), 0.95))).toEqual([]);
  });

  it('clamps outside the replay', () => {
    expect(at(change(2, 3), -1)).toEqual(at(change(2, 3), 0));
    expect(at(change(2, 3), 2)).toEqual(at(change(2, 3), 1));
  });
});

describe('the steps, in words', () => {
  it('names each step for the gears involved', () => {
    expect(replaySteps(change(2, 3)).map((step) => stepTitle(step, change(2, 3)))).toEqual(['Clutch opens', 'Out of 2nd', 'Into 3rd', 'Clutch closes']);
  });

  it('cuts the spark on the way up and blips the throttle on the way down', () => {
    expect(stepText('open', change(2, 3))).toMatch(/spark is cut/);
    expect(stepText('open', change(3, 2, 4000, 5100))).toMatch(/throttle blips/);
    expect(stepText('open', change(1, 0))).not.toMatch(/spark|throttle/);
  });

  it('says what each ring does', () => {
    expect(stepText('out', change(2, 3))).toMatch(/out of 2nd/);
    expect(stepText('in', change(2, 3))).toMatch(/into 3rd/);
  });

  it('reads the revs either side of the change once they are known', () => {
    expect(stepText('close', change(2, 3, 5800, 4600))).toBe('The clutch closes and 3rd takes up the drive. The revs fall from 5,800 to 4,600 rpm to match it.');
    expect(stepText('close', change(3, 2, 4000, 5100))).toMatch(/rise from 4,000 to 5,100 rpm/);
    expect(stepText('close', change(2, 3, 5800, null))).toBe('The clutch closes and 3rd takes up the drive.');
    expect(stepText('close', change(0, 1, 1500, 1460))).toBe('The clutch closes and 1st takes up the drive.');
  });
});

describe('the steps, as a list', () => {
  it('marks the steps done, the one under way, and those to come, and explains only the one under way', () => {
    const list = replayList(change(2, 3), 'in');
    expect(list.map(({ state }) => state)).toEqual(['done', 'done', 'now', 'next']);
    expect(list.map(({ title }) => title)).toEqual(['Clutch opens', 'Out of 2nd', 'Into 3rd', 'Clutch closes']);
    expect(list.filter(({ text }) => text).map(({ step }) => step)).toEqual(['in']);
  });

  it('once played, marks every step done and keeps the last one’s words, with the revs', () => {
    const list = replayList(change(2, 3), null);
    expect(list.every(({ state }) => state === 'done')).toBe(true);
    expect(list.at(-1)!.text).toMatch(/fall from 5,800 to 4,600 rpm/);
  });

  it('heads the list with the gears either side of the change', () => {
    expect(replayCaption(change(2, 3))).toBe('2nd to 3rd');
    expect(replayCaption(change(0, 1))).toBe('Neutral to 1st');
    expect(replayCaption(change(1, 0))).toBe('1st to neutral');
  });
});
