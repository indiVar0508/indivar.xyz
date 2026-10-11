import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarage } from '../state/store';
import { SHOWROOM } from '../state/view';
import { bindAudio } from './bindings';

vi.mock('./controller', () => ({ audio: { setEnabled: vi.fn(async () => undefined), sfx: vi.fn() } }));

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
