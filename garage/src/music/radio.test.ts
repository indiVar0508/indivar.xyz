import { describe, expect, it } from 'vitest';
import type { Track } from './playlist';
import { createRadio, type Player, type PlayerEvents, type PlayerFactory, type RadioState } from './radio';

const tracks: Track[] = [
  { artist: 'A', title: 'One', ids: ['a1', 'a2'] },
  { artist: 'B', title: 'Two', ids: ['b1'] },
];

function fakeYouTube() {
  const players: (Player & { events: PlayerEvents; loaded: string[]; destroyed: boolean; paused: boolean })[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const factory: PlayerFactory = (_container, videoId, events) =>
    new Promise((resolve) => {
      const player = {
        events,
        loaded: [videoId],
        destroyed: false,
        paused: false,
        load(id: string) { player.loaded.push(id); },
        pause() { player.paused = true; },
        destroy() { player.destroyed = true; },
      };
      players.push(player);
      if (hold) release = () => resolve(player);
      else resolve(player);
    });
  return { factory, players, holdNext: () => { hold = true; }, release: () => release?.() };
}

const setup = (factory: PlayerFactory) => {
  const states: RadioState[] = [];
  const radio = createRadio(tracks, factory, (state) => states.push(state));
  return { radio, states, last: () => states.at(-1) };
};
const container = {} as HTMLElement;

describe('createRadio', () => {
  it('opens on the first song and reports when it plays', async () => {
    const yt = fakeYouTube();
    const { radio, last } = setup(yt.factory);
    await radio.start(container);
    expect(yt.players[0]!.loaded).toEqual(['a1']);
    expect(last()).toEqual({ track: 0, status: 'loading' });
    yt.players[0]!.events.onPlaying();
    expect(last()).toEqual({ track: 0, status: 'playing' });
  });

  it('plays the next song when one ends, and steps with next and previous', async () => {
    const yt = fakeYouTube();
    const { radio, last } = setup(yt.factory);
    await radio.start(container);
    yt.players[0]!.events.onEnded();
    expect(yt.players[0]!.loaded.at(-1)).toBe('b1');
    expect(last()).toEqual({ track: 1, status: 'loading' });
    radio.previous();
    expect(yt.players[0]!.loaded.at(-1)).toBe('a1');
    radio.next();
    expect(yt.players[0]!.loaded.at(-1)).toBe('b1');
  });

  it('falls back through refused uploads, and says so when none will play', async () => {
    const yt = fakeYouTube();
    const { radio, last } = setup(yt.factory);
    await radio.start(container);
    const player = yt.players[0]!;
    player.events.onError(150);
    expect(player.loaded.at(-1)).toBe('a2');
    player.events.onError(150);
    expect(player.loaded.at(-1)).toBe('b1');
    player.events.onError(150);
    expect(last()?.status).toBe('unavailable');
    expect(player.loaded).toHaveLength(3);
  });

  it('reports unavailable when YouTube’s player can’t load at all', async () => {
    const { radio, last } = setup(() => Promise.reject(new Error('blocked')));
    await radio.start(container);
    expect(last()?.status).toBe('unavailable');
  });

  it('pauses, and on stop destroys the player and ignores anything it says afterwards', async () => {
    const yt = fakeYouTube();
    const { radio, states } = setup(yt.factory);
    await radio.start(container);
    radio.pause();
    expect(yt.players[0]!.paused).toBe(true);
    radio.stop();
    expect(yt.players[0]!.destroyed).toBe(true);
    const count = states.length;
    yt.players[0]!.events.onPlaying();
    yt.players[0]!.events.onEnded();
    expect(states).toHaveLength(count);
  });

  it('destroys a player that finishes loading after the radio was closed', async () => {
    const yt = fakeYouTube();
    yt.holdNext();
    const { radio } = setup(yt.factory);
    const starting = radio.start(container);
    radio.stop();
    yt.release();
    await starting;
    expect(yt.players[0]!.destroyed).toBe(true);
  });

  it('starts again from the first song after a stop', async () => {
    const yt = fakeYouTube();
    const { radio } = setup(yt.factory);
    await radio.start(container);
    radio.next();
    radio.stop();
    await radio.start(container);
    expect(yt.players[1]!.loaded).toEqual(['a1']);
  });
});
