import { Suspense, use, useEffect, useRef } from 'react';
import { engineLive } from '../audio/engineSound';
import { gearStrip, kmh, ordinal, wheelTorque } from '../drive/gears';
import { loadKinematics } from '../engine/p60';
import { useGarage } from '../state/store';

const format = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * What each gear does: a bar from standstill to its speed at the limiter, and how many times it multiplies the
 * engine's torque at the wheels. The engaged gear is lit, with a mark at the road speed, and a line under the chart
 * reads the gear, the speed and the torque at the wheels as they change.
 */
function Strip() {
  const box = use(loadKinematics()).gearbox;
  const gear = useGarage((state) => state.gear);
  const engine = useGarage((state) => state.engine);
  const rows = gearStrip(box, box.limitRpm);
  const fastest = Math.max(...rows.map((row) => row.topSpeed));
  const mark = useRef<HTMLSpanElement>(null);
  const live = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let frame = requestAnimationFrame(function draw() {
      const speed = kmh(box, engineLive.wheel);
      if (mark.current) mark.current.style.left = `${Math.min(100, (speed / fastest) * 100)}%`;
      const torque = wheelTorque(box, engineLive.gear, engineLive.clutch);
      const gearWord = engineLive.gear === 0 ? 'Neutral' : ordinal(engineLive.gear);
      const pull = torque < -1 ? `${format(-torque)} N·m of engine braking` : `${format(torque)} N·m at the wheels`;
      live.current!.textContent = `${gearWord} · ${format(speed)} km/h · ${pull}`;
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [box, fastest]);

  const note = engine === 'running' ? (gear === 0 ? 'Change up to drive the wheels, then rev.' : null) : 'Start the engine, change up, then rev to drive the wheels.';
  return (
    <figure className="gears">
      <figcaption>Gears</figcaption>
      <ol>
        {rows.map((row) => (
          <li key={row.gear} className={row.gear === gear ? 'is-engaged' : undefined}>
            <span className="gear-number">{row.gear}</span>
            <span className="gear-track">
              <span className="gear-bar" style={{ transform: `scaleX(${row.topSpeed / fastest})` }} />
              {row.gear === gear && <span ref={mark} className="gear-mark" />}
            </span>
            <span className="gear-top">{format(row.topSpeed)} km/h</span>
            <span className="gear-pull">×{row.multiply.toFixed(1)}</span>
          </li>
        ))}
      </ol>
      <p>Each bar runs to the gear’s speed at the {format(box.limitRpm)} rpm limiter; × is how many times it multiplies the engine’s torque at the wheels.</p>
      <p ref={live} className="gear-live" aria-live="off" />
      {note && <p className="gear-note">{note}</p>}
    </figure>
  );
}

export function GearStrip() {
  return (
    <Suspense fallback={null}>
      <Strip />
    </Suspense>
  );
}
