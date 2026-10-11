import { CAR_TOPICS } from '../content/car';
import { ENGINE_OVERVIEW, ENGINE_RUNNING, ENGINE_TOPICS } from '../content/engine';
import type { Topic } from '../content/types';
import type { View } from '../state/view';

/** The panel's topic for a view. Looking inside from the bay explains how the engine runs. */
export function topicFor(view: View, inside = false): Topic | null {
  switch (view.kind) {
    case 'showroom':
      return null;
    case 'focus':
      return CAR_TOPICS[view.id];
    case 'bay':
      return inside ? ENGINE_RUNNING : ENGINE_OVERVIEW;
    case 'bay-part':
      return ENGINE_TOPICS[view.id];
  }
}

export function breadcrumbFor(view: View, inside = false): string[] {
  switch (view.kind) {
    case 'showroom':
      return ['Garage'];
    case 'focus':
      return ['Garage', CAR_TOPICS[view.id].title];
    case 'bay':
      return inside ? ['Garage', 'Engine bay', 'Inside'] : ['Garage', 'Engine bay'];
    case 'bay-part':
      return ['Garage', 'Engine bay', ENGINE_TOPICS[view.id].title];
  }
}
