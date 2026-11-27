// The drivetrain asset contract (spec 2026-10-26 §2). Shared by the runtime and tools/check-assets.ts.

const GEARS = [1, 2, 3, 4, 5, 6] as const;
export const DOG_NODES = ['Dog_12', 'Dog_34', 'Dog_56'] as const;
export const FORK_NODES = ['Fork_12', 'Fork_34', 'Fork_56'] as const;
export const ROLLER_NODES = ['Roller_RL_front', 'Roller_RL_rear', 'Roller_RR_front', 'Roller_RR_rear'] as const;
export const gearNode = (gear: number) => `Gear_${gear}`;
export const layNode = (gear: number) => `Lay_${gear}`;

/** The pivots the page turns or slides; each holds no mesh of its own. */
export const DRIVE_PIVOTS = [
  'Flywheel',
  'Input',
  'Layshaft',
  ...GEARS.map(layNode),
  ...GEARS.map(gearNode),
  'Output',
  ...DOG_NODES,
  ...FORK_NODES,
  'Propshaft',
  'Axle',
  ...ROLLER_NODES,
];
export const DRIVE_NODES = ['Drivetrain', 'Driveline', 'Rollers', ...DRIVE_PIVOTS];
/** Meshes whose names start with this are the cases the page shows as a ghost. */
export const CASE_PREFIX = 'Case_';

export const DRIVE_BUDGET = { maxBytes: 1024 * 1024, maxTriangles: 30_000 } as const;

export type DriveAssetFacts = {
  nodeNames: string[];
  bytes: number;
  triangles: number;
  pivotsWithMeshes: string[];
  /** Each dog ring's slide toward a gear (m), from its extras. */
  dogTravel: Record<string, unknown>;
  /** Each roller's radius (m), from its extras. */
  rollerRadii: Record<string, unknown>;
};

const positive = (value: unknown) => typeof value === 'number' && value > 0;

export function driveAssetErrors(facts: DriveAssetFacts): string[] {
  const have = new Set(facts.nodeNames);
  const errors = DRIVE_NODES.filter((name) => !have.has(name)).map((name) => `missing node: ${name}`);
  if (facts.bytes > DRIVE_BUDGET.maxBytes) errors.push(`file is ${(facts.bytes / 1048576).toFixed(1)} MB; budget is 1 MB`);
  if (facts.triangles > DRIVE_BUDGET.maxTriangles) errors.push(`${facts.triangles} triangles; budget is ${DRIVE_BUDGET.maxTriangles}`);
  for (const name of facts.pivotsWithMeshes) errors.push(`${name} holds its mesh directly; quantization would move its pivot`);
  for (const name of DOG_NODES) if (have.has(name) && !positive(facts.dogTravel[name])) errors.push(`${name} has no travel in its extras`);
  for (const name of ROLLER_NODES) if (have.has(name) && !positive(facts.rollerRadii[name])) errors.push(`${name} has no radius in its extras`);
  return errors;
}
