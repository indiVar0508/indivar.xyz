// The P60B40's sound, on the audio thread. The page passes in p60.wasm's bytes and sends commands; each block is
// rendered into wasm memory and copied out. Engine speed, load, boost, the gear, the wheels' speed on the rollers and
// the clutch's torque are reported back about 45 times a second, while anything turns.
// Plain JavaScript: an AudioWorklet module is loaded by URL, outside the app's bundle.

const REPORT_EVERY = 8; // blocks of 128 frames
const COMMANDS = {
  start: (wasm) => wasm.synth_start(),
  stop: (wasm) => wasm.synth_stop(),
  reset: (wasm) => wasm.synth_reset(),
  throttle: (wasm, value) => wasm.synth_set_throttle(value),
  turbo: (wasm, value) => wasm.synth_set_turbo(value ? 1 : 0),
  // A refused change is reported at once, so the page can say why.
  shift: (wasm, up, processor) => {
    if (!wasm.synth_shift(up ? 1 : 0)) processor.report({ refused: true });
  },
};

class P60Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { bytes, seed } = options.processorOptions;
    this.wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
    this.wasm.synth_init(sampleRate, seed);
    this.stride = this.wasm.synth_max_frames();
    this.heap = new Float32Array(this.wasm.memory.buffer);
    this.status = 0;
    this.gear = 0;
    this.turning = false;
    this.blocks = 0;
    this.port.onmessage = ({ data }) => COMMANDS[data.type]?.(this.wasm, data.value, this);
  }

  report(extra) {
    const wasm = this.wasm;
    this.port.postMessage({
      rpm: wasm.synth_rpm(),
      load: wasm.synth_load(),
      boost: wasm.synth_boost(),
      status: this.status,
      gear: this.gear,
      wheel: wasm.synth_wheel(),
      clutch: wasm.synth_clutch(),
      ...extra,
    });
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    for (let done = 0; done < left.length; ) {
      const frames = Math.min(left.length - done, this.stride);
      const at = this.wasm.synth_render(frames) / 4;
      if (this.heap.buffer !== this.wasm.memory.buffer) this.heap = new Float32Array(this.wasm.memory.buffer);
      left.set(this.heap.subarray(at, at + frames), done);
      right?.set(this.heap.subarray(at + this.stride, at + this.stride + frames), done);
      done += frames;
    }
    const status = this.wasm.synth_status();
    const gear = this.wasm.synth_gear();
    // Keep reporting until the engine and the rollers have both stopped, and once more after.
    const turning = status !== 0 || this.wasm.synth_wheel() > 0;
    if (status !== this.status || gear !== this.gear || turning !== this.turning || (turning && ++this.blocks % REPORT_EVERY === 0)) {
      this.status = status;
      this.gear = gear;
      this.turning = turning;
      this.report();
    }
    return true;
  }
}

registerProcessor('p60-engine', P60Processor);
