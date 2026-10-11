/** A song and the YouTube uploads that carry it, best first: later ids are fallbacks for when one is refused. */
export type Track = { artist: string; title: string; ids: readonly string[] };

/** Which song and which of its uploads is playing, and how many uploads have failed in a row. */
export type Cursor = { track: number; candidate: number; failures: number };

export const START: Cursor = { track: 0, candidate: 0, failures: 0 };

export const videoId = (tracks: readonly Track[], cursor: Cursor): string => tracks[cursor.track]!.ids[cursor.candidate]!;

const wrap = (index: number, length: number) => ((index % length) + length) % length;

export const next = (tracks: readonly Track[], cursor: Cursor): Cursor => ({ ...cursor, track: wrap(cursor.track + 1, tracks.length), candidate: 0 });

export const previous = (tracks: readonly Track[], cursor: Cursor): Cursor => ({ ...cursor, track: wrap(cursor.track - 1, tracks.length), candidate: 0 });

/** The upload is playing, so whatever failed before it was a one-off. */
export const played = (cursor: Cursor): Cursor => ({ ...cursor, failures: 0 });

/**
 * YouTube refused the current upload: try the song's next upload, then the next song. Returns null once every
 * upload in the list has failed in a row, which means YouTube itself is unreachable or blocked.
 */
export function failed(tracks: readonly Track[], cursor: Cursor): Cursor | null {
  const failures = cursor.failures + 1;
  if (failures >= tracks.reduce((sum, track) => sum + track.ids.length, 0)) return null;
  if (cursor.candidate + 1 < tracks[cursor.track]!.ids.length) return { ...cursor, candidate: cursor.candidate + 1, failures };
  return { ...next(tracks, cursor), failures };
}
