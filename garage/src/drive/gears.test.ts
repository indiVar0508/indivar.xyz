import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { instantiateP60, P60_CONSTANT, readGearbox } from '../engine/p60';
import { DriveSpin, dogOffset, gearLabel, gearStrip, kmh, ordinal, overallRatio, refusalNote, speedAt, wheelTorque, type Gearbox } from './gears';

let box: Gearbox;
let limit: number;

beforeAll(async () => {
  const wasm = await instantiateP60(readFileSync(resolve(import.meta.dirname, '../../public/wasm/p60.wasm')));
  box = readGearbox(wasm);
  limit = wasm.p60_constant(P60_CONSTANT.limitRpm);
});

describe('the gearbox, as the crate has it', () => {
  it('has six close ratios, from about 115 km/h in 1st to about 285 km/h in 6th at the limiter', () => {
    expect(box.gears).toHaveLength(6);
    for (let gear = 2; gear <= 6; gear++) expect(overallRatio(box, gear)).toBeLessThan(overallRatio(box, gear - 1));
    expect(speedAt(box, 1, limit)).toBeGreaterThan(100);
    expect(speedAt(box, 1, limit)).toBeLessThan(125);
    expect(speedAt(box, 6, limit)).toBeGreaterThan(270);
    expect(speedAt(box, 6, limit)).toBeLessThan(300);
    expect(kmh(box, 100 / 3.6 / box.tyreRadius)).toBeCloseTo(100, 6);
    expect(box.shiftSeconds).toBeGreaterThan(0.05);
    expect(box.limitRpm).toBe(limit);
  });

  it('multiplies the clutch’s torque at the wheels by the gear, less what the gears lose', () => {
    expect(box.efficiency).toBeGreaterThan(0.8);
    expect(box.efficiency).toBeLessThan(1);
    expect(wheelTorque(box, 1, 400)).toBeCloseTo(400 * overallRatio(box, 1) * box.efficiency, 6);
    expect(wheelTorque(box, 0, 400)).toBe(0);
  });

  it('lists each gear’s speed at the limiter and how many times it multiplies the engine’s torque', () => {
    const rows = gearStrip(box, limit);
    expect(rows.map((row) => row.gear)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows[0]!.multiply).toBeCloseTo(overallRatio(box, 1), 6);
    for (let k = 1; k < 6; k++) {
      expect(rows[k]!.topSpeed).toBeGreaterThan(rows[k - 1]!.topSpeed);
      expect(rows[k]!.multiply).toBeLessThan(rows[k - 1]!.multiply);
    }
  });
});

describe('gear words', () => {
  it('labels and orders the gears', () => {
    expect([0, 1, 6].map(gearLabel)).toEqual(['N', '1', '6']);
    expect([1, 2, 3, 4, 6].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '6th']);
  });

  it('says why a change was refused', () => {
    expect(refusalNote(true, 6)).toBe('6th is the top gear.');
    expect(refusalNote(true, 0)).toBe('Too fast for 1st: it would over-rev the engine.');
    expect(refusalNote(false, 3)).toBe('Too fast for 2nd: it would over-rev the engine.');
    expect(refusalNote(false, 0)).toBeNull();
  });
});

describe('DriveSpin', () => {
  const turned = (spin: DriveSpin) => ({ ...spin, outputs: [...spin.outputs] });

  it('in gear, turns every shaft from the wheels at its true ratio, with the free gears at their own speeds', () => {
    const spin = new DriveSpin(box);
    spin.step(0, 0.01, 3);
    const s = turned(spin);
    const fd = box.finalDrive[1] / box.finalDrive[0];
    expect(s.wheel).toBeCloseTo(0.01, 9);
    expect(s.output).toBeCloseTo(0.01 * fd, 9);
    expect(s.input).toBeCloseTo(0.01 * overallRatio(box, 3), 9);
    expect(s.layshaft).toBeLessThan(0); // it turns the other way
    expect(s.outputs[2]).toBeCloseTo(s.output, 9); // 3rd's gear is locked to the output shaft
    expect(s.outputs[0]).toBeLessThan(s.output); // 1st's spins slower on it, 6th's faster
    expect(s.outputs[5]).toBeGreaterThan(s.output);
    expect(s.flywheel).toBe(0); // the engine side hasn't turned: the clutch slipped
  });

  it('in neutral, turns the gearbox from the engine and leaves the output shaft with the wheels', () => {
    const spin = new DriveSpin(box);
    spin.step(0.2, 0, 0);
    expect(spin.flywheel).toBeCloseTo(0.2, 9);
    expect(spin.input).toBeCloseTo(0.2, 9);
    expect(spin.output).toBe(0);
    expect(spin.outputs.every((angle) => angle > 0)).toBe(true);
  });

  it('keeps its angles within a turn', () => {
    const spin = new DriveSpin(box);
    for (let i = 0; i < 1000; i++) spin.step(1, 0.3, 2);
    for (const angle of [spin.flywheel, spin.input, spin.layshaft, spin.output, spin.wheel, ...spin.outputs]) expect(Math.abs(angle)).toBeLessThan(2 * Math.PI);
  });

  it('slides each dog ring toward its engaged gear', () => {
    expect([0, 1, 2, 3].map((gear) => dogOffset(0, gear))).toEqual([0, -1, 1, 0]);
    expect(dogOffset(2, 6)).toBe(1);
  });
});
