import { useEffect } from 'react';
import { useGarage } from '../state/store';

/** Mounted after everything suspends: tells the loader, the HUD, and tests that the garage is ready. */
export function ReadySignal() {
  useEffect(() => {
    useGarage.getState().setReady();
    document.body.dataset.ready = 'true';
  }, []);
  return null;
}
