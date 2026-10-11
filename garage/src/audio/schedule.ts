export const midiToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** An original, slow progression in D minor: Dm(add9), B♭maj7, Gm7, A7sus4. No melody, no quotation. */
export const CHORDS: readonly (readonly number[])[] = [
  [50, 57, 62, 64, 65],
  [46, 53, 57, 62, 65],
  [43, 50, 58, 62, 65],
  [45, 52, 57, 62, 67],
];
export const BAR_SECONDS = 8;
export const chordAt = (seconds: number): readonly number[] => CHORDS[Math.floor(seconds / BAR_SECONDS) % CHORDS.length]!;

/** Ambience gain while the visitor's own track plays. */
export const duckLevel = (musicPlaying: boolean): number => (musicPlaying ? 0.2 : 1);

/** Slow 0..1 swell for distant traffic. */
export const swell = (seconds: number, period = 23): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / period);

/** Fluorescent tubes on 50 Hz mains hum at twice the line frequency, plus harmonics. */
export const HUM_HZ = [100, 200, 300] as const;
