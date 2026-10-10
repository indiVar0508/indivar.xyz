export type Badge = 'verified' | 'illustrative' | 'game-lore';
export type Source = { label: string; url: string };
export type Fact = { text: string; badge: Badge; sources: Source[] };
export type Topic<Id extends string = string> = {
  id: Id;
  title: string;
  /** One line, shown on the hotspot and in the loader. */
  summary: string;
  real: Fact[];
  game: Fact[];
};
