/**
 * p60.wasm, the engine's own Rust crate (crates/p60): the P60B40's timing and kinematics, and its synthesized sound.
 * The same bytes run twice: in an AudioWorklet for the sound (audio/engineSound.ts) and here for the moving parts.
 */

export const P60_WASM_URL = `${import.meta.env.BASE_URL}wasm/p60.wasm`;

export type P60Exports = {
  memory: WebAssembly.Memory;
  kin_update(crank: number): number;
  kin_len(): number;
  p60_fire_angle(cylinder: number): number;
  p60_valve_centre(cylinder: number, exhaust: number): number;
  p60_bank_angle(cylinder: number): number;
  p60_pin_phase(cylinder: number): number;
  p60_constant(id: number): number;
};

/** Indexes for `p60_constant`. */
export const P60_CONSTANT = { crankRadius: 0, rodLength: 1, compressionHeight: 2, valveLift: 3, valveDuration: 4, camBaseRadius: 5, idleRpm: 6, limitRpm: 7 } as const;

/** Where each value sits in a kinematics frame. Cylinder indexes are 0–7 for cylinders 1–8. */
export const FRAME = {
  crank: 0,
  cam: 1,
  piston: (i: number) => 2 + i * 4,
  pinX: (i: number) => 3 + i * 4,
  pinY: (i: number) => 4 + i * 4,
  rod: (i: number) => 5 + i * 4,
  intakeLift: (i: number) => 34 + i * 2,
  exhaustLift: (i: number) => 35 + i * 2,
  glow: (i: number) => 50 + i,
  length: 58,
} as const;

let bytes: Promise<ArrayBuffer> | null = null;

/** The wasm file, fetched once. A failed fetch is forgotten, so the next caller tries again. */
export function p60Bytes(): Promise<ArrayBuffer> {
  bytes ??= fetch(P60_WASM_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`p60.wasm: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      bytes = null;
      throw error;
    });
  return bytes;
}

export async function instantiateP60(source: BufferSource): Promise<P60Exports> {
  const { instance } = await WebAssembly.instantiate(source, {});
  return instance.exports as unknown as P60Exports;
}

/** Kinematics frames for the moving parts, computed by the crate. */
export class Kinematics {
  readonly fireAngles: number[];
  private readonly wasm: P60Exports;
  private view: Float32Array | null = null;

  constructor(wasm: P60Exports) {
    if (wasm.kin_len() !== FRAME.length) throw new Error(`p60.wasm frames hold ${wasm.kin_len()} values, not ${FRAME.length}`);
    this.wasm = wasm;
    this.fireAngles = Array.from({ length: 8 }, (_, i) => wasm.p60_fire_angle(i + 1));
  }

  /** The frame for a crank angle in degrees. The view is reused by the next call. */
  frame(crank: number): Float32Array {
    const at = this.wasm.kin_update(crank);
    if (this.view?.buffer !== this.wasm.memory.buffer || this.view.byteOffset !== at) this.view = new Float32Array(this.wasm.memory.buffer, at, FRAME.length);
    return this.view;
  }

  /** The cylinder that fired most recently at this crank angle (1–8). */
  firing(crank: number): number {
    let best = 0;
    let since = Infinity;
    this.fireAngles.forEach((angle, i) => {
      const d = (((crank - angle) % 720) + 720) % 720;
      if (d < since) [best, since] = [i, d];
    });
    return best + 1;
  }
}

let kinematics: Promise<Kinematics> | null = null;

export function loadKinematics(): Promise<Kinematics> {
  kinematics ??= p60Bytes()
    .then(instantiateP60)
    .then((wasm) => new Kinematics(wasm))
    .catch((error: unknown) => {
      kinematics = null;
      throw error;
    });
  return kinematics;
}
