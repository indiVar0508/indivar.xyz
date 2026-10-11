import { describe, expect, it } from 'vitest';
import { DRIFT_RADIANS_PER_SECOND, IDLE_SECONDS, stepDrift } from './drift';

// stepDrift runs every frame, so it updates the idle timer in place and returns only the angle (spec §7: no per-frame allocations).
describe('stepDrift', () => {
  it('waits for the idle delay, then turns at the drift rate', () => {
    const timer = { idle: 0 };
    let angle = 0;
    for (let i = 0; i < IDLE_SECONDS * 60 - 1; i++) angle += stepDrift(timer, 1 / 60);
    expect(angle).toBe(0);
    for (let i = 0; i < 61; i++) stepDrift(timer, 1 / 60);
    expect(stepDrift(timer, 1 / 60)).toBeCloseTo(DRIFT_RADIANS_PER_SECOND / 60);
  });

  it('treats a long frame (shader compile, hidden tab) as a short one', () => {
    const timer = { idle: 0 };
    expect(stepDrift(timer, 8)).toBe(0);
    expect(timer.idle).toBeLessThan(IDLE_SECONDS);
    expect(stepDrift({ idle: IDLE_SECONDS + 1 }, 60)).toBeLessThan(0.01);
  });
});
