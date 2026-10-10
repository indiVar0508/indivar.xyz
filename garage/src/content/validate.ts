import type { Topic } from './types';

/** Returns every rule violation in the content; an empty array means it is publishable. */
export function validateTopics(topics: readonly Topic[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics) {
    if (seen.has(topic.id)) errors.push(`duplicate topic id: ${topic.id}`);
    seen.add(topic.id);
    if (!topic.title.trim() || !topic.summary.trim()) errors.push(`${topic.id}: empty title or summary`);
    if (topic.real.length + topic.game.length === 0) errors.push(`${topic.id}: no facts`);
    for (const [tab, facts] of [['real', topic.real], ['game', topic.game]] as const) {
      facts.forEach((fact, index) => {
        const where = `${topic.id}.${tab}[${index}]`;
        if (!fact.text.trim()) errors.push(`${where}: empty text`);
        if (fact.badge !== 'illustrative' && fact.sources.length === 0) errors.push(`${where}: ${fact.badge} fact needs a source`);
        if (tab === 'game' && fact.badge !== 'game-lore') errors.push(`${where}: game tab facts must be game-lore`);
        if (tab === 'real' && fact.badge === 'game-lore') errors.push(`${where}: game-lore belongs in the game tab`);
        for (const source of fact.sources) {
          if (!source.url.startsWith('https://')) errors.push(`${where}: source must be https (${source.url})`);
        }
      });
    }
  }
  return errors;
}
