import { PenLine } from 'lucide-react';
import type { Floor } from '../../shared/types';
import { numberedFloors } from '../lib/floors';
import { useI18n } from '../lib/i18n';

interface Props {
  floors: Floor[];
  activeFloorId: string;
  onActiveFloor: (id: string) => void;
  onManageFloors: () => void;
}

export function FloorSelector({ floors, activeFloorId, onActiveFloor, onManageFloors }: Props) {
  const { t } = useI18n();
  return <div className="floor-switcher">
    <div className="floor-switcher-heading"><span>{t('Active level')}</span><button title={t('Manage levels and blueprints')} aria-label={t('Manage levels and blueprints')} onClick={onManageFloors}><PenLine size={14} /></button></div>
    <div className="floor-switcher-buttons">{numberedFloors(floors).map(({ floor, number }) => <button key={floor.id} className={floor.id === activeFloorId ? 'active' : ''} aria-pressed={floor.id === activeFloorId} title={`${floor.name} · ${(floor.elevationMm / 1000).toFixed(1)} m`} onClick={() => onActiveFloor(floor.id)}><strong>{number}</strong><span>{floor.name}</span></button>)}</div>
  </div>;
}
