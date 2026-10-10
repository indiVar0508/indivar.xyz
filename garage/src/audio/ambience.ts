import { mulberry32 } from '../random';
import { brownNoise, impulseResponse } from './noise';
import { BAR_SECONDS, chordAt, duckLevel, HUM_HZ, midiToHz, swell } from './schedule';

const LEVEL = 0.9;
const LOOKAHEAD_SECONDS = 1.5;

/** The garage's room tone, tube hum, distant traffic, and a slow dark pad. Synthesized live. */
export class Ambience {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly pad: GainNode;
  private readonly traffic: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextBar = 0;
  private startedAt = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = new GainNode(ctx, { gain: 0 });
    this.out.connect(destination);
    this.pad = new GainNode(ctx, { gain: 0.08 });
    this.traffic = new GainNode(ctx, { gain: 0.02 });
  }

  start(): void {
    const { ctx } = this;
    const now = ctx.currentTime;
    const rand = mulberry32(11);
    this.startedAt = now;
    this.nextBar = now + 0.1;
    this.out.gain.setTargetAtTime(LEVEL, now, 1.2);

    const room = this.loop(brownNoise(ctx.sampleRate * 4, rand));
    room.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 })).connect(new GainNode(ctx, { gain: 0.22 })).connect(this.out);

    HUM_HZ.forEach((frequency, i) => {
      const hum = new OscillatorNode(ctx, { frequency });
      hum.connect(new GainNode(ctx, { gain: [0.01, 0.004, 0.0015][i] })).connect(this.out);
      hum.start(now);
      this.sources.push(hum);
    });

    const road = this.loop(brownNoise(ctx.sampleRate * 6, rand));
    road.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 520 })).connect(this.traffic).connect(this.out);

    const reverb = new ConvolverNode(ctx);
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) ir.copyToChannel(impulseResponse(ir.length, 2.8, ctx.sampleRate, rand), channel);
    reverb.buffer = ir;
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.7 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.05 });
    lfo.connect(new GainNode(ctx, { gain: 250 })).connect(tone.frequency);
    lfo.start(now);
    this.sources.push(lfo);
    this.pad.connect(tone);
    tone.connect(this.out);
    tone.connect(reverb).connect(new GainNode(ctx, { gain: 0.6 })).connect(this.out);

    this.timer = setInterval(() => this.tick(), 500);
    this.tick();
  }

  stop(): void {
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, 0.25);
    for (const source of this.sources) source.stop(now + 1.2);
    this.sources.length = 0;
    setTimeout(() => this.out.disconnect(), 1500);
  }

  setDuck(ownTrackPlaying: boolean): void {
    this.out.gain.setTargetAtTime(LEVEL * duckLevel(ownTrackPlaying), this.ctx.currentTime, 0.4);
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    this.traffic.gain.setTargetAtTime(0.02 + 0.09 * swell(now - this.startedAt), now, 0.8);
    while (this.nextBar < now + LOOKAHEAD_SECONDS) {
      this.scheduleBar(this.nextBar, chordAt(this.nextBar - this.startedAt));
      this.nextBar += BAR_SECONDS;
    }
  }

  private scheduleBar(at: number, chord: readonly number[]): void {
    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const osc = new OscillatorNode(this.ctx, { type: 'sawtooth', frequency: midiToHz(note), detune });
        const envelope = new GainNode(this.ctx, { gain: 0 });
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(0.06, at + 3);
        envelope.gain.setValueAtTime(0.06, at + BAR_SECONDS - 1);
        envelope.gain.linearRampToValueAtTime(0, at + BAR_SECONDS + 2);
        osc.connect(envelope).connect(this.pad);
        osc.start(at);
        osc.stop(at + BAR_SECONDS + 2.1);
        osc.onended = () => envelope.disconnect();
      }
    }
  }

  private loop(samples: Float32Array<ArrayBuffer>): AudioBufferSourceNode {
    const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
    source.start(this.ctx.currentTime);
    this.sources.push(source);
    return source;
  }
}
