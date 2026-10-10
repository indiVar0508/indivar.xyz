import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarage } from '../state/store';
import { SHOWROOM } from '../state/view';
import { bindAudio } from './bindings';

vi.mock('./controller', () => ({ audio: { setEnabled: vi.fn(async () => undefined), sfx: vi.fn() } }));

let target: EventTarget;
const gesture = (type: 'pointerdown' | 'keydown', on?: { closest: (selector: string) => unknown }) => {
  const event = new Event(type);
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
    gesture('pointerdown');
    expect(useGarage.getState().soundOn).toBe(true);
  });

  it('leaves a gesture on the sound button to the button, so it does not toggle twice', () => {
    gesture('pointerdown', soundButton);
    expect(useGarage.getState().soundOn).toBe(false);
  });

  it('stops listening after the first gesture, so a later key press never turns sound back on', () => {
    gesture('pointerdown');
    useGarage.getState().setSound(false);
    gesture('keydown');
    expect(useGarage.getState().soundOn).toBe(false);
  });
});
