import { mulberry32 } from '../random';
import { p60Bytes } from '../engine/p60';
import { impulseResponse } from './noise';

export type EngineStatus = 'off' | 'starting' | 'running' | 'stopping';

/** The crate's status codes: off, cranking, running, stopping. Cranking is part of starting. */
const STATUS: readonly EngineStatus[] = ['off', 'starting', 'running', 'stopping'];

export const WORKLET_URL = `${import.meta.env.BASE_URL}wasm/p60-worklet.js`;

/** Engine speed as the audio thread last reported it, for the tach and the animation, which read it every frame. */
export const engineLive = { rpm: 0, status: 'off' as EngineStatus };

/** The P60B40's synthesized sound: p60.wasm in an AudioWorklet, with a little of the garage's reverb. */
export class EngineSound {
  private readonly node: AudioWorkletNode;
  /** False after a reset: reports already queued on the audio thread are stale until the next start. */
  private listening = true;

  private constructor(node: AudioWorkletNode, onStatus: (status: EngineStatus) => void) {
    this.node = node;
    node.port.onmessage = ({ data }: MessageEvent<{ rpm: number; status: number }>) => {
      if (!this.listening) return;
      const status = STATUS[data.status] ?? 'off';
      engineLive.rpm = data.rpm;
      if (status !== engineLive.status) {
        engineLive.status = status;
        onStatus(status);
      }
    };
  }

  static async create(ctx: AudioContext, destination: AudioNode, onStatus: (status: EngineStatus) => void): Promise<EngineSound> {
    const [bytes] = await Promise.all([p60Bytes(), ctx.audioWorklet.addModule(WORKLET_URL)]);
    const node = new AudioWorkletNode(ctx, 'p60-engine', {
      numberOfInputs: 0,
      outputChannelCount: [2],
      processorOptions: { bytes, seed: (Math.random() * 2 ** 31) | 1 },
    });
    const rand = mulberry32(23);
    const room = new ConvolverNode(ctx);
    const ir = ctx.createBuffer(2, Math.round(ctx.sampleRate * 1.4), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) ir.copyToChannel(impulseResponse(ir.length, 1.2, ctx.sampleRate, rand), channel);
    room.buffer = ir;
    const level = new GainNode(ctx, { gain: 0.9 });
    node.connect(level).connect(destination);
    level.connect(room).connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2500 })).connect(new GainNode(ctx, { gain: 0.16 })).connect(destination);
    return new EngineSound(node, onStatus);
  }

  start(): void {
    this.listening = true;
    this.node.port.postMessage({ type: 'start' });
  }

  stop(): void {
    this.node.port.postMessage({ type: 'stop' });
  }

  /** Stops dead, and says so at once: the audio thread can't report while its context is suspended. */
  reset(): void {
    this.listening = false;
    this.node.port.postMessage({ type: 'reset' });
    engineLive.rpm = 0;
    engineLive.status = 'off';
  }

  throttle(pedal: number): void {
    this.node.port.postMessage({ type: 'throttle', value: pedal });
  }
}
