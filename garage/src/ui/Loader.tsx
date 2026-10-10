import { useProgress } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { loaderFacts } from '../content/loaderFacts';
import { useGarage } from '../state/store';

const FACT_SECONDS = 4.5;

export function Loader() {
  const { progress } = useProgress();
  const ready = useGarage((state) => state.ready);
  const facts = useMemo(loaderFacts, []);
  const [index, setIndex] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % facts.length), FACT_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [facts.length]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(timer);
  }, [ready]);

  if (gone) return null;
  return (
    <div className={ready ? 'loader is-done' : 'loader'} role="status">
      <p className="eyebrow">Loading the garage · {Math.round(progress)}%</p>
      <div className="loader-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <p className="loader-fact">{facts[index]}</p>
    </div>
  );
}
