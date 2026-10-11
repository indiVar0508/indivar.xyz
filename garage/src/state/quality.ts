export type Quality = 'high' | 'low';
export type DeviceHints = { coarsePointer: boolean; shortSide: number; reducedData: boolean };
export type FrameWindow = { elapsed: number; frames: number };

export const FRAME_WINDOW_SECONDS = 2;
export const FRAME_BUDGET_MS = 28;
const STALL_SECONDS = 0.25;

export function initialQuality(hints: DeviceHints): Quality {
  return hints.coarsePointer || hints.shortSide < 700 || hints.reducedData ? 'low' : 'high';
}

export function readDeviceHints(): DeviceHints {
  const media = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;
  return {
    coarsePointer: media('(pointer: coarse)'),
    shortSide: Math.min(innerWidth, innerHeight),
    reducedData: media('(prefers-reduced-data: reduce)'),
  };
}

/** Adds one frame. When a window closes, reports whether its average frame time broke the budget. */
export function trackFrame(window: FrameWindow, dt: number): { window: FrameWindow; overBudget: boolean } {
  if (dt > STALL_SECONDS) return { window, overBudget: false };
  const elapsed = window.elapsed + dt;
  const frames = window.frames + 1;
  if (elapsed < FRAME_WINDOW_SECONDS) return { window: { elapsed, frames }, overBudget: false };
  return { window: { elapsed: 0, frames: 0 }, overBudget: (elapsed / frames) * 1000 > FRAME_BUDGET_MS };
}
