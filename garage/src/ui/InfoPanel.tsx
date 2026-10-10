import { Fragment, useState } from 'react';
import type { Badge, Topic } from '../content/types';
import { useGarage } from '../state/store';
import { topicFor } from './topicFor';

const BADGE_LABEL: Record<Badge, string> = { verified: 'Verified', illustrative: 'Illustrative', 'game-lore': 'Game lore' };
type Tab = 'real' | 'game';

function PanelBody({ topic, eyebrow, hint }: { topic: Topic; eyebrow: string; hint: string | null }) {
  const tabs = (['real', 'game'] as const).filter((tab) => topic[tab].length > 0);
  const [tab, setTab] = useState<Tab>(tabs[0]!);
  const back = () => useGarage.getState().dispatch({ type: 'back' });
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
    <aside className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="panel-title">{topic.title}</h2>
        <button type="button" className="panel-close" onClick={back} aria-label="Back">×</button>
      </header>
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
  const topic = topicFor(view);
  if (!topic) return null;
  const inBay = view.kind === 'bay' || view.kind === 'bay-part';
  return (
    <PanelBody
      key={topic.id}
      topic={topic}
      eyebrow={inBay ? 'P60B40 V8' : 'BMW M3 GTR'}
      hint={view.kind === 'bay' ? 'Pick a highlighted part to see what it does.' : null}
    />
  );
}
