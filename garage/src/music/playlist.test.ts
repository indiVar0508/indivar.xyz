import { describe, expect, it } from 'vitest';
import { failed, next, played, previous, START, videoId, type Track } from './playlist';

const tracks: Track[] = [
  { artist: 'A', title: 'One', ids: ['a1', 'a2'] },
  { artist: 'B', title: 'Two', ids: ['b1'] },
  { artist: 'C', title: 'Three', ids: ['c1'] },
];

describe('playlist', () => {
  it('starts on the first song’s first upload', () => {
    expect(videoId(tracks, START)).toBe('a1');
  });

  it('steps forward and back through the songs, wrapping at both ends', () => {
    expect(videoId(tracks, next(tracks, START))).toBe('b1');
    expect(videoId(tracks, previous(tracks, START))).toBe('c1');
    expect(next(tracks, next(tracks, next(tracks, START))).track).toBe(0);
  });

  it('tries a song’s other uploads before moving on when YouTube refuses one', () => {
    const fallback = failed(tracks, START)!;
    expect(videoId(tracks, fallback)).toBe('a2');
    expect(videoId(tracks, failed(tracks, fallback)!)).toBe('b1');
  });

  it('starts the next song from its first upload, even after a fallback', () => {
    expect(videoId(tracks, next(tracks, failed(tracks, START)!))).toBe('b1');
    expect(next(tracks, failed(tracks, START)!).candidate).toBe(0);
  });

  it('gives up once every upload has failed in a row, but a song that plays resets the count', () => {
    let cursor = START;
    for (let i = 0; i < 3; i++) cursor = failed(tracks, cursor)!;
    expect(videoId(tracks, cursor)).toBe('c1');
    expect(failed(tracks, cursor)).toBeNull();

    cursor = played(failed(tracks, failed(tracks, START)!)!);
    expect(failed(tracks, cursor)).not.toBeNull();
  });
});
