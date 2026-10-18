import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FlowField, readFlows, SPACING } from './flows';

/** Flow_* nodes as GLTFLoader gives them: their extras in userData, the points flattened. */
function withFlows(): Group {
  const root = new Group();
  const add = (name: string, extras: Record<string, unknown>) => root.add(Object.assign(new Object3D(), { name, userData: extras }));
  add('Flow_oil_to_tank', { kind: 'oil', points: [0, 0, 0, 0.5, 0, 0, 1, 0, 0] });
  add('Flow_exhaust_3', { kind: 'exhaust', points: [0, 0, 0, 0, -1, 0], cylinder: 3 });
  add('Part_heads', {});
  return root;
}

describe('readFlows', () => {
  it('reads every Flow_* path with its kind, points and cylinder', () => {
    const flows = readFlows(withFlows());
    expect(flows.map((flow) => [flow.name, flow.kind, flow.points.length, flow.cylinder])).toEqual([
      ['Flow_oil_to_tank', 'oil', 3, null],
      ['Flow_exhaust_3', 'exhaust', 2, 3],
    ]);
    expect(flows[0]!.points[1]).toEqual(new Vector3(0.5, 0, 0));
  });
});

describe('FlowField', () => {
  const field = () => new FlowField(readFlows(withFlows()));
  const shown = (f: FlowField, name: string) => f.particles(name).filter((p) => p.alpha > 0);

  it('spaces particles evenly along each pipe', () => {
    const f = field();
    expect(f.particles('Flow_oil_to_tank')).toHaveLength(Math.floor(1 / SPACING));
  });

  it('streams a fluid along its pipe, at the level it is given, and hides it at zero', () => {
    const f = field();
    f.stream('Flow_oil_to_tank', 0, 0.8);
    const before = shown(f, 'Flow_oil_to_tank').map((p) => p.position.x);
    expect(before.length).toBeGreaterThan(20);
    f.stream('Flow_oil_to_tank', 0.01, 0.8);
    const after = shown(f, 'Flow_oil_to_tank').map((p) => p.position.x);
    expect(after[0]! - before[0]!).toBeCloseTo(0.01, 3);
    f.stream('Flow_oil_to_tank', 0.02, 0);
    expect(shown(f, 'Flow_oil_to_tank')).toHaveLength(0);
  });

  it('sends a short slug down an exhaust pipe, led by its head', () => {
    const f = field();
    f.slug('Flow_exhaust_3', 0.5, 1);
    const slug = shown(f, 'Flow_exhaust_3');
    expect(slug.length).toBeGreaterThan(2);
    expect(slug.length).toBeLessThan(10);
    expect(Math.min(...slug.map((p) => p.position.y))).toBeCloseTo(-0.5, 2);
    expect(Math.max(...slug.map((p) => p.position.y))).toBeLessThanOrEqual(0);
    f.slug('Flow_exhaust_3', -1, 1);
    expect(shown(f, 'Flow_exhaust_3')).toHaveLength(0);
  });

  it('builds one point cloud per kind of fluid', () => {
    expect(field().group.children).toHaveLength(2);
  });
});
