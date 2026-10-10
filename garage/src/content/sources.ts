import type { Source } from './types';

export const SOURCES = {
  p60: { label: 'Wikipedia: BMW P60B40', url: 'https://en.wikipedia.org/wiki/BMW_P60B40' },
  m3: { label: 'Wikipedia: BMW M3, E46 motorsport', url: 'https://en.wikipedia.org/wiki/BMW_M3' },
  bmwClassic: { label: 'BMW Group Classic: M3 GTR (E46)', url: 'https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-900-1.bmw-m3-gtr-e46.html' },
  encycarpedia: { label: 'Encycarpedia: M3 GTR Strassenversion', url: 'https://www.encycarpedia.com/bmw/01-m3-gtr-e46-strassenversion-coupe' },
  nfsCar: { label: 'NFS Wiki: BMW M3 GTR (E46)', url: 'https://nfs.fandom.com/wiki/BMW_M3_GTR_(E46)' },
  nfsPerformance: { label: 'NFS Wiki: Most Wanted performance parts', url: 'https://nfs.fandom.com/wiki/Need_for_Speed:_Most_Wanted_(2005)/Performance_Parts' },
  nfsMw: { label: 'Wikipedia: Need for Speed: Most Wanted (2005)', url: 'https://en.wikipedia.org/wiki/Need_for_Speed:_Most_Wanted_(2005_video_game)' },
} as const satisfies Record<string, Source>;
