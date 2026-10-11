import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3, type Group } from 'three';
import type { Vec3 } from '../math';
import { facingOpacity } from './facing';

type Props = { position: Vec3; normal: Vec3; label: string; summary: string; selected?: boolean; onSelect: () => void };

/** A pulsing marker anchored in 3D. It fades when its surface faces away, but stays reachable by keyboard.
 * Its z-index stays below the masthead (10), the HUD (12) and the panel (20). */
export function Hotspot({ position, normal, label, summary, selected = false, onSelect }: Props) {
  const group = useRef<Group>(null);
  const holder = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);
  const world = useMemo(() => new Vector3(), []);
  const scratch = useMemo(() => new Vector3(), []);
  const facing = useMemo(() => new Vector3(...normal).normalize(), [normal]);
  useFrame(({ camera }) => {
    if (!group.current || !holder.current) return;
    group.current.getWorldPosition(world);
    const opacity = Math.round(facingOpacity(world, facing, camera.position, scratch) * 20) / 20;
    if (opacity === shown.current) return; // touch the DOM only when the 5% step changes
    shown.current = opacity;
    holder.current.style.opacity = String(opacity);
    holder.current.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none';
  });
  return (
    <group ref={group} position={position}>
      <Html center zIndexRange={[9, 0]}>
        <div ref={holder} className="hotspot-holder">
          <button type="button" className={selected ? 'hotspot is-selected' : 'hotspot'} onClick={onSelect}>
            <span className="hotspot-dot" aria-hidden="true" />
            <span className="hotspot-label">
              {label}
              <small>{summary}</small>
            </span>
          </button>
        </div>
      </Html>
    </group>
  );
}
