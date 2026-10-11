import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { trackFrame, type FrameWindow } from '../state/quality';
import { useGarage } from '../state/store';

const WARMUP_SECONDS = 3;

/** Drops to low quality once frames stay slow; never switches back up. */
export function FrameMonitor() {
  const window = useRef<FrameWindow>({ elapsed: 0, frames: 0 });
  const warmup = useRef(WARMUP_SECONDS);
  useFrame((_, dt) => {
    const { quality, qualityLocked, setQuality } = useGarage.getState();
    if (quality === 'low' || qualityLocked) return;
    if (warmup.current > 0) {
      warmup.current -= dt;
      return;
    }
    const result = trackFrame(window.current, dt);
    window.current = result.window;
    if (result.overBudget) setQuality('low');
  });
  return null;
}
