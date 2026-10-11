import { mulberry32 } from '../random';

const PERIOD = 6;
const STUTTER = 1.1;
/** Slot length (s). At 0.2 s the tube changes at most six times a second: three flashes, the WCAG 2.3.1 limit. */
const BLINK = 0.2;

/** Brightness 0..1 for a failing fluorescent tube: mostly on, with one seeded stutter every few seconds. */
export function flickerLevel(t: number, seed = 7): number {
  const cycle = Math.floor(t / PERIOD);
  const start = mulberry32(seed * 9973 + cycle)() * (PERIOD - STUTTER - 0.1);
  const local = t - cycle * PERIOD - start;
  if (local < 0 || local > STUTTER) return 1;
  const blink = Math.floor(local / BLINK);
  return mulberry32(seed + cycle * 131 + blink)() < 0.45 ? 0.08 : 1;
}
