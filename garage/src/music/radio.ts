import { failed, next, played, previous, START, videoId, type Cursor, type Track } from './playlist';

export type PlayerEvents = { onPlaying(): void; onPaused(): void; onEnded(): void; onError(code: number): void };
export type Player = { load(videoId: string): void; pause(): void; destroy(): void };
/** Puts a player in `container`, cued to `videoId`, and resolves once it is ready for commands. */
export type PlayerFactory = (container: HTMLElement, videoId: string, events: PlayerEvents) => Promise<Player>;

export type RadioStatus = 'loading' | 'playing' | 'paused' | 'unavailable';
export type RadioState = { track: number; status: RadioStatus };

/**
 * Plays `tracks` in order through one embedded player: the next song when one ends, a fallback upload when one is
 * refused. Each start() is a session; stop() ends it, and anything an old session's player says is ignored.
 */
export function createRadio(tracks: readonly Track[], factory: PlayerFactory, onChange: (state: RadioState) => void) {
  let cursor: Cursor = START;
  let player: Player | null = null;
  let session = 0;

  const report = (status: RadioStatus) => onChange({ track: cursor.track, status });
  const play = () => {
    report('loading');
    player?.load(videoId(tracks, cursor));
  };

  const eventsFor = (id: number): PlayerEvents => {
    const live = () => id === session;
    return {
      onPlaying: () => {
        if (!live()) return;
        cursor = played(cursor);
        report('playing');
      },
      onPaused: () => live() && report('paused'),
      onEnded: () => {
        if (!live()) return;
        cursor = next(tracks, cursor);
        play();
      },
      onError: () => {
        if (!live()) return;
        const fallback = failed(tracks, cursor);
        if (!fallback) return report('unavailable');
        cursor = fallback;
        play();
      },
    };
  };

  return {
    async start(container: HTMLElement): Promise<void> {
      const id = ++session;
      cursor = START;
      report('loading');
      try {
        const created = await factory(container, videoId(tracks, cursor), eventsFor(id));
        if (id === session) player = created;
        else created.destroy();
      } catch {
        if (id === session) report('unavailable');
      }
    },
    stop(): void {
      session++;
      player?.destroy();
      player = null;
    },
    next(): void {
      cursor = next(tracks, cursor);
      play();
    },
    previous(): void {
      cursor = previous(tracks, cursor);
      play();
    },
    pause(): void {
      player?.pause();
    },
  };
}

export type Radio = ReturnType<typeof createRadio>;
