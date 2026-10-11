import { useEffect, useRef } from 'react';
import { audio } from '../audio/controller';
import { engineLive } from '../audio/engineSound';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';

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

function toggleInside(): void {
  const { view, inside, dispatch, setInside } = useGarage.getState();
  if (!isHoodOpen(view)) dispatch({ type: 'select-car', id: 'hood' });
  setInside(!inside);
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Engine speed, redrawn every frame from what the audio thread last reported. */
function Tach() {
  const bar = useRef<HTMLSpanElement>(null);
  const digits = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let shown = engineLive.rpm;
    let last = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      shown += (engineLive.rpm - shown) * Math.min(1, (now - last) / 60);
      last = now;
      bar.current!.style.transform = `scaleX(${Math.min(1, shown / TACH_MAX)})`;
      digits.current!.textContent = (Math.round(shown / 10) * 10).toLocaleString('en-US');
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <p className="tach">
      <span className="tach-reading"><span ref={digits}>0</span> rpm</span>
      <span className="tach-track" aria-hidden="true"><span ref={bar} className="tach-bar" /></span>
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
      Hold to rev <kbd>R</kbd>
    </button>
  );
}

/** Start and stop the P60B40, rev it, read the tach, and look inside it. */
export function EngineDock() {
  const engine = useGarage((state) => state.engine);
  const error = useGarage((state) => state.engineError);
  const inside = useGarage((state) => state.inside);
  const stopped = engine === 'off' || engine === 'stopping';
  return (
    <section className="engine-dock" aria-label="Engine">
      <button type="button" className="hud-button" onClick={stopped ? () => void startEngine() : () => audio.stopEngine()}>
        {stopped ? 'Start engine' : engine === 'starting' ? 'Starting…' : 'Stop engine'}
      </button>
      {!stopped && <Tach />}
      {engine === 'running' && <RevButton />}
      <button type="button" className="hud-button" aria-pressed={inside} onClick={toggleInside}>
        Look inside
      </button>
      {error && <p className="engine-error" role="status">{error}</p>}
    </section>
  );
}
