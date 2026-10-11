// The P60B40's sound, on the audio thread. The page passes in p60.wasm's bytes and sends commands; each block is
// rendered into wasm memory and copied out, and engine speed is reported back about 45 times a second.
// Plain JavaScript: an AudioWorklet module is loaded by URL, outside the app's bundle.

const REPORT_EVERY = 8; // blocks of 128 frames
const COMMANDS = {
  start: (wasm) => wasm.synth_start(),
  stop: (wasm) => wasm.synth_stop(),
  reset: (wasm) => wasm.synth_reset(),
  throttle: (wasm, value) => wasm.synth_set_throttle(value),
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
    this.blocks = 0;
    this.port.onmessage = ({ data }) => COMMANDS[data.type]?.(this.wasm, data.value);
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
    if (status !== this.status || (status !== 0 && ++this.blocks % REPORT_EVERY === 0)) {
      this.status = status;
      this.port.postMessage({ rpm: this.wasm.synth_rpm(), status });
    }
    return true;
  }
}

registerProcessor('p60-engine', P60Processor);
