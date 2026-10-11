import { describe, expect, it } from 'vitest';
import { CAR_TOPIC_IDS, CAR_TOPICS } from './car';
import { ENGINE_OVERVIEW, ENGINE_RUNNING, ENGINE_TOPIC_IDS, ENGINE_TOPICS } from './engine';
import { loaderFacts } from './loaderFacts';
import type { Topic } from './types';
import { validateTopics } from './validate';

const all: Topic[] = [...Object.values(CAR_TOPICS), ...Object.values(ENGINE_TOPICS), ENGINE_OVERVIEW, ENGINE_RUNNING];

describe('content', () => {
  it('passes validation', () => {
    expect(validateTopics(all)).toEqual([]);
  });

  it('keys every topic by its own id', () => {
    for (const id of CAR_TOPIC_IDS) expect(CAR_TOPICS[id].id).toBe(id);
    for (const id of ENGINE_TOPIC_IDS) expect(ENGINE_TOPICS[id].id).toBe(id);
  });

  it('never claims the real engine has forced induction', () => {
    const real = all.flatMap((t) => t.real).map((f) => f.text.toLowerCase());
    expect(real.filter((text) => /turbo|supercharg/.test(text) && !/no turbo|naturally aspirated/.test(text))).toEqual([]);
  });

  it('feeds only verified facts to the loader', () => {
    const verified = new Set(all.flatMap((t) => t.real).filter((f) => f.badge === 'verified').map((f) => f.text));
    expect(loaderFacts().length).toBeGreaterThan(8);
    for (const text of loaderFacts()) expect(verified.has(text)).toBe(true);
  });
});

describe('validateTopics', () => {
  it('flags facts that break the badge rules', () => {
    const bad: Topic = {
      id: 'bad',
      title: 'Bad',
      summary: 'x',
      real: [
        { text: 'x', badge: 'verified', sources: [] },
        { text: 'y', badge: 'game-lore', sources: [{ label: 'a', url: 'http://a' }] },
      ],
      game: [{ text: 'z', badge: 'verified', sources: [{ label: 'a', url: 'https://a' }] }],
    };
    expect(validateTopics([bad])).toEqual([
      'bad.real[0]: verified fact needs a source',
      'bad.real[1]: game-lore belongs in the game tab',
      'bad.real[1]: source must be https (http://a)',
      'bad.game[0]: game tab facts must be game-lore',
    ]);
  });

  it('flags duplicate ids, blank text and empty topics', () => {
    const empty: Topic = { id: 'e', title: ' ', summary: 's', real: [], game: [] };
    expect(validateTopics([empty, { ...empty, title: 'E' }])).toEqual([
      'e: empty title or summary',
      'e: no facts',
      'duplicate topic id: e',
      'e: no facts',
    ]);
  });
});
