import { CAR_TOPICS, GEARBOX_RUNNING } from '../content/car';
import { ENGINE_OVERVIEW, ENGINE_RUNNING, ENGINE_TOPICS } from '../content/engine';
import type { Topic } from '../content/types';
import type { View, XrayView } from '../state/view';

/** The panel's topic for a view. Looking inside from the bay explains how the engine runs, or the gearbox works. */
export function topicFor(view: View, inside = false, xray: XrayView = 'engine'): Topic | null {
  switch (view.kind) {
    case 'showroom':
      return null;
    case 'focus':
      return CAR_TOPICS[view.id];
    case 'bay':
      if (!inside) return ENGINE_OVERVIEW;
      return xray === 'engine' ? ENGINE_RUNNING : GEARBOX_RUNNING;
    case 'bay-part':
      return ENGINE_TOPICS[view.id];
  }
}

const INSIDE_CRUMB: Record<XrayView, string> = { engine: 'Inside', gearbox: 'Gearbox', both: 'Engine and gearbox' };

export function breadcrumbFor(view: View, inside = false, xray: XrayView = 'engine'): string[] {
  switch (view.kind) {
    case 'showroom':
      return ['Garage'];
    case 'focus':
      return ['Garage', CAR_TOPICS[view.id].title];
    case 'bay':
      return inside ? ['Garage', 'Engine bay', INSIDE_CRUMB[xray]] : ['Garage', 'Engine bay'];
    case 'bay-part':
      return ['Garage', 'Engine bay', ENGINE_TOPICS[view.id].title];
  }
}
