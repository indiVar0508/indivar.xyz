/**
 * The gearbox on the page. Its tooth counts come from p60.wasm (crates/p60/src/drivetrain.rs, read by readGearbox in
 * engine/p60.ts), so the ratios here, the sound and the physics are one gearbox. The ratios are illustrative: no
 * source gives the M3 GTR's.
 */

/** A gear pair's teeth: the driving gear, then the driven one. */
export type Pair = readonly [number, number];
export type Gearbox = {
  constantMesh: Pair;
  gears: Pair[];
  finalDrive: Pair;
  tyreRadius: number;
  shiftSeconds: number;
  /** The share of the clutch's torque that reaches the wheels. */
  efficiency: number;
  limitRpm: number;
};

const reduction = ([driver, driven]: Pair) => driven / driver;

/** The gearbox's own reduction in a gear: the constant-mesh pair, then the gear's own pair. */
export const gearboxRatio = (box: Gearbox, gear: number): number => reduction(box.constantMesh) * reduction(box.gears[gear - 1]!);

/** From the crank to the rear wheels in a gear. */
export const overallRatio = (box: Gearbox, gear: number): number => gearboxRatio(box, gear) * reduction(box.finalDrive);

/** Road speed (km/h) for a wheel speed (rad/s). */
export const kmh = (box: Gearbox, wheel: number): number => wheel * box.tyreRadius * 3.6;

/** Torque at the rear wheels (N·m) for a torque through the clutch in a gear. */
export const wheelTorque = (box: Gearbox, gear: number, clutch: number): number => (gear > 0 ? clutch * overallRatio(box, gear) * box.efficiency : 0);

/** Road speed (km/h) at an engine speed in a gear, with the clutch shut. */
export const speedAt = (box: Gearbox, gear: number, rpm: number): number => kmh(box, (rpm * Math.PI) / 30 / overallRatio(box, gear));

export type ShaftSpeeds = { input: number; layshaft: number; gears: number[]; output: number };

/**
 * Each shaft's speed and each gear's on the output shaft (rpm), for the input and output shafts' speeds. Every gear
 * is always in mesh, so the layshaft turns all six; only the one a dog ring locks turns with the output shaft.
 */
export function shaftSpeeds(box: Gearbox, { input, output }: { input: number; output: number }): ShaftSpeeds {
  const layshaft = input / reduction(box.constantMesh);
  return { input, layshaft, gears: box.gears.map((pair) => layshaft / reduction(pair)), output };
}

/** The speeds as the gearbox reports them: in gear the gearbox turns with the wheels, in neutral with the engine. */
export function liveShaftSpeeds(box: Gearbox, { rpm, gear, wheel }: { rpm: number; gear: number; wheel: number }): ShaftSpeeds {
  const output = (wheel * reduction(box.finalDrive) * 60) / (2 * Math.PI);
  return shaftSpeeds(box, { input: gear > 0 ? output * gearboxRatio(box, gear) : rpm, output });
}

export const gearLabel = (gear: number): string => (gear === 0 ? 'N' : String(gear));

export const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Why the gearbox refused a change from `gear`, or null when there is nothing to say. */
export function refusalNote(up: boolean, gear: number, gears = 6): string | null {
  if (up) return gear >= gears ? `${ordinal(gears)} is the top gear.` : `Too fast for ${ordinal(gear + 1)}: it would over-rev the engine.`;
  return gear > 1 ? `Too fast for ${ordinal(gear - 1)}: it would over-rev the engine.` : null;
}

export type GearRow = { gear: number; topSpeed: number; multiply: number };

/** For each gear, its road speed at the limiter and how many times it multiplies the engine's torque at the wheels. */
export const gearStrip = (box: Gearbox, limitRpm: number): GearRow[] =>
  box.gears.map((_, k) => ({ gear: k + 1, topSpeed: speedAt(box, k + 1, limitRpm), multiply: overallRatio(box, k + 1) }));

/** Which way dog ring `ring` (0 for 1-2, 1 for 3-4, 2 for 5-6) slides in a gear: -1 toward its lower gear, 1 its upper. */
export const dogOffset = (ring: number, gear: number): number => (gear === 2 * ring + 1 ? -1 : gear === 2 * ring + 2 ? 1 : 0);

const TURN = 2 * Math.PI;
const wrap = (angle: number) => angle % TURN;

/**
 * Angles (radians) of the drivetrain's turning parts, advanced together so each keeps its true ratio to the others.
 * Shafts along the car count positive the way the crank turns; the layshaft turns the other way. In gear the gearbox
 * turns from the wheels, so a slipping clutch shows as the flywheel and the clutch disc turning apart; in neutral it
 * turns from the engine, and the output shaft only with the wheels.
 */
export class DriveSpin {
  flywheel = 0;
  input = 0;
  layshaft = 0;
  /** Each gear's wheel on the output shaft, 1st to 6th: only the engaged one is locked to the shaft. */
  readonly outputs: number[];
  output = 0;
  wheel = 0;
  private readonly box: Gearbox;

  constructor(box: Gearbox) {
    this.box = box;
    this.outputs = box.gears.map(() => 0);
  }

  /** Advances by the engine's and the wheels' turns (radians) with `gear` engaged (0 is neutral). */
  step(engine: number, wheel: number, gear: number): void {
    const output = wheel * reduction(this.box.finalDrive);
    const input = gear > 0 ? output * gearboxRatio(this.box, gear) : engine;
    const layshaft = input / reduction(this.box.constantMesh);
    this.flywheel = wrap(this.flywheel + engine);
    this.input = wrap(this.input + input);
    this.layshaft = wrap(this.layshaft - layshaft);
    this.box.gears.forEach(([lay, out], k) => (this.outputs[k] = wrap(this.outputs[k]! + (layshaft * lay) / out)));
    this.output = wrap(this.output + output);
    this.wheel = wrap(this.wheel + wheel);
  }
}
