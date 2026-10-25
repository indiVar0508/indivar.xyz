// The car asset contract (spec §4.2). Shared by the runtime and tools/check-assets.ts.

/** The rear wheels turn on the rolling road; the fronts don't, so only the rears are pivots. */
export const WHEEL_NODES = ['Wheel_RL', 'Wheel_RR'] as const;
export const REQUIRED_NODES = ['Body', 'Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR', 'Marker_EngineBay', ...WHEEL_NODES] as const;
export type RequiredNode = (typeof REQUIRED_NODES)[number];

export const ASSET_BUDGET = { maxBytes: 12 * 1024 * 1024, maxTriangles: 150_000 } as const;

export function missingNodes(names: Iterable<string>): RequiredNode[] {
  const have = new Set(names);
  return REQUIRED_NODES.filter((name) => !have.has(name));
}

export type AssetFacts = {
  nodeNames: string[];
  bytes: number;
  triangles: number;
  textureMimeTypes: string[];
  paintMeshes: number;
  /** Wheel pivots that hold a mesh themselves, which quantization would move. */
  pivotsWithMeshes: string[];
  /** How many meshes each wheel pivot turns. */
  wheelMeshes: Record<string, number>;
};

export function assetErrors(facts: AssetFacts): string[] {
  const errors = missingNodes(facts.nodeNames).map((name) => `missing node: ${name}`);
  if (facts.bytes > ASSET_BUDGET.maxBytes) errors.push(`file is ${(facts.bytes / 1048576).toFixed(1)} MB; budget is 12 MB`);
  if (facts.triangles > ASSET_BUDGET.maxTriangles) errors.push(`${facts.triangles} triangles; budget is ${ASSET_BUDGET.maxTriangles}`);
  const notKtx = facts.textureMimeTypes.filter((type) => type !== 'image/ktx2').length;
  if (notKtx > 0) errors.push(`${notKtx} texture(s) are not KTX2`);
  if (facts.paintMeshes === 0) errors.push('no meshes tagged role=paint');
  for (const name of facts.pivotsWithMeshes) errors.push(`${name} holds its mesh directly; quantization would move its pivot`);
  for (const name of WHEEL_NODES) {
    const meshes = facts.wheelMeshes[name] ?? 0;
    if (facts.nodeNames.includes(name) && meshes < 3) errors.push(`${name} turns ${meshes} mesh(es); it needs its tyre, rim and brake disc`);
  }
  return errors;
}
