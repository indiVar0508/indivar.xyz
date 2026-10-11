import { useEffect } from 'react';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { InfoPanel } from './InfoPanel';
import { RadioDock } from './RadioDock';
import { SoundControls } from './SoundControls';
import { breadcrumbFor } from './topicFor';

export function Hud() {
  const view = useGarage((state) => state.view);
  const ready = useGarage((state) => state.ready);
  const dispatch = useGarage((state) => state.dispatch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useGarage.getState().dispatch({ type: 'back' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;
  const hoodOpen = isHoodOpen(view);
  const crumbs = breadcrumbFor(view);
  return (
    <>
      <nav className="crumbs" aria-label="Location">
        <ol>
          {crumbs.map((crumb, i) => (
            <li key={crumb} aria-current={i === crumbs.length - 1 ? 'location' : undefined}>{crumb}</li>
          ))}
        </ol>
      </nav>
      <div className="hud-actions">
        <button type="button" className="hud-button" onClick={() => dispatch(hoodOpen ? { type: 'close-hood' } : { type: 'select-car', id: 'hood' })}>
          {hoodOpen ? 'Close the hood' : 'Open the hood'}
        </button>
        <SoundControls />
      </div>
      <p className="hint">Drag to orbit · Pick a marker · Esc to go back</p>
      <InfoPanel />
      <RadioDock />
    </>
  );
}
