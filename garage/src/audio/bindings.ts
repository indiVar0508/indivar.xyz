import { station } from '../music/station';
import { useGarage, type GarageStore } from '../state/store';
import { isHoodOpen } from '../state/view';
import { audio } from './controller';
import { readSoundPref, writeSoundPref } from './prefs';

const radioPlaying = (state: GarageStore) => state.radioOpen && state.radio.status === 'playing';

/** Connects the store to the audio controller and the radio. Call once at startup. */
export function bindAudio(): void {
  useGarage.subscribe((state, previous) => {
    const { setSound, setOwnTrack, setRadioOpen } = useGarage.getState();
    if (state.soundOn !== previous.soundOn) {
      writeSoundPref(state.soundOn);
      void audio.setEnabled(state.soundOn);
      if (!state.soundOn && state.radioOpen) station.pause();
    }
    if (state.soundOn && isHoodOpen(state.view) !== isHoodOpen(previous.view)) audio.sfx('hood');
    // One music source at a time: the radio and the visitor's own track replace each other.
    if (state.radioOpen && !previous.radioOpen) {
      if (state.ownTrack) {
        audio.clearOwnTrack();
        setOwnTrack(null);
      }
      if (!state.soundOn) setSound(true);
    }
    if (state.ownTrack && state.ownTrack !== previous.ownTrack && state.radioOpen) setRadioOpen(false);
    if (radioPlaying(state) !== radioPlaying(previous)) audio.setRadioPlaying(radioPlaying(state));
  });
  if (readSoundPref()) {
    // Browsers block audio until a gesture, so a remembered "on" waits for the first one, then stops listening.
    // pointerup (not pointerdown) is the gesture that counts on touch screens; Escape never counts.
    // A gesture on the sound button is left to the button, which would otherwise toggle straight back off.
    const firstGesture = new AbortController();
    const resume = (event: Event) => {
      if ((event as KeyboardEvent).key === 'Escape') return;
      firstGesture.abort();
      const target = event.target as Partial<Element> | null;
      if (!target?.closest?.('[data-sound-toggle]')) useGarage.getState().setSound(true);
    };
    window.addEventListener('pointerup', resume, { signal: firstGesture.signal });
    window.addEventListener('keydown', resume, { signal: firstGesture.signal });
  }
}
