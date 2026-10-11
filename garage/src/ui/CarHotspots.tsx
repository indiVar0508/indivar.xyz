import { carHotspot } from '../car/hotspots';
import type { CarRig } from '../car/prepareCar';
import { CAR_TOPIC_IDS, CAR_TOPICS } from '../content/car';
import { useGarage } from '../state/store';
import { isHoodOpen } from '../state/view';
import { Hotspot } from './Hotspot';

export function CarHotspots({ rig }: { rig: CarRig }) {
  const view = useGarage((state) => state.view);
  const dispatch = useGarage((state) => state.dispatch);
  if (isHoodOpen(view)) return null;
  return (
    <>
      {CAR_TOPIC_IDS.map((id) => {
        const { position, normal } = carHotspot(id, rig.anchors);
        return (
          <Hotspot
            key={id}
            position={position}
            normal={normal}
            label={CAR_TOPICS[id].title}
            summary={CAR_TOPICS[id].summary}
            selected={view.kind === 'focus' && view.id === id}
            onSelect={() => dispatch({ type: 'select-car', id })}
          />
        );
      })}
    </>
  );
}
