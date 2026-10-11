import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_MS, initialQuality, trackFrame, type FrameWindow } from './quality';

describe('initialQuality', () => {
  it('starts phones and small screens on low', () => {
    expect(initialQuality({ coarsePointer: false, shortSide: 900, reducedData: false })).toBe('high');
    expect(initialQuality({ coarsePointer: true, shortSide: 900, reducedData: false })).toBe('low');
    expect(initialQuality({ coarsePointer: false, shortSide: 600, reducedData: false })).toBe('low');
    expect(initialQuality({ coarsePointer: false, shortSide: 900, reducedData: true })).toBe('low');
  });
});

describe('trackFrame', () => {
  const run = (dt: number, frames: number) => {
    let window: FrameWindow = { elapsed: 0, frames: 0 };
    let over = false;
    for (let i = 0; i < frames; i++) {
      const result = trackFrame(window, dt);
      window = result.window;
      over ||= result.overBudget;
    }
    return over;
  };

  it('stays quiet at 60 fps and flags a sustained slow window', () => {
    expect(run(1 / 60, 240)).toBe(false);
    expect(run((FRAME_BUDGET_MS + 5) / 1000, 120)).toBe(true);
  });

  it('ignores the huge frame after a hidden tab', () => {
    expect(trackFrame({ elapsed: 0, frames: 0 }, 5)).toEqual({ window: { elapsed: 0, frames: 0 }, overBudget: false });
  });
});
