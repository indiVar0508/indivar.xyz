import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { P60 } from '../engine/geometry';
import { insideLive } from '../engine/live';
import type { Badge, Topic } from '../content/types';
import { useGarage } from '../state/store';
import { topicFor } from './topicFor';

const BADGE_LABEL: Record<Badge, string> = { verified: 'Verified', illustrative: 'Illustrative', 'game-lore': 'Game lore' };
type Tab = 'real' | 'game';

/** The firing order, lighting each cylinder as it fires in the x-ray. */
function FiringStrip({ note }: { note: string | null }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    let shown = -1;
    let frame = requestAnimationFrame(function draw() {
      if (insideLive.firing !== shown) {
        shown = insideLive.firing;
        list.current!.querySelectorAll('li').forEach((item) => item.classList.toggle('is-firing', Number(item.dataset.cylinder) === shown));
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <figure className="firing">
      <figcaption>Firing order</figcaption>
      <ol ref={list}>
        {P60.firingOrder.map((cylinder) => (
          <li key={cylinder} data-cylinder={cylinder} className={cylinder <= 4 ? 'bank-right' : 'bank-left'}>{cylinder}</li>
        ))}
      </ol>
      <p>Cylinders 1–4 are the right bank, 5–8 the left.</p>
      {note && <p className="firing-note">{note}</p>}
    </figure>
  );
}

function PanelBody({ topic, eyebrow, hint, extra }: { topic: Topic; eyebrow: string; hint: string | null; extra?: ReactNode }) {
  const tabs = (['real', 'game'] as const).filter((tab) => topic[tab].length > 0);
  const [tab, setTab] = useState<Tab>(tabs[0]!);
  const back = () => useGarage.getState().dispatch({ type: 'back' });
  const panel = useRef<HTMLElement>(null);

  // Publishes the panel's height so the phone layout can seat the HUD buttons right above the bottom sheet, and
  // tells the camera how much of the canvas the sheet and buttons cover, so it can frame the subject above them.
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const { setCoveredBottom } = useGarage.getState();
    const actions = document.querySelector('.hud-actions');
    const measure = () => {
      const sheet = panel.current!.getBoundingClientRect();
      root.setProperty('--panel-height', `${sheet.height}px`);
      const phone = matchMedia('(max-width: 720px)').matches;
      const top = actions?.getBoundingClientRect().top ?? sheet.top;
      setCoveredBottom(phone ? Math.max(0, innerHeight - top) : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current!);
    if (actions) observer.observe(actions);
    return () => {
      observer.disconnect();
      root.removeProperty('--panel-height');
      setCoveredBottom(0);
    };
  }, []);
  const facts = (
    <ul className="facts">
      {topic[tab].map((fact) => (
        <li key={fact.text} className={`fact fact-${fact.badge}`}>
          <span className="badge">{BADGE_LABEL[fact.badge]}</span>
          <p>{fact.text}</p>
          {fact.sources.length > 0 && (
            <p className="sources">
              {fact.sources.map((source, i) => (
                <Fragment key={source.url}>
                  {i > 0 && ' · '}
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
                </Fragment>
              ))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <aside ref={panel} className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="panel-title">{topic.title}</h2>
        <button type="button" className="panel-close" onClick={back} aria-label="Back">×</button>
      </header>
      {extra}
      {tabs.length > 1 ? (
        <>
          <div className="panel-tabs" role="tablist" aria-label="Facts about">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="panel-facts" onClick={() => setTab(t)}>
                {t === 'real' ? 'Real car' : 'In the game'}
              </button>
            ))}
          </div>
          <div id="panel-facts" role="tabpanel" aria-labelledby={`tab-${tab}`}>{facts}</div>
        </>
      ) : (
        facts
      )}
      {hint && <p className="panel-hint">{hint}</p>}
    </aside>
  );
}

export function InfoPanel() {
  const view = useGarage((state) => state.view);
  const inside = useGarage((state) => state.inside);
  const engine = useGarage((state) => state.engine);
  const topic = topicFor(view, inside);
  if (!topic) return null;
  const inBay = view.kind === 'bay' || view.kind === 'bay-part';
  if (topic.id === 'running') {
    const note = engine === 'off' || engine === 'stopping' ? 'Start the engine to see it run.' : null;
    return <PanelBody key={topic.id} topic={topic} eyebrow="P60B40 V8" hint={null} extra={<FiringStrip note={note} />} />;
  }
  const hint = view.kind === 'bay' ? 'Pick a highlighted part to see what it does.' : null;
  return <PanelBody key={topic.id} topic={topic} eyebrow={inBay ? 'P60B40 V8' : 'BMW M3 GTR'} hint={hint} />;
}
