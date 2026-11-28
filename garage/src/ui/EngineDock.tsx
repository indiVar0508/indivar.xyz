import { Suspense, use, useEffect, useRef } from 'react';
import { audio } from '../audio/controller';
import { engineLive } from '../audio/engineSound';
import { gearLabel, kmh } from '../drive/gears';
import { loadKinematics } from '../engine/p60';
import { useGarage } from '../state/store';
import { isHoodOpen, showsGearbox, type XrayView } from '../state/view';

const TACH_MAX = 9000;

async function startEngine(): Promise<void> {
  const { setSound, setEngine, setEngineError } = useGarage.getState();
  setEngineError(null);
  setSound(true);
  setEngine('starting');
  try {
    await audio.startEngine();
  } catch {
    setEngine('off');
    setEngineError('This browser couldn’t start the engine sound.');
  }
}

/** Looks inside at the engine, the gearbox or both, opening the hood first; picking the view shown steps back out. */
function look(xray: XrayView): void {
  const { view, inside, xray: shown, dispatch, setLook } = useGarage.getState();
  if (!isHoodOpen(view)) dispatch({ type: 'select-car', id: 'hood' });
  setLook(inside && shown === xray ? null : xray);
}

const LOOKS: { xray: XrayView; name: string; long: string; short: string }[] = [
  { xray: 'engine', name: 'Look inside the engine', long: 'Engine', short: 'Engine' },
  { xray: 'gearbox', name: 'Look inside the gearbox', long: 'Gearbox', short: 'Gears' },
  { xray: 'both', name: 'Look inside both', long: 'Engine + gearbox', short: 'Both' },
];

/** A button's full label, shortened on phones to a word that stays inside the full one (its accessible name). */
const Label = ({ long, short }: { long: string; short: string }) => (
  <>
    <span className="label-long">{long}</span>
    <span className="label-short">{short}</span>
  </>
);

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Engine speed (and boost, with the game turbo kit), redrawn every frame from what the audio thread last reported. */
function Tach({ turbo }: { turbo: boolean }) {
  const bar = useRef<HTMLSpanElement>(null);
  const boost = useRef<HTMLSpanElement>(null);
  const digits = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let shown = engineLive.rpm;
    let last = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      shown += (engineLive.rpm - shown) * Math.min(1, (now - last) / 60);
      last = now;
      bar.current!.style.transform = `scaleX(${Math.min(1, shown / TACH_MAX)})`;
      if (boost.current) boost.current.style.transform = `scaleX(${engineLive.boost})`;
      digits.current!.textContent = (Math.round(shown / 10) * 10).toLocaleString('en-US');
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <p className="tach">
      <span className="tach-reading"><span ref={digits}>0</span> rpm</span>
      <span className="tach-track" aria-hidden="true"><span ref={bar} className="tach-bar" /></span>
      {turbo && <span className="tach-boost" aria-hidden="true"><span ref={boost} /></span>}
    </p>
  );
}

