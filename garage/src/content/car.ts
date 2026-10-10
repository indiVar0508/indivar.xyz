import { SOURCES as S } from './sources';
import type { Topic } from './types';

export const CAR_TOPIC_IDS = ['hood', 'front-aero', 'rear-wing', 'wheels', 'history', 'livery'] as const;
export type CarTopicId = (typeof CAR_TOPIC_IDS)[number];

export const CAR_TOPICS: Record<CarTopicId, Topic<CarTopicId>> = {
  hood: {
    id: 'hood',
    title: 'Vented hood',
    summary: 'Pop the hood to explore the P60B40 V8.',
    real: [
      { text: 'The road-going M3 GTR got an engine hood with extra ventilation openings.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'Vents let hot air escape a tightly packed engine bay, which helps cooling and cuts lift over the hood.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'front-aero': {
    id: 'front-aero',
    title: 'Extended aprons',
    summary: 'Deeper front and rear aprons than a standard M3.',
    real: [
      { text: 'BMW extended the front and rear aprons of the M3 GTR road car.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A low front splitter limits the air rushing under the car, which cuts front-end lift at speed.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'Fans note the game car lacks the air intake and tow hook below the real car’s passenger-side headlight.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  'rear-wing': {
    id: 'rear-wing',
    title: 'Rear wing',
    summary: 'The large rear wing of the GTR road car.',
    real: [
      { text: 'A large rear wing is one of the visible differences between the M3 GTR road car and a standard M3.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A wing trades a little drag for downforce, pressing the rear tyres into the road in fast corners.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'The game car has LED tail lights, which BMW only introduced to the E46 range in April 2003.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  wheels: {
    id: 'wheels',
    title: 'Wheels and brakes',
    summary: 'Race wheels over big discs and red calipers.',
    real: [
      { text: 'Large wheels leave room for big brake discs and calipers, which need space and airflow to shed heat.', badge: 'illustrative', sources: [] },
    ],
    game: [
      { text: 'On the box art the car wears ADR M Sport wheels, not the BBS Motorsport RE594 and RE595 wheels fans associate with the race car.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  history: {
    id: 'history',
    title: 'Racing history',
    summary: 'ALMS GT winner in 2001; Nürburgring 24 Hours winner in 2004 and 2005.',
    real: [
      { text: 'Introduced in February 2001 with a 330 kW (443 hp) version of the 3,997 cc P60 V8.', badge: 'verified', sources: [S.m3] },
      { text: 'Won the 2001 American Le Mans Series GT category, driven by Jörg Müller.', badge: 'verified', sources: [S.m3] },
      { text: 'Rivals argued it was a prototype. BMW offered 10 road cars to meet the 2001 rules, and withdrew the car when 2002 rules demanded 100 cars and 1,000 engines.', badge: 'verified', sources: [S.m3, S.p60] },
      { text: 'Schnitzer Motorsport brought it back for the Nürburgring 24 Hours in 2003, and it won the race in 2004 and 2005.', badge: 'verified', sources: [S.m3] },
    ],
    game: [
      { text: 'It is the car on the cover of Need for Speed: Most Wanted (2005).', badge: 'game-lore', sources: [S.nfsMw] },
      { text: 'An unused vinyl in the game resembles the 2004 Schnitzer livery that won the Nürburgring 24 Hours.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
  livery: {
    id: 'livery',
    title: 'Hero livery',
    summary: 'Your car, until Razor takes it.',
    real: [],
    game: [
      { text: 'It is your car at the start of the career, until it is sabotaged. You win it back by beating Blacklist #1, Clarence “Razor” Callahan.', badge: 'game-lore', sources: [S.nfsCar] },
      { text: 'The blue-and-silver hero livery was concepted by Gabriel Frizzera of EA Black Box’s concept team.', badge: 'game-lore', sources: [S.nfsCar] },
      { text: 'In the game it has strong handling, acceleration and top speed, but only a mediocre nitrous boost.', badge: 'game-lore', sources: [S.nfsCar] },
    ],
  },
};
