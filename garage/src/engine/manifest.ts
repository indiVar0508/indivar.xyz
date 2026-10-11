// The engine asset contract (spec 2026-10-11 §2). Shared by the runtime and tools/check-assets.ts, so it imports
// only what Node can load directly.
import type { EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';
import { ENGINE_ANCHORS } from './anchors.ts';

export type Box = { min: Vec3; max: Vec3 };

/** The turbo exists only in the game, so its hotspot floats above the real airbox instead of marking a part. */
const ANCHOR_PART: Partial<Record<EngineTopicId, EngineTopicId>> = { 'game-turbo': 'restrictors' };
const ANCHOR_TOLERANCE: Partial<Record<EngineTopicId, number>> = { 'game-turbo': 0.2 };
const DEFAULT_TOLERANCE = 0.06;

const TOPICS = Object.keys(ENGINE_ANCHORS) as EngineTopicId[];
export const ENGINE_PARTS: EngineTopicId[] = TOPICS.filter((id) => !(id in ANCHOR_PART));
export const partNode = (id: EngineTopicId): string => `Part_${id}`;
export const ENGINE_NODES: string[] = ['Engine', 'Bay', ...ENGINE_PARTS.map(partNode)];

export const ENGINE_BUDGET = { maxBytes: 4 * 1024 * 1024, maxTriangles: 90_000 } as const;

export type EngineAssetFacts = {
  nodeNames: string[];
  bytes: number;
  triangles: number;
  textureMimeTypes: string[];
  /** Bounds of each Part_* node in engine space (relative to the Engine node). */
  partBounds: Record<string, Box>;
};

/** Distance from a point to a box; zero inside it. */
export function distanceToBox(point: Vec3, box: Box): number {
  const gap = point.map((v, axis) => Math.max(box.min[axis]! - v, 0, v - box.max[axis]!));
  return Math.hypot(...gap);
}

export function engineAssetErrors(facts: EngineAssetFacts): string[] {
  const have = new Set(facts.nodeNames);
  const errors = ENGINE_NODES.filter((name) => !have.has(name)).map((name) => `missing node: ${name}`);
  if (facts.bytes > ENGINE_BUDGET.maxBytes) errors.push(`file is ${(facts.bytes / 1048576).toFixed(1)} MB; budget is 4 MB`);
  if (facts.triangles > ENGINE_BUDGET.maxTriangles) errors.push(`${facts.triangles} triangles; budget is ${ENGINE_BUDGET.maxTriangles}`);
  const notKtx = facts.textureMimeTypes.filter((type) => type !== 'image/ktx2').length;
  if (notKtx > 0) errors.push(`${notKtx} texture(s) are not KTX2`);
  for (const id of TOPICS) {
    const node = partNode(ANCHOR_PART[id] ?? id);
    const bounds = facts.partBounds[node];
    if (!bounds) continue; // already reported as a missing node
    const distance = distanceToBox(ENGINE_ANCHORS[id].position, bounds);
    if (distance > (ANCHOR_TOLERANCE[id] ?? DEFAULT_TOLERANCE)) errors.push(`the ${id} hotspot is ${distance.toFixed(2)} m from ${node}`);
  }
  return errors;
}
