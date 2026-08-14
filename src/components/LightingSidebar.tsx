import type { Floor } from '../../shared/types';
import { FloorSelector } from './FloorSelector';

interface Props {
  floors: Floor[];
  activeFloorId: string;
  onActiveFloor: (id: string) => void;
  onManageFloors: () => void;
}
/** Lighting mode deliberately exposes only level navigation. */
export function LightingSidebar(props: Props) {
  return <aside className="left-sidebar lighting-sidebar"><FloorSelector {...props} /></aside>;
}
