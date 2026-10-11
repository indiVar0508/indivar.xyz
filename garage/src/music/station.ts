import { useGarage } from '../state/store';
import { createRadio } from './radio';
import { TRACKS } from './tracks';
import { youtubePlayer } from './youtube';

/** The garage's one radio, reporting into the store. */
export const station = createRadio(TRACKS, youtubePlayer, (radio) => useGarage.getState().setRadio(radio));
