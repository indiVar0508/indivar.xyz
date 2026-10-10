import type { CarTopicId } from '../content/car';
import type { EngineTopicId } from '../content/engine';

export type View =
  | { kind: 'showroom' }
  | { kind: 'focus'; id: Exclude<CarTopicId, 'hood'> }
  | { kind: 'bay' }
  | { kind: 'bay-part'; id: EngineTopicId };

export type ViewAction =
  | { type: 'select-car'; id: CarTopicId }
  | { type: 'select-part'; id: EngineTopicId }
  | { type: 'back' }
  | { type: 'close-hood' };

export const SHOWROOM: View = { kind: 'showroom' };

export const isHoodOpen = (view: View): boolean => view.kind === 'bay' || view.kind === 'bay-part';

export function reduceView(view: View, action: ViewAction): View {
  switch (action.type) {
    case 'select-car':
      return action.id === 'hood' ? { kind: 'bay' } : { kind: 'focus', id: action.id };
    case 'select-part':
      return { kind: 'bay-part', id: action.id };
    case 'back':
      return view.kind === 'bay-part' ? { kind: 'bay' } : SHOWROOM;
    case 'close-hood':
      return isHoodOpen(view) ? SHOWROOM : view;
  }
}
