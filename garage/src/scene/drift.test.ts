import { describe, expect, it } from 'vitest';
import { DRIFT_RADIANS_PER_SECOND, IDLE_SECONDS, stepDrift } from './drift';

describe('stepDrift', () => {
  it('waits for the idle delay, then turns at the drift rate', () => {
    let idle = 0;
    let angle = 0;
    for (let i = 0; i < IDLE_SECONDS * 60 - 1; i++) ({ idle, angle } = stepDrift(idle, 1 / 60));
    expect(angle).toBe(0);
    for (let i = 0; i < 61; i++) ({ idle } = stepDrift(idle, 1 / 60));
    expect(stepDrift(idle, 1 / 60).angle).toBeCloseTo(DRIFT_RADIANS_PER_SECOND / 60);
  });

  it('treats a long frame (shader compile, hidden tab) as a short one', () => {
    const first = stepDrift(0, 8);
    expect(first.angle).toBe(0);
    expect(first.idle).toBeLessThan(IDLE_SECONDS);
    expect(stepDrift(IDLE_SECONDS + 1, 60).angle).toBeLessThan(0.01);
  });
});
