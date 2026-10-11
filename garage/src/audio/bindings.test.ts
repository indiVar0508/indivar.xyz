import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarage } from '../state/store';
import { SHOWROOM } from '../state/view';
import { station } from '../music/station';
import { audio } from './controller';
import { bindAudio } from './bindings';

vi.mock('./controller', () => ({ audio: { setEnabled: vi.fn(async () => undefined), sfx: vi.fn(), clearOwnTrack: vi.fn(), setRadioPlaying: vi.fn() } }));
vi.mock('../music/station', () => ({ station: { pause: vi.fn() } }));

let target: EventTarget;
const gesture = (type: 'pointerup' | 'keydown', on?: { closest: (selector: string) => unknown }, key = 'Enter') => {
  const event = Object.assign(new Event(type), { key });
  if (on) Object.defineProperty(event, 'target', { value: on });
  target.dispatchEvent(event);
};
const soundButton = { closest: (selector: string) => (selector === '[data-sound-toggle]' ? {} : null) };

describe('bindAudio with sound remembered as on', () => {
  beforeEach(() => {
    target = new EventTarget();
    Object.assign(globalThis, { window: target, localStorage: { getItem: () => 'on', setItem: () => undefined } });
    useGarage.setState({ view: SHOWROOM, soundOn: false });
    bindAudio();
  });

  it('waits for the first gesture, then turns sound on', () => {
    expect(useGarage.getState().soundOn).toBe(false);
    gesture('pointerup');
    expect(useGarage.getState().soundOn).toBe(true);
  });

  it('leaves a gesture on the sound button to the button, so it does not toggle twice', () => {
    gesture('pointerup', soundButton);
    expect(useGarage.getState().soundOn).toBe(false);
  });

  it('ignores Escape, which browsers do not count as a gesture that may start audio', () => {
    gesture('keydown', undefined, 'Escape');
    expect(useGarage.getState().soundOn).toBe(false);
    gesture('keydown');
    expect(useGarage.getState().soundOn).toBe(true);
  });

  it('stops listening after the first gesture, so a later key press never turns sound back on', () => {
    gesture('pointerup');
    useGarage.getState().setSound(false);
    gesture('keydown');
    expect(useGarage.getState().soundOn).toBe(false);
  });
});

describe('bindAudio with the Most Wanted radio', () => {
  beforeEach(() => {
    target = new EventTarget();
    Object.assign(globalThis, { window: target, localStorage: { getItem: () => 'off', setItem: () => undefined } });
    useGarage.setState({ view: SHOWROOM, soundOn: false, ownTrack: null, radioOpen: false, radio: { track: 0, status: 'loading' } });
    vi.clearAllMocks();
    bindAudio();
  });

  it('turns garage sound on when the radio opens, and stops the visitor’s own track', () => {
    useGarage.setState({ ownTrack: 'mine.mp3' });
    useGarage.getState().setRadioOpen(true);
    expect(useGarage.getState().soundOn).toBe(true);
    expect(useGarage.getState().ownTrack).toBeNull();
    expect(audio.clearOwnTrack).toHaveBeenCalled();
  });

  it('closes the radio when the visitor picks their own track', () => {
    useGarage.getState().setRadioOpen(true);
    useGarage.getState().setOwnTrack('mine.mp3');
    expect(useGarage.getState().radioOpen).toBe(false);
  });

  it('pauses the radio when sound is turned off', () => {
    useGarage.getState().setRadioOpen(true);
    useGarage.getState().setSound(false);
    expect(station.pause).toHaveBeenCalled();
  });

  it('ducks the garage ambience only while the radio is open and playing', () => {
    useGarage.getState().setRadioOpen(true);
    useGarage.getState().setRadio({ track: 0, status: 'playing' });
    expect(audio.setRadioPlaying).toHaveBeenLastCalledWith(true);
    useGarage.getState().setRadioOpen(false);
    expect(audio.setRadioPlaying).toHaveBeenLastCalledWith(false);
  });
});

describe('bindAudio with the engine', () => {
  beforeEach(() => {
    target = new EventTarget();
    Object.assign(globalThis, { window: target, localStorage: { getItem: () => 'off', setItem: () => undefined } });
    useGarage.setState({ view: SHOWROOM, soundOn: true, engine: 'off' });
    vi.clearAllMocks();
    bindAudio();
  });

  it('shows what the audio thread reports', () => {
    (audio as unknown as { onEngineStatus(status: string): void }).onEngineStatus('running');
    expect(useGarage.getState().engine).toBe('running');
  });

  it('stops the engine when sound is turned off', () => {
    useGarage.getState().setEngine('running');
    useGarage.getState().setSound(false);
    expect(useGarage.getState().engine).toBe('off');
    expect(audio.setEnabled).toHaveBeenCalledWith(false);
  });
});