/** Opens the throttle while held: by pointer, by Space or Enter on the button, or by holding R anywhere. */
function RevButton() {
  useEffect(() => {
    const isR = (event: KeyboardEvent) => event.key === 'r' || event.key === 'R';
    const down = (event: KeyboardEvent) => {
      if (isR(event) && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !typing(event.target)) audio.setThrottle(1);
    };
    const up = (event: KeyboardEvent) => {
      if (isR(event)) audio.setThrottle(0);
    };
    const release = () => audio.setThrottle(0);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);
  const hold = (on: boolean) => audio.setThrottle(on ? 1 : 0);
  const isKey = (key: string) => key === ' ' || key === 'Enter';
  return (
    <button
      type="button"
      className="hud-button engine-rev"
      aria-label="Hold to rev"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        hold(true);
      }}
      onPointerUp={() => hold(false)}
      onPointerCancel={() => hold(false)}
      onLostPointerCapture={() => hold(false)}
      onKeyDown={(event) => {
        if (!isKey(event.key)) return;
        event.preventDefault();
        if (!event.repeat) hold(true);
      }}
      onKeyUp={(event) => {
        if (!isKey(event.key)) return;
        event.preventDefault();
        hold(false);
      }}
      onBlur={() => hold(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Label long="Hold to rev" short="Rev" /> <kbd>R</kbd>
    </button>
  );
}

/**
 * Changes gear, by the buttons or the arrow keys, and shows the gear and the road speed on the rollers. Presses come
 * no faster than a change takes, so the gearbox never refuses one for being mid-change.
 */
function GearControls() {
  const box = use(loadKinematics()).gearbox;
  const gear = useGarage((state) => state.gear);
  const speed = useRef<HTMLSpanElement>(null);
  const last = useRef(-Infinity);
  const shift = (up: boolean) => {
    const now = performance.now();
    if (now - last.current < box.shiftSeconds * 1000 + 30) return;
    last.current = now;
    audio.shift(up);
  };
  const shiftRef = useRef(shift);
  shiftRef.current = shift;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      shiftRef.current(event.key === 'ArrowUp');
    };
    window.addEventListener('keydown', down);
    let frame = requestAnimationFrame(function draw() {
      speed.current!.textContent = `${Math.round(kmh(box, engineLive.wheel))} km/h`;
      frame = requestAnimationFrame(draw);
    });
    return () => {
      window.removeEventListener('keydown', down);
      cancelAnimationFrame(frame);
    };
  }, [box]);
  return (
    <div className="engine-gears" role="group" aria-label="Gearbox">
      <button type="button" className="hud-button" aria-label="Shift down" onClick={() => shift(false)}>
        <span aria-hidden="true">▼</span> <kbd>↓</kbd>
      </button>
      <p className="gear-readout">
        <span className="gear-now" aria-label={gear === 0 ? 'Neutral' : `Gear ${gear}`}>{gearLabel(gear)}</span>
        <span ref={speed} className="gear-speed">0 km/h</span>
      </p>
      <button type="button" className="hud-button" aria-label="Shift up" onClick={() => shift(true)}>
        <span aria-hidden="true">▲</span> <kbd>↑</kbd>
      </button>
    </div>
  );
}

/** Start and stop the P60B40, rev it, change gear, read the tach, and look inside it. */
export function EngineDock() {
  const engine = useGarage((state) => state.engine);
  const error = useGarage((state) => state.engineError);
  const inside = useGarage((state) => state.inside);
  const xray = useGarage((state) => state.xray);
  const turbo = useGarage((state) => state.turbo);
  const driveNote = useGarage((state) => state.driveNote);
  // With the hood open, outside the x-ray, the clutch and gearbox are hidden behind the engine.
  const inGear = useGarage((state) => state.gear > 0 && isHoodOpen(state.view));
  const stopped = engine === 'off' || engine === 'stopping';
  const hint = turbo ? 'Game turbo kit fitted. It’s only in Most Wanted: the real P60B40 has no turbo.' : inGear && !(inside && showsGearbox(xray)) ? 'Look inside the gearbox to watch it change gear.' : '';
  return (
    <section className="engine-dock" aria-label="Engine">
      {stopped ? (
        <button type="button" className="hud-button" aria-label="Start engine" onClick={() => void startEngine()}>
          <Label long="Start engine" short="Start" />
        </button>
      ) : (
        <button type="button" className="hud-button" aria-label={engine === 'starting' ? 'Starting…' : 'Stop engine'} onClick={() => audio.stopEngine()}>
          <Label long={engine === 'starting' ? 'Starting…' : 'Stop engine'} short={engine === 'starting' ? 'Starting…' : 'Stop'} />
        </button>
      )}
      {!stopped && <Tach key={String(turbo)} turbo={turbo} />}
      {engine === 'running' && <RevButton />}
      {engine === 'running' && (
        <Suspense fallback={null}>
          <GearControls />
        </Suspense>
      )}
      <div className="engine-look" role="group" aria-label="Look inside">
        <span className="engine-look-caption" aria-hidden="true">Look inside</span>
        <div className="engine-look-buttons">
          {LOOKS.map(({ xray: id, name, long, short }) => (
            <button key={id} type="button" className="hud-button" data-view={id} aria-label={name} aria-pressed={inside && xray === id} onClick={() => look(id)}>
              <Label long={long} short={short} />
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="hud-button engine-turbo" aria-label="Game turbo" aria-pressed={turbo} onClick={() => useGarage.getState().setTurbo(!turbo)}>
        <Label long="Game turbo" short="Turbo" />
      </button>
      <p className="engine-note" role="status">
        {error ?? driveNote ?? hint}
      </p>
    </section>
  );
}
