import type { PlayerFactory } from './radio';

// Just the parts of the YouTube IFrame Player API the radio uses.
type YTPlayer = { playVideo(): void; pauseVideo(): void; loadVideoById(id: string): void; destroy(): void };
type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      host: string;
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, string | number>;
      events: { onReady(event: { target: YTPlayer }): void; onStateChange(event: { data: number }): void; onError(event: { data: number }): void };
    },
  ) => YTPlayer;
};
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const API_URL = 'https://www.youtube.com/iframe_api';
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const READY_TIMEOUT_MS = 20_000;

let api: Promise<YTNamespace> | undefined;

/** Loads YouTube's player API once, on first use, so the garage makes no YouTube request until the radio opens. */
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      api = undefined; // a blocker or a dropped connection; let the next open try again
      script.remove();
      reject(new Error('YouTube’s player did not load'));
    };
    document.head.append(script);
  });
  return api;
}

/** A YouTube player from the privacy-enhanced (no-cookie) host, filling `container`. */
export const youtubePlayer: PlayerFactory = async (container, videoId, events) => {
  const YT = await loadApi();
  const mount = document.createElement('div');
  container.replaceChildren(mount);
  return new Promise((resolve, reject) => {
    const stalled = setTimeout(() => reject(new Error('YouTube’s player never became ready')), READY_TIMEOUT_MS);
    new YT.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      width: '100%',
      height: '100%',
      videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: ({ target }) => {
          clearTimeout(stalled);
          target.playVideo();
          resolve({ load: (id) => target.loadVideoById(id), pause: () => target.pauseVideo(), destroy: () => target.destroy() });
        },
        onStateChange: ({ data }) => {
          if (data === ENDED) events.onEnded();
          else if (data === PLAYING) events.onPlaying();
          else if (data === PAUSED) events.onPaused();
        },
        onError: ({ data }) => events.onError(data),
      },
    });
  });
};
