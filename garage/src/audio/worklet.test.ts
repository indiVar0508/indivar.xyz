import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = resolve(import.meta.dirname, '../../public/wasm');

type Port = { onmessage: ((event: { data: unknown }) => void) | null; posted: unknown[]; postMessage(data: unknown): void };
type Processor = { port: Port; process(inputs: unknown[], outputs: Float32Array[][]): boolean };

/** Runs p60-worklet.js the way an AudioWorkletGlobalScope would, and returns its processor. */
function loadProcessor(): Processor {
  let Registered: (new (options: unknown) => Processor) | undefined;
  class AudioWorkletProcessor {
    port: Port = { onmessage: null, posted: [], postMessage(data) { this.posted.push(data); } };
  }
  const register = (name: string, processor: typeof Registered) => {
    expect(name).toBe('p60-engine');
    Registered = processor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', readFileSync(`${PUBLIC}/p60-worklet.js`, 'utf8'))(AudioWorkletProcessor, register, 48_000);
  const bytes = readFileSync(`${PUBLIC}/p60.wasm`);
  return new Registered!({ processorOptions: { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), seed: 9 } });
}

function render(processor: Processor, seconds: number): { peak: number; outputs: Float32Array[] } {
  const outputs = [new Float32Array(128), new Float32Array(128)];
  let peak = 0;
  for (let block = 0; block < (seconds * 48_000) / 128; block++) {
    expect(processor.process([], [outputs])).toBe(true);
    for (const v of outputs[0]!) peak = Math.max(peak, Math.abs(v));
  }
  return { peak, outputs };
}

describe('p60-worklet.js', () => {
  it('is silent and quiet on the port until started', () => {
    const processor = loadProcessor();
    expect(render(processor, 0.2).peak).toBe(0);
    expect(processor.port.posted).toEqual([]);
  });

  it('starts, runs and reports engine speed, then revs on the throttle', () => {
    const processor = loadProcessor();
    processor.port.onmessage!({ data: { type: 'start' } });
    const { peak } = render(processor, 3);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(1);
    const last = () => processor.port.posted.at(-1) as { rpm: number; status: number };
    expect(processor.port.posted).toContainEqual(expect.objectContaining({ status: 1 }));
    expect(last().status).toBe(2);
    expect(last().rpm).toBeGreaterThan(1200);
    processor.port.onmessage!({ data: { type: 'throttle', value: 1 } });
    render(processor, 0.8);
    expect(last().rpm).toBeGreaterThan(7000);
  });

  it('renders a render quantum larger than the crate block in pieces', () => {
    const processor = loadProcessor();
    processor.port.onmessage!({ data: { type: 'start' } });
    const outputs = [new Float32Array(2048), new Float32Array(2048)];
    for (let i = 0; i < 60; i++) processor.process([], [outputs]);
    expect(outputs[1]!.slice(1024).some((v) => v !== 0)).toBe(true);
  });
});
