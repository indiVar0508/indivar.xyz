import { RoundedBox } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CatmullRomCurve3, Color, MeshPhysicalMaterial, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import { ENGINE_TOPIC_IDS, type EngineTopicId } from '../content/engine';
import type { Vec3 } from '../math';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { cylinderLayout, type Cylinder } from './geometry';

const HIGHLIGHT = new Color('#2f6bff');
const NONE = new Color('#000000');
const BANK_ANGLE = Math.PI / 4;

function makeMaterials() {
  return {
    castAlu: new MeshStandardMaterial({ color: '#a4a9ae', roughness: 0.55, metalness: 0.85 }),
    machinedAlu: new MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.28, metalness: 1 }),
    crinkle: new MeshStandardMaterial({ color: '#141516', roughness: 0.92, metalness: 0.2 }),
    carbon: new MeshPhysicalMaterial({ color: '#1b1d20', roughness: 0.38, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    steel: new MeshStandardMaterial({ color: '#8b7464', roughness: 0.32, metalness: 1 }),
    braided: new MeshStandardMaterial({ color: '#2b2c2e', roughness: 0.62, metalness: 0.6 }),
    anodized: new MeshStandardMaterial({ color: '#3a66c9', roughness: 0.3, metalness: 0.9 }),
  };
}
type Materials = ReturnType<typeof makeMaterials>;

const tube = (points: Vec3[], radius: number) =>
  new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), 24, radius, 10, false);

const bankSide = (bank: 'left' | 'right') => (bank === 'right' ? -1 : 1);
const along = (side: number, distance: number, z = -0.01): Vec3 => [side * Math.sin(BANK_ANGLE) * distance, Math.cos(BANK_ANGLE) * distance, z];
/** Unit vector from a bank's head toward the valley between the banks. */
const inward = (side: number): Vec3 => [-side * Math.sin(BANK_ANGLE), Math.cos(BANK_ANGLE), 0];

function Block({ m }: { m: Materials }) {
  return (
    <>
      <mesh position={[0, -0.03, -0.01]} material={m.castAlu} castShadow>
        <boxGeometry args={[0.4, 0.17, 0.52]} />
      </mesh>
      <mesh position={[0, -0.135, -0.01]} material={m.castAlu}>
        <boxGeometry args={[0.34, 0.05, 0.48]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={along(side, 0.15)} rotation-z={-side * BANK_ANGLE} material={m.castAlu} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.5]} />
        </mesh>
      ))}
    </>
  );
}

function Heads({ m }: { m: Materials }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={along(side, 0.31)} rotation-z={-side * BANK_ANGLE} material={m.castAlu} castShadow>
            <boxGeometry args={[0.19, 0.1, 0.5]} />
          </mesh>
          <RoundedBox args={[0.16, 0.05, 0.47]} radius={0.015} position={along(side, 0.38)} rotation-z={-side * BANK_ANGLE} material={m.crinkle} castShadow />
          {[0, 1, 2, 3].map((row) => (
            <mesh key={row} position={along(side, 0.415, (1.5 - row) * 0.1 - 0.01)} rotation-z={-side * BANK_ANGLE} material={m.crinkle}>
              <cylinderGeometry args={[0.018, 0.018, 0.04, 12]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function FrontEnd({ m }: { m: Materials }) {
  return (
    <>
      <RoundedBox args={[0.36, 0.34, 0.025]} radius={0.01} position={[0, 0.06, 0.255]} material={m.castAlu} castShadow />
      <mesh position={[0, 0, 0.285]} rotation-x={Math.PI / 2} material={m.machinedAlu} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.03, 32]} />
      </mesh>
      <mesh position={[0, 0, 0.3]} material={m.steel}>
        <torusGeometry args={[0.06, 0.006, 8, 32]} />
      </mesh>
      <mesh position={[0.2, 0.15, 0.22]} rotation-x={Math.PI / 2} material={m.castAlu}>
        <cylinderGeometry args={[0.055, 0.055, 0.12, 24]} />
      </mesh>
    </>
  );
}

function Intake({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  const runners = useMemo(
    () =>
      cylinders.map((c) => {
        const side = bankSide(c.bank);
        const into = inward(side);
        const port: Vec3 = [c.axis[0] * 0.31 + into[0] * 0.08, c.axis[1] * 0.31 + into[1] * 0.08, c.center[2]];
        return tube([[side * 0.06, 0.37, c.center[2]], [side * 0.09, 0.33, c.center[2]], port], 0.02);
      }),
    [cylinders],
  );
  const ducts = useMemo(() => [-1, 1].map((side) => tube([[side * 0.07, 0.37, 0.4], [side * 0.18, 0.32, 0.52], [side * 0.32, 0.22, 0.66]], 0.035)), []);
  return (
    <>
      <RoundedBox args={[0.15, 0.09, 0.44]} radius={0.02} position={[0, 0.37, -0.01]} material={m.carbon} castShadow />
      <RoundedBox args={[0.3, 0.12, 0.13]} radius={0.02} position={[0, 0.37, 0.29]} material={m.carbon} castShadow />
      {runners.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.carbon} />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.07, 0.37, 0.37]} rotation-x={Math.PI / 2}>
          <mesh material={m.machinedAlu}>
            <cylinderGeometry args={[0.0152, 0.022, 0.05, 24, 1, true]} />
          </mesh>
          <mesh position={[0, 0.025, 0]} rotation-x={Math.PI / 2} material={m.machinedAlu}>
            <torusGeometry args={[0.024, 0.005, 8, 24]} />
          </mesh>
        </group>
      ))}
      {ducts.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.crinkle} />
      ))}
    </>
  );
}

