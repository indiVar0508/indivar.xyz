import { SOURCES as S } from './sources';
import type { Topic } from './types';

export const ENGINE_TOPIC_IDS = ['layout', 'heads', 'crank', 'restrictors', 'dry-sump', 'fuel', 'headers', 'game-turbo'] as const;
export type EngineTopicId = (typeof ENGINE_TOPIC_IDS)[number];

export const ENGINE_OVERVIEW: Topic<'overview'> = {
  id: 'overview',
  title: 'P60B40 V8',
  summary: 'BMW Motorsport’s 4.0-litre race V8.',
  real: [
    { text: 'A naturally aspirated 4.0-litre V8 built by BMW M for sports-car racing from 2001 to 2005.', badge: 'verified', sources: [S.p60] },
    { text: 'About 444 bhp at 7,500 rpm in race trim with air restrictors; the 10 road cars were rated at 380 hp.', badge: 'verified', sources: [S.p60, S.bmwClassic] },
  ],
  game: [],
};

export const ENGINE_TOPICS: Record<EngineTopicId, Topic<EngineTopicId>> = {
  layout: {
    id: 'layout',
    title: '90° V8 layout',
    summary: '3,997 cc from eight 94 mm cylinders.',
    real: [
      { text: 'A naturally aspirated 90° V8, mounted lengthways at the front and driving the rear wheels.', badge: 'verified', sources: [S.p60] },
      { text: 'Bore 94 mm and stroke 72 mm give 3,997 cc.', badge: 'verified', sources: [S.p60] },
      { text: 'The bore is wider than the stroke is long (oversquare). A short stroke keeps piston speeds down, which lets an engine rev higher.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  heads: {
    id: 'heads',
    title: 'Cylinder heads',
    summary: 'Twin cams per bank, four valves per cylinder.',
    real: [
      { text: 'Double overhead camshafts on each bank, with four valves per cylinder.', badge: 'verified', sources: [S.p60] },
      { text: 'The block and cylinder heads are aluminium.', badge: 'verified', sources: [S.p60] },
      { text: 'Compression ratio is listed as 12.0:1; another spec sheet gives 11:1.', badge: 'verified', sources: [S.p60, S.encycarpedia] },
    ],
    game: [],
  },
  crank: {
    id: 'crank',
    title: 'Flat-plane crankshaft',
    summary: 'Firing order 1-8-3-6-4-5-2-7.',
    real: [
      { text: 'A flat-plane crankshaft running in five main bearings.', badge: 'verified', sources: [S.p60] },
      { text: 'Firing order 1-8-3-6-4-5-2-7.', badge: 'verified', sources: [S.p60] },
      { text: 'With BMW’s usual numbering (1–4 on one bank, 5–8 on the other) that order alternates banks, so each bank’s exhaust pulses are evenly spaced. That gives flat-plane V8s a high wail instead of a cross-plane burble.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  restrictors: {
    id: 'restrictors',
    title: 'Air restrictors',
    summary: 'Two 30.4 mm inlets cap its power for racing.',
    real: [
      { text: 'Race rules fitted two 30.4 mm air restrictors; with them it made about 444 bhp at 7,500 rpm.', badge: 'verified', sources: [S.p60] },
      { text: 'Without restrictors, estimates run to 650–700 bhp.', badge: 'verified', sources: [S.p60] },
      { text: 'The 10 road cars were rated at 380 hp at 7,000 rpm.', badge: 'verified', sources: [S.bmwClassic] },
      { text: 'A restrictor limits how much air an engine can breathe at high rpm, which lets rule makers balance very different cars.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'dry-sump': {
    id: 'dry-sump',
    title: 'Dry sump',
    summary: 'Oil lives in a separate tank.',
    real: [
      { text: 'Dry-sump lubrication; the engine is water-cooled.', badge: 'verified', sources: [S.p60] },
      { text: 'Scavenge pumps move oil to a separate tank, so the engine can sit lower and won’t starve of oil in hard corners. The tank and line positions shown are illustrative.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  fuel: {
    id: 'fuel',
    title: 'Fuel injection',
    summary: 'Multi-port injection.',
    real: [
      { text: 'Multi-port fuel injection.', badge: 'verified', sources: [S.p60] },
      { text: 'In a multi-port system each cylinder has its own injector, spraying into its intake port.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  headers: {
    id: 'headers',
    title: 'Exhaust headers',
    summary: 'Shown for illustration.',
    real: [
      { text: 'Tuned headers use pipe length to help pull spent gas out of each cylinder. No source we found shows the P60B40’s exact header layout, so this one is illustrative.', badge: 'illustrative', sources: [] },
    ],
    game: [],
  },
  'game-turbo': {
    id: 'game-turbo',
    title: 'Turbo? Only in the game',
    summary: 'The real engine is naturally aspirated.',
    real: [
      { text: 'The real P60B40 is naturally aspirated: no turbocharger or supercharger.', badge: 'verified', sources: [S.p60] },
    ],
    game: [
      { text: 'Most Wanted lets you upgrade the engine, transmission, suspension, nitrous, tyres, brakes, and a turbocharger or supercharger, in Race, Pro, Super Pro and Ultimate packages.', badge: 'game-lore', sources: [S.nfsPerformance] },
    ],
  },
};
