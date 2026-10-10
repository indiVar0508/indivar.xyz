import { useRef } from 'react';
import { audio } from '../audio/controller';
import { useGarage } from '../state/store';

export function SoundControls() {
  const soundOn = useGarage((state) => state.soundOn);
  const ownTrack = useGarage((state) => state.ownTrack);
  const trackError = useGarage((state) => state.trackError);
  const { setSound, setOwnTrack, setTrackError } = useGarage.getState();
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    setTrackError(null);
    setSound(true);
    try {
      await audio.playOwnTrack(file);
      setOwnTrack(file.name);
    } catch {
      setOwnTrack(null);
      setTrackError(`Couldn’t play “${file.name}”. Try an MP3, M4A, OGG or WAV file.`);
    }
  };

  return (
    <>
      <button type="button" className="hud-button" data-sound-toggle aria-pressed={soundOn} onClick={() => setSound(!soundOn)}>
        {soundOn ? 'Sound on' : 'Sound off'}
      </button>
      <button type="button" className="hud-button" onClick={() => input.current?.click()}>
        {ownTrack ? 'Change track' : 'Play my own track'}
      </button>
      {ownTrack && (
        <button type="button" className="hud-button" onClick={() => { audio.clearOwnTrack(); setOwnTrack(null); }}>
          Stop my track
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void pick(file);
        }}
      />
      <p className="sound-status" role="status">
        {trackError ?? (ownTrack ? `Playing ${ownTrack} from this device. It is not uploaded.` : '')}
      </p>
    </>
  );
}
