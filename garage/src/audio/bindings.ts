import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { audio } from './controller';
import { readSoundPref, writeSoundPref } from './prefs';

/** Connects the store to the audio controller. Call once at startup. */
export function bindAudio(): void {
  useGarage.subscribe((state, previous) => {
    if (state.soundOn !== previous.soundOn) {
      writeSoundPref(state.soundOn);
      void audio.setEnabled(state.soundOn);
    }
    if (state.soundOn && isHoodOpen(state.view) !== isHoodOpen(previous.view)) audio.sfx('hood');
  });
  if (readSoundPref()) {
    // Browsers block audio until a gesture, so a remembered "on" waits for the first one, then stops listening.
    // A gesture on the sound button is left to the button, which would otherwise toggle straight back off.
    const firstGesture = new AbortController();
    const resume = (event: Event) => {
      firstGesture.abort();
      const target = event.target as Partial<Element> | null;
      if (!target?.closest?.('[data-sound-toggle]')) useGarage.getState().setSound(true);
    };
    window.addEventListener('pointerdown', resume, { signal: firstGesture.signal });
    window.addEventListener('keydown', resume, { signal: firstGesture.signal });
  }
}
