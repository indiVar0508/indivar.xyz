import { mulberry32 } from '../random';
import { p60Bytes } from '../engine/p60';
import { impulseResponse } from './noise';

export type EngineStatus = 'off' | 'starting' | 'running' | 'stopping';

/** The crate's status codes: off, cranking, running, stopping. Cranking is part of starting. */
const STATUS: readonly EngineStatus[] = ['off', 'starting', 'running', 'stopping'];

export const WORKLET_URL = `${import.meta.env.BASE_URL}wasm/p60-worklet.js`;

/**
 * The engine as the audio thread last reported it, for the tach and the animation, which read it every frame: speed,
 * load (what the throttle and idle control give it, 0 to 1), turbo boost (0 to 1), the gear (0 is neutral), the rear
 * wheels' speed on the rollers (rad/s), the torque through the clutch and the torque on the engine's mounts (N·m).
 */
export const engineLive = { rpm: 0, load: 0, boost: 0, status: 'off' as EngineStatus, gear: 0, wheel: 0, clutch: 0, mount: 0 };

type Report = { rpm: number; load: number; boost: number; status: number; gear: number; wheel: number; clutch: number; mount: number; refused?: boolean };

/** What the page hears from the audio thread besides the live values. */
export type EngineEvents = {
  status: (status: EngineStatus) => void;
  gear: (gear: number) => void;
  /** The gearbox refused a change: past 6th or neutral, or into a gear that would over-rev. */
  refused: () => void;
};

/** The P60B40's synthesized sound: p60.wasm in an AudioWorklet, with a little of the garage's reverb. */
export class EngineSound {
  private readonly node: AudioWorkletNode;
  /** False after a reset: reports already queued on the audio thread are stale until the next start. */
  private listening = true;

  private constructor(node: AudioWorkletNode, events: EngineEvents) {
    this.node = node;
    node.port.onmessage = ({ data }: MessageEvent<Report>) => {
      if (!this.listening) return;
      const status = STATUS[data.status] ?? 'off';
      engineLive.rpm = data.rpm;
      engineLive.load = data.load;
      engineLive.boost = data.boost;
      engineLive.wheel = data.wheel;
      engineLive.clutch = data.clutch;
      engineLive.mount = data.mount;
      if (status !== engineLive.status) {
        engineLive.status = status;
        events.status(status);
      }
      if (data.gear !== engineLive.gear) {
        engineLive.gear = data.gear;
        events.gear(data.gear);
      }
      if (data.refused) events.refused();
    };
  }

  static async create(ctx: AudioContext, destination: AudioNode, events: EngineEvents): Promise<EngineSound> {
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
    return new EngineSound(node, events);
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
    engineLive.load = 0;
    engineLive.boost = 0;
    engineLive.status = 'off';
    engineLive.gear = 0;
    engineLive.wheel = 0;
    engineLive.clutch = 0;
    engineLive.mount = 0;
  }

  throttle(pedal: number): void {
    this.node.port.postMessage({ type: 'throttle', value: pedal });
  }

  /** Changes up or down a gear; the gearbox may refuse. */
  shift(up: boolean): void {
    this.node.port.postMessage({ type: 'shift', value: up });
  }

  /** Fits or removes the game turbo kit. */
  turbo(fitted: boolean): void {
    this.node.port.postMessage({ type: 'turbo', value: fitted });
  }
}
