import { describe, expect, it } from 'vitest';
import { TRACKS } from './tracks';

describe('the Most Wanted soundtrack', () => {
  it('opens with I Am Rock', () => {
    expect(TRACKS[0]).toMatchObject({ artist: 'Rock', title: 'I Am Rock' });
  });

  it('pins every song to well-formed, unique YouTube ids', () => {
    const ids = TRACKS.flatMap((track) => track.ids);
    for (const id of ids) expect(id).toMatch(/^[\w-]{11}$/);
    expect(new Set(ids).size).toBe(ids.length);
    for (const track of TRACKS) expect(track.ids.length).toBeGreaterThan(0);
  });

  it('leaves out EA’s own score', () => {
    expect(TRACKS.map((track) => track.artist).join()).not.toMatch(/Linford|Vrenna/);
  });
});
