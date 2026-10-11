import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { station } from '../music/station';
import { TRACKS, YOUTUBE_FALLBACK_URL } from '../music/tracks';
import { useGarage } from '../state/store';

/**
 * The Most Wanted radio: YouTube's player plus the song and skip buttons. YouTube's embed rules ask for a visible
 * player of at least 200 × 200 px with nothing in front of it, so the dock is portalled to <body> and stacks above
 * the HUD and the credits.
 */
export function RadioDock() {
  const open = useGarage((state) => state.radioOpen);
  const { track, status } = useGarage((state) => state.radio);
  const mount = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || !mount.current) return;
    void station.start(mount.current);
    return () => station.stop();
  }, [open]);

  // On a phone the dock covers the top of the canvas, so the camera frames its subject in the space below it.
  useLayoutEffect(() => {
    if (!open || !dock.current) return;
    const { setCoveredTop } = useGarage.getState();
    const measure = () => setCoveredTop(matchMedia('(max-width: 720px)').matches ? dock.current!.getBoundingClientRect().bottom : 0);
    const observer = new ResizeObserver(measure);
    observer.observe(dock.current);
    return () => {
      observer.disconnect();
      setCoveredTop(0);
    };
  }, [open]);

  if (!open) return null;
  const song = TRACKS[track]!;
  return createPortal(
    <section ref={dock} className="radio" aria-label="Most Wanted radio">
      <div className="radio-head">
        <p className="radio-now" role="status">
          <span className="radio-eyebrow">
            Most Wanted radio · {track + 1}/{TRACKS.length}
          </span>
          {status === 'unavailable' ? (
            <span className="radio-note">
              YouTube’s player didn’t load.{' '}
              <a href={YOUTUBE_FALLBACK_URL} target="_blank" rel="noopener">
                Play the list on YouTube
              </a>
            </span>
          ) : (
            <span className="radio-song">
              {song.title} <span className="radio-artist">· {song.artist}</span>
            </span>
          )}
        </p>
        <button type="button" className="radio-icon" aria-label="Previous song" onClick={() => station.previous()}>
          ⏮
        </button>
        <button type="button" className="radio-icon" aria-label="Next song" onClick={() => station.next()}>
          ⏭
        </button>
        <button type="button" className="radio-icon" aria-label="Close the radio" onClick={() => useGarage.getState().setRadioOpen(false)}>
          ×
        </button>
      </div>
      <div className="radio-player" ref={mount} />
    </section>,
    document.body,
  );
}
