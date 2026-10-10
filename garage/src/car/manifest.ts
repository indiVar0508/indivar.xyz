// The car asset contract (spec §4.2). Shared by the runtime and tools/check-assets.ts.

export const REQUIRED_NODES = ['Body', 'Hood', 'Glass', 'Marker_Wheel_FL', 'Marker_Wheel_FR', 'Marker_Wheel_RL', 'Marker_Wheel_RR', 'Marker_EngineBay'] as const;
export type RequiredNode = (typeof REQUIRED_NODES)[number];

export const ASSET_BUDGET = { maxBytes: 12 * 1024 * 1024, maxTriangles: 150_000 } as const;

export function missingNodes(names: Iterable<string>): RequiredNode[] {
  const have = new Set(names);
  return REQUIRED_NODES.filter((name) => !have.has(name));
}

export type AssetFacts = { nodeNames: string[]; bytes: number; triangles: number; textureMimeTypes: string[]; paintMeshes: number };

export function assetErrors(facts: AssetFacts): string[] {
  const errors = missingNodes(facts.nodeNames).map((name) => `missing node: ${name}`);
  if (facts.bytes > ASSET_BUDGET.maxBytes) errors.push(`file is ${(facts.bytes / 1048576).toFixed(1)} MB; budget is 12 MB`);
  if (facts.triangles > ASSET_BUDGET.maxTriangles) errors.push(`${facts.triangles} triangles; budget is ${ASSET_BUDGET.maxTriangles}`);
  const notKtx = facts.textureMimeTypes.filter((type) => type !== 'image/ktx2').length;
  if (notKtx > 0) errors.push(`${notKtx} texture(s) are not KTX2`);
  if (facts.paintMeshes === 0) errors.push('no meshes tagged role=paint');
  return errors;
}