function FuelRails({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  return (
    <>
      {[-1, 1].map((side) => {
        const into = inward(side);
        const rail = along(side, 0.36);
        return (
          <mesh key={side} position={[rail[0] + into[0] * 0.07, rail[1] + into[1] * 0.07, -0.01]} rotation-x={Math.PI / 2} material={m.anodized}>
            <cylinderGeometry args={[0.009, 0.009, 0.44, 12]} />
          </mesh>
        );
      })}
      {cylinders.map((c) => {
        const into = inward(bankSide(c.bank));
        return (
          <mesh key={c.number} position={[c.axis[0] * 0.33 + into[0] * 0.07, c.axis[1] * 0.33 + into[1] * 0.07, c.center[2]]} material={m.anodized}>
            <cylinderGeometry args={[0.008, 0.008, 0.05, 10]} />
          </mesh>
        );
      })}
    </>
  );
}

function Headers({ m, cylinders }: { m: Materials; cylinders: Cylinder[] }) {
  const pipes = useMemo(
    () =>
      cylinders.map((c) => {
        const side = bankSide(c.bank);
        const out = inward(side).map((v) => -v) as Vec3;
        const port: Vec3 = [c.axis[0] * 0.29 + out[0] * 0.09, c.axis[1] * 0.29 + out[1] * 0.09, c.center[2]];
        return tube([port, [port[0] + side * 0.12, port[1] - 0.04, c.center[2]], [side * 0.42, -0.08, c.center[2] * 0.6], [side * 0.44, -0.2, -0.2]], 0.018);
      }),
    [cylinders],
  );
  return (
    <>
      {pipes.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.steel} castShadow />
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.44, -0.26, -0.22]} material={m.steel}>
          <cylinderGeometry args={[0.04, 0.03, 0.14, 20]} />
        </mesh>
      ))}
    </>
  );
}

function DrySump({ m }: { m: Materials }) {
  const lines = useMemo(
    () => [
      tube([[0.15, -0.14, 0.31], [-0.2, -0.12, 0.36], [-0.5, -0.05, 0.22], [-0.52, -0.09, 0.12]], 0.009),
      tube([[-0.52, 0.2, 0.12], [-0.3, 0.2, 0.3], [-0.1, 0.05, 0.27]], 0.009),
    ],
    [],
  );
  return (
    <>
      <mesh position={[-0.52, 0.06, 0.12]} material={m.machinedAlu} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.3, 28]} />
      </mesh>
      <mesh position={[-0.52, 0.22, 0.12]} material={m.anodized}>
        <cylinderGeometry args={[0.03, 0.03, 0.03, 20]} />
      </mesh>
      <mesh position={[0.15, -0.14, 0.27]} material={m.castAlu}>
        <boxGeometry args={[0.1, 0.08, 0.08]} />
      </mesh>
      {lines.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={m.braided} />
      ))}
    </>
  );
}

type PartProps = { id: EngineTopicId; active: boolean; interactive: boolean; onHover: (id: EngineTopicId | null) => void; children: (m: Materials) => ReactNode };

function Part({ id, active, interactive, onHover, children }: PartProps) {
  const materials = useMemo(makeMaterials, []);
  useEffect(() => {
    for (const material of Object.values(materials)) {
      material.emissive.copy(active ? HIGHLIGHT : NONE);
      material.emissiveIntensity = active ? 0.55 : 0;
    }
  }, [active, materials]);
  const handlers = interactive
    ? {
        onClick: (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          useGarage.getState().dispatch({ type: 'select-part', id });
        },
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHover(id);
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          onHover(null);
          document.body.style.cursor = '';
        },
      }
    : {};
  return <group {...handlers}>{children(materials)}</group>;
}

/** The P60B40 built in code. Bore and stroke are real; the rest is proportioned to fit (see ILLUSTRATIVE). */
export function P60B40({ origin, hotspots }: { origin: Vec3; hotspots?: (id: EngineTopicId, selected: boolean) => ReactNode }) {
  const view = useGarage((state) => state.view);
  const [hovered, setHovered] = useState<EngineTopicId | null>(null);
  const cylinders = useMemo(cylinderLayout, []);
  const open = isHoodOpen(view);
  const selected = view.kind === 'bay-part' ? view.id : null;
  const part = (id: EngineTopicId) => ({ id, active: open && (hovered === id || selected === id), interactive: open, onHover: setHovered });

  return (
    <group position={origin}>
      <Part {...part('layout')}>{(m) => <Block m={m} />}</Part>
      <Part {...part('heads')}>{(m) => <Heads m={m} />}</Part>
      <Part {...part('crank')}>{(m) => <FrontEnd m={m} />}</Part>
      <Part {...part('restrictors')}>{(m) => <Intake m={m} cylinders={cylinders} />}</Part>
      <Part {...part('fuel')}>{(m) => <FuelRails m={m} cylinders={cylinders} />}</Part>
      <Part {...part('headers')}>{(m) => <Headers m={m} cylinders={cylinders} />}</Part>
      <Part {...part('dry-sump')}>{(m) => <DrySump m={m} />}</Part>
      {open && hotspots && ENGINE_TOPIC_IDS.map((id) => <group key={id}>{hotspots(id, selected === id)}</group>)}
    </group>
  );
}
