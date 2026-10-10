import { mulberry32 } from '../random';

/** The hood latch: a resonant noise thud with a low body. */
export function hoodClunk(ctx: AudioContext, out: AudioNode): void {
  const now = ctx.currentTime;
  const rand = mulberry32(5);
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.12), ctx.sampleRate);
  buffer.copyToChannel(Float32Array.from({ length: buffer.length }, () => rand() * 2 - 1), 0);
  const burst = new AudioBufferSourceNode(ctx, { buffer });
  const body = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 6 });
  const envelope = new GainNode(ctx, { gain: 0.9 });
  envelope.gain.setValueAtTime(0.9, now);
  envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  burst.connect(body).connect(envelope).connect(out);
  burst.start(now);

  const thump = new OscillatorNode(ctx, { type: 'sine', frequency: 70 });
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.18);
  const thumpGain = new GainNode(ctx, { gain: 0.7 });
  thumpGain.gain.setValueAtTime(0.7, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  thump.connect(thumpGain).connect(out);
  thump.start(now);
  thump.stop(now + 0.25);
}

export function uiTick(ctx: AudioContext, out: AudioNode): void {
  const now = ctx.currentTime;
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 1800 });
  const gain = new GainNode(ctx, { gain: 0.05 });
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(gain).connect(out);
  osc.start(now);
  osc.stop(now + 0.05);
}
