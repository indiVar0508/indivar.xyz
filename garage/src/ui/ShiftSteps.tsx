import { REPLAY_SLOWDOWN, replayCaption, replayList } from '../drive/shiftReplay';
import { useGarage } from '../state/store';

/**
 * The last gear change the x-ray replayed, step by step: what is done, what is under way (lit, with a sentence on what
 * it does), and what is still to come. Before any change, how to start one.
 */
export function ShiftSteps() {
  const replay = useGarage((state) => state.replay);
  const engine = useGarage((state) => state.engine);
  if (!replay) {
    const start = engine === 'running' ? 'Change gear' : 'Start the engine and change gear';
    return (
      <figure className="shift">
        <figcaption>Changing gear</figcaption>
        <p className="shift-note">{`${start} to watch the clutch and gearbox do it, slowed ${REPLAY_SLOWDOWN}×.`}</p>
      </figure>
    );
  }
  return (
    <figure className="shift">
      <figcaption>{`Changing gear: ${replayCaption(replay.change)}, slowed ${REPLAY_SLOWDOWN}×`}</figcaption>
      <ol>
        {replayList(replay.change, replay.step).map(({ step, title, state, text }) => (
          <li key={step} className={`is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="shift-title">{title}</span>
            {text && <span className="shift-text">{text}</span>}
          </li>
        ))}
      </ol>
    </figure>
  );
}
