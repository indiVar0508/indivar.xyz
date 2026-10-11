import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { HASH_FILE, wasmSourceHash } from '../../tools/wasm-source';
import { cylinderLayout, P60 } from './geometry';
import { FRAME, instantiateP60, Kinematics, P60_CONSTANT, type P60Exports } from './p60';

const WASM = resolve(import.meta.dirname, '../../public/wasm/p60.wasm');
let wasm: P60Exports;
let kinematics: Kinematics;

beforeAll(async () => {
  wasm = await instantiateP60(readFileSync(WASM));
  kinematics = new Kinematics(wasm);
});

describe('p60.wasm', () => {
  it('is built from the crate as it stands (run npm run build:wasm after changing crates/p60)', () => {
    expect(readFileSync(HASH_FILE, 'utf8').trim()).toBe(wasmSourceHash());
  });

  it('fires in the verified order, one cylinder every 90°', () => {
    const order = [...P60.firingOrder].sort((a, b) => wasm.p60_fire_angle(a) - wasm.p60_fire_angle(b));
    expect(order).toEqual([...P60.firingOrder]);
    expect(P60.firingOrder.map((cyl) => wasm.p60_fire_angle(cyl))).toEqual([0, 90, 180, 270, 360, 450, 540, 630]);
  });

  it('agrees with the engine model on banks and stroke', () => {
    for (const cylinder of cylinderLayout()) {
      const angle = (wasm.p60_bank_angle(cylinder.number) * Math.PI) / 180;
      expect(Math.sin(angle)).toBeCloseTo(cylinder.axis[0], 6);
      expect(Math.cos(angle)).toBeCloseTo(cylinder.axis[1], 6);
    }
    expect(wasm.p60_constant(P60_CONSTANT.crankRadius) * 2000).toBeCloseTo(P60.strokeMm, 4);
  });

  it('puts each piston at the top as it fires, and lights only that cylinder', () => {
    const top = wasm.p60_constant(P60_CONSTANT.crankRadius) + wasm.p60_constant(P60_CONSTANT.rodLength);
    kinematics.fireAngles.forEach((angle, i) => {
      const frame = kinematics.frame(angle);
      expect(frame[FRAME.piston(i)]).toBeCloseTo(top, 5);
      expect(frame[FRAME.glow(i)]).toBeCloseTo(1, 5);
      expect(frame[FRAME.intakeLift(i)]).toBe(0);
      expect(frame[FRAME.exhaustLift(i)]).toBe(0);
      expect(kinematics.firing(angle + 10)).toBe(i + 1);
    });
  });

  it('turns the crank backwards about +z (clockwise from the front) and the cams at half speed', () => {
    const frame = kinematics.frame(90);
    expect(frame[FRAME.crank]).toBeCloseTo(-Math.PI / 2, 6);
    expect(frame[FRAME.cam]).toBeCloseTo(-Math.PI / 4, 6);
  });

  it('answers out-of-range cylinders with NaN instead of trapping', () => {
    expect(wasm.p60_fire_angle(0)).toBeNaN();
    expect(wasm.p60_fire_angle(9)).toBeNaN();
  });
});
