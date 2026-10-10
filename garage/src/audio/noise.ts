export function brownNoise(length: number, rand: () => number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return out;
}

/** Exponentially decaying noise: reaches -60 dB at `decaySeconds`. */
export function impulseResponse(length: number, decaySeconds: number, sampleRate: number, rand: () => number): Float32Array<ArrayBuffer> {
  const tau = decaySeconds / 6.9;
  return Float32Array.from({ length }, (_, i) => (rand() * 2 - 1) * Math.exp(-i / sampleRate / tau));
}
