import type { Vec3 } from '../math';

/** Verified P60B40 figures (Wikipedia: BMW P60B40). */
export const P60 = { boreMm: 94, strokeMm: 72, cylinders: 8, bankAngleDeg: 90, firingOrder: [1, 8, 3, 6, 4, 5, 2, 7] } as const;

/** Illustrative: no source gives bore spacing, deck height, or bank stagger, so these fit a 94 mm bore. */
export const ILLUSTRATIVE = { boreSpacing: 0.1, deckHeight: 0.24, bankStagger: 0.022 } as const;

export type Bank = 'left' | 'right';
export type Cylinder = { number: number; bank: Bank; center: Vec3; axis: Vec3 };

export const displacementCc = (boreMm: number, strokeMm: number, cylinders: number): number =>
  ((Math.PI / 4) * boreMm ** 2 * strokeMm * cylinders) / 1000;

/** BMW's usual V8 numbering: 1–4 on the right bank, 5–8 on the left, from the front. */
export const bankOf = (number: number): Bank => (number <= 4 ? 'right' : 'left');

/** Engine space: crank along Z (+Z is the nose), right bank toward -X (the car's right). */
export function cylinderLayout(): Cylinder[] {
  const half = ((P60.bankAngleDeg / 2) * Math.PI) / 180;
  return Array.from({ length: P60.cylinders }, (_, i) => {
    const number = i + 1;
    const bank = bankOf(number);
    const side = bank === 'right' ? -1 : 1;
    const axis: Vec3 = [side * Math.sin(half), Math.cos(half), 0];
    const z = (1.5 - ((number - 1) % 4)) * ILLUSTRATIVE.boreSpacing - (bank === 'left' ? ILLUSTRATIVE.bankStagger : 0);
    return { number, bank, axis, center: [axis[0] * ILLUSTRATIVE.deckHeight, axis[1] * ILLUSTRATIVE.deckHeight, z] };
  });
}
