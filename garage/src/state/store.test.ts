import { beforeEach, describe, expect, it } from 'vitest';
import { useGarage } from './store';
import { SHOWROOM } from './view';

describe('useGarage', () => {
  beforeEach(() => useGarage.setState({ view: SHOWROOM, quality: 'high', ready: false, soundOn: false, ownTrack: null, trackError: null, inside: false }));

  it('routes view actions through the reducer', () => {
    useGarage.getState().dispatch({ type: 'select-car', id: 'hood' });
    expect(useGarage.getState().view).toEqual({ kind: 'bay' });
  });

  it('does not notify when going back from the showroom', () => {
    let calls = 0;
    const unsubscribe = useGarage.subscribe(() => calls++);
    useGarage.getState().dispatch({ type: 'back' });
    unsubscribe();
    expect(calls).toBe(0);
  });

  it('looks inside the engine only with the hood open, and stops when it closes', () => {
    const s = useGarage.getState();
    s.setInside(true);
    expect(useGarage.getState().inside).toBe(false);
    s.dispatch({ type: 'select-car', id: 'hood' });
    s.setInside(true);
    s.dispatch({ type: 'select-part', id: 'crank' });
    expect(useGarage.getState().inside).toBe(true);
    s.dispatch({ type: 'close-hood' });
    expect(useGarage.getState().inside).toBe(false);
  });

  it('stores settings', () => {
    const s = useGarage.getState();
    s.setQuality('low');
    s.setSound(true);
    s.setOwnTrack('song.mp3');
    s.setReady();
    expect(useGarage.getState()).toMatchObject({ quality: 'low', soundOn: true, ownTrack: 'song.mp3', ready: true });
  });
});
