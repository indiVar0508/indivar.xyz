import { AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Group, Points, ShaderMaterial, Vector3, type Object3D } from 'three';

/** What runs through a pipe in the x-ray, a spark at a plug, an oil jet under a piston, or a timing chain's links. */
export type FlowKind = 'air' | 'exhaust' | 'oil' | 'coolant' | 'fuel' | 'charge' | 'spray' | 'spark' | 'jet' | 'chain';
/** `radius` is a chain's crank sprocket pitch radius, which sets how far the chain runs per radian of crank. */
export type FlowPath = { name: string; kind: FlowKind; points: Vector3[]; cylinder: number | null; radius?: number | null };

/** Metres between particles along a pipe. */
export const SPACING = 0.03;
/** A 3/8-inch timing chain's pitch: one particle per link. Illustrative: no source gives the P60B40's cam drive. */
export const CHAIN_PITCH = 0.0095;
/** Particles in an exhaust pulse's slug. */
const SLUG = 6;

/** Colour (brighter than white where the bloom pass should catch it) and particle size in metres. */
const STYLE: Record<FlowKind, { color: [number, number, number]; size: number; onTop?: boolean; spacing?: number }> = {
  air: { color: [0.5, 0.85, 1.5], size: 0.009 },
  exhaust: { color: [3, 1.1, 0.25], size: 0.016 },
  oil: { color: [1.4, 0.85, 0.12], size: 0.009 },
  coolant: { color: [0.2, 1.3, 1.1], size: 0.011, onTop: true }, // the bay's hoses stay solid, so show through them
  fuel: { color: [1.6, 1.35, 0.35], size: 0.008 },
  spray: { color: [1.9, 1.6, 0.55], size: 0.006 },
  charge: { color: [0.6, 0.95, 2], size: 0.012 },
  spark: { color: [2.6, 2.9, 4.5], size: 0.022 },
  jet: { color: [1.6, 1.0, 0.15], size: 0.006, spacing: 0.012 },
  chain: { color: [0.9, 0.95, 1.1], size: 0.007, spacing: CHAIN_PITCH },
};

/** The Flow_* paths under `root`, from their glTF extras: a kind, flattened points, and a cylinder for per-cylinder pipes. */
export function readFlows(root: Object3D): FlowPath[] {
  const flows: FlowPath[] = [];
  root.traverse((node) => {
    if (!node.name.startsWith('Flow_')) return;
    const { kind, points, cylinder, radius } = node.userData as { kind: FlowKind; points: number[]; cylinder?: number; radius?: number };
    const at = (i: number) => new Vector3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
    flows.push({ name: node.name, kind, cylinder: cylinder ?? null, radius: radius ?? null, points: Array.from({ length: points.length / 3 }, (_, i) => at(i)) });
  });
  return flows;
}

function cloudMaterial(kind: FlowKind): ShaderMaterial {
  const style = STYLE[kind];
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(...style.color) }, size: { value: style.size }, scale: { value: 600 } },
    vertexShader: `attribute float alpha;
uniform float size;
uniform float scale;
varying float vAlpha;
void main() {
  vAlpha = alpha;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = alpha > 0.0 ? size * scale / -view.z : 0.0;
  gl_Position = projectionMatrix * view;
}`,
    fragmentShader: `uniform vec3 color;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(color * vAlpha * (1.0 - d), 1.0);
}`,
    transparent: true,
    depthWrite: false,
    depthTest: !style.onTop,
    blending: AdditiveBlending,
  });
}

type Line = { curve: CatmullRomCurve3; length: number; spacing: number; first: number; count: number; cloud: Cloud };
type Cloud = { positions: Float32Array; alpha: Float32Array; geometry: BufferGeometry; material: ShaderMaterial };

/** Particles moving along pipes: one point cloud per kind of fluid, so a whole engine's flow is a few draw calls. */
export class FlowField {
  readonly group = new Group();
  private readonly lines = new Map<string, Line>();
  private readonly clouds: Cloud[] = [];
  private readonly point = new Vector3();

  constructor(paths: FlowPath[]) {
    for (const kind of new Set(paths.map((path) => path.kind))) {
      const spacing = STYLE[kind].spacing ?? SPACING;
      const own = paths.filter((path) => path.kind === kind).map((path) => {
        const curve = new CatmullRomCurve3(path.points, false, 'centripetal');
        const length = curve.getLength();
        return { path, curve, length, count: Math.max(2, Math.floor(length / spacing)) };
      });
      const total = own.reduce((sum, line) => sum + line.count, 0);
      const cloud: Cloud = { positions: new Float32Array(total * 3), alpha: new Float32Array(total), geometry: new BufferGeometry(), material: cloudMaterial(kind) };
      cloud.geometry.setAttribute('position', new BufferAttribute(cloud.positions, 3));
      cloud.geometry.setAttribute('alpha', new BufferAttribute(cloud.alpha, 1));
      const points = new Points(cloud.geometry, cloud.material);
      points.frustumCulled = false;
      points.renderOrder = 3;
      this.group.add(points);
      this.clouds.push(cloud);
      let first = 0;
      for (const { path, curve, length, count } of own) {
        this.lines.set(path.name, { curve, length, spacing, first, count, cloud });
        first += count;
      }
    }
  }

  has(name: string): boolean {
    return this.lines.has(name);
  }

  /** A fluid filling its pipe, moved `offset` metres along it, at brightness `level` (0 hides it). */
  stream(name: string, offset: number, level: number): void {
    const line = this.lines.get(name)!;
    for (let i = 0; i < line.count; i++) {
      const along = (((i * line.spacing + offset) % line.length) + line.length) % line.length;
      this.place(line, i, along / line.length, level);
    }
  }

  /** A short train of particles led by `head` (0 to 1 along the pipe); a negative head hides it. */
  slug(name: string, head: number, level: number): void {
    const line = this.lines.get(name)!;
    for (let i = 0; i < line.count; i++) {
      const at = head - (i * line.spacing) / line.length;
      this.place(line, i, Math.max(0, at), i < SLUG && head >= 0 && at >= 0 ? level * (1 - i / SLUG) : 0);
    }
  }

  /** Pixels per metre at unit distance, so particle sizes stay in metres on any screen. */
  setScale(scale: number): void {
    for (const cloud of this.clouds) cloud.material.uniforms.scale!.value = scale;
  }

  /** Marks this frame's positions for upload. */
  commit(): void {
    for (const { geometry } of this.clouds) {
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.alpha!.needsUpdate = true;
    }
  }

  /** A path's particles as they stand, for tests and QA. */
  particles(name: string): { position: Vector3; alpha: number }[] {
    const line = this.lines.get(name)!;
    return Array.from({ length: line.count }, (_, i) => {
      const k = line.first + i;
      return { position: new Vector3().fromArray(line.cloud.positions, k * 3), alpha: line.cloud.alpha[k]! };
    });
  }

  /** How many particles are showing, for QA. */
  shown(): number {
    return this.clouds.reduce((sum, cloud) => sum + cloud.alpha.filter((a) => a > 0).length, 0);
  }

  private place(line: Line, i: number, u: number, alpha: number): void {
    const k = line.first + i;
    line.cloud.alpha[k] = alpha;
    if (alpha <= 0) return;
    line.curve.getPointAt(Math.min(1, u), this.point);
    this.point.toArray(line.cloud.positions, k * 3);
  }
}
