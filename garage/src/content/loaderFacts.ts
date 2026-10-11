import { CAR_TOPICS } from './car';
import { ENGINE_OVERVIEW, ENGINE_TOPICS } from './engine';

/** Verified facts shown while the garage loads. */
export function loaderFacts(): string[] {
  return [ENGINE_OVERVIEW, ...Object.values(CAR_TOPICS), ...Object.values(ENGINE_TOPICS)]
    .flatMap((topic) => topic.real)
    .filter((fact) => fact.badge === 'verified')
    .map((fact) => fact.text);
}
