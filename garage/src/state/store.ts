import { create } from 'zustand';
import { FORCED_QUALITY } from '../qa';
import { initialQuality, readDeviceHints, type Quality } from './quality';
import { reduceView, SHOWROOM, type View, type ViewAction } from './view';

export type GarageStore = {
  view: View;
  quality: Quality;
  /** True when `?quality=` pinned the tier, so the frame monitor must leave it alone. */
  qualityLocked: boolean;
  reducedMotion: boolean;
  ready: boolean;
  soundOn: boolean;
  ownTrack: string | null;
  trackError: string | null;
  /** Pixels at the bottom of the canvas hidden by the phone bottom sheet and its buttons; the camera frames above them. */
  coveredBottom: number;
  dispatch: (action: ViewAction) => void;
  setQuality: (quality: Quality) => void;
  setReady: () => void;
  setSound: (on: boolean) => void;
  setOwnTrack: (name: string | null) => void;
  setTrackError: (message: string | null) => void;
  setCoveredBottom: (pixels: number) => void;
};

const inBrowser = typeof window !== 'undefined';
const forced: Quality | null = FORCED_QUALITY === 'high' || FORCED_QUALITY === 'low' ? FORCED_QUALITY : null;

export const useGarage = create<GarageStore>()((set) => ({
  view: SHOWROOM,
  quality: forced ?? (inBrowser ? initialQuality(readDeviceHints()) : 'high'),
  qualityLocked: forced !== null,
  reducedMotion: inBrowser && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  ready: false,
  soundOn: false,
  ownTrack: null,
  trackError: null,
  coveredBottom: 0,
  dispatch: (action) =>
    set((state) => {
      const view = reduceView(state.view, action);
      return view === state.view ? state : { view };
    }),
  setQuality: (quality) => set({ quality }),
  setReady: () => set({ ready: true }),
  setSound: (soundOn) => set({ soundOn }),
  setOwnTrack: (ownTrack) => set({ ownTrack }),
  setTrackError: (trackError) => set({ trackError }),
  setCoveredBottom: (coveredBottom) => set({ coveredBottom }),
}));
