import { Camera, Check, Eye, EyeOff, Images } from 'lucide-react';
import type { Floor, PhotoCategory } from '../../shared/types';
import { useI18n } from '../lib/i18n';
import { FloorSelector } from './FloorSelector';

export const PHOTO_CATEGORIES: Array<{ id: PhotoCategory; label: string }> = [
  { id: 'finished-house', label: 'Finished house' }, { id: 'cable-systems', label: 'Cable systems' },
  { id: 'structural', label: 'Structural' }, { id: 'electrical', label: 'Electrical' },
  { id: 'data', label: 'Ethernet & data' }, { id: 'plumbing', label: 'Plumbing' },
  { id: 'hvac', label: 'HVAC' }, { id: 'security', label: 'Security' }, { id: 'other', label: 'Other' }
];

interface Props {
  floors: Floor[];
  activeFloorId: string;
  showAllFloors: boolean;
  placementActive: boolean;
  visibleCategories: Set<PhotoCategory>;
  counts: Partial<Record<PhotoCategory, number>>;
  onActiveFloor: (id: string) => void;
  onShowAllFloors: (show: boolean) => void;
  onPlacementActive: (active: boolean) => void;
  onToggleCategory: (category: PhotoCategory) => void;
  onSetAllCategories: (visible: boolean) => void;
  onManageFloors: () => void;
}

export function PhotoSidebar(props: Props) {
  const { t } = useI18n();
  return <aside className="left-sidebar photo-sidebar">
    <FloorSelector floors={props.floors} activeFloorId={props.activeFloorId} onActiveFloor={props.onActiveFloor} onManageFloors={props.onManageFloors} />
    <div className="photo-house-scope editor-house-scope"><button className={props.showAllFloors ? 'active' : ''} onClick={() => props.onShowAllFloors(!props.showAllFloors)}><Images size={16} /><span>{t('Full house')}</span></button></div>
    <section className="tool-section photo-placement"><h2>{t('Photo points')}</h2><button className={props.placementActive ? 'primary wide' : 'wide'} onClick={() => props.onPlacementActive(!props.placementActive)}><Camera size={17} />{t(props.placementActive ? 'Click the model to place' : 'Add photo point')}</button></section>
    <section className="tool-section photo-filters"><div className="section-title-row"><h2>{t('Photo filters')}</h2><span><button title={t('Show all')} onClick={() => props.onSetAllCategories(true)}><Eye size={14} /></button><button title={t('Hide all')} onClick={() => props.onSetAllCategories(false)}><EyeOff size={14} /></button></span></div><div>{PHOTO_CATEGORIES.map((category) => { const visible = props.visibleCategories.has(category.id); return <button key={category.id} className={visible ? 'visible' : ''} aria-pressed={visible} onClick={() => props.onToggleCategory(category.id)}><i>{visible ? <Eye size={15} /> : <EyeOff size={15} />}</i><span>{t(category.label)}</span><em>{props.counts[category.id] ?? 0}</em>{visible && <Check size={12} />}</button>; })}</div></section>
  </aside>;
}
