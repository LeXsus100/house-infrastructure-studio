import { Camera, X } from 'lucide-react';
import { useState } from 'react';
import type { PhotoCategory, Vec3 } from '../../shared/types';
import { useI18n } from '../lib/i18n';
import { PHOTO_CATEGORIES } from './PhotoSidebar';

interface Props {
  position: Vec3;
  initialCategory: PhotoCategory;
  suggestedName: string;
  onCreate: (values: { title: string; description: string; category: PhotoCategory }) => void;
  onClose: () => void;
}

export function PhotoPointCreateDialog({ position, initialCategory, suggestedName, onCreate, onClose }: Props) {
  const { t } = useI18n(); const [title, setTitle] = useState(suggestedName); const [description, setDescription] = useState(''); const [category, setCategory] = useState(initialCategory);
  return <div className="modal-backdrop photo-point-create-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="photo-point-create-dialog" role="dialog" aria-modal="true" aria-label={t('New photo point')} onSubmit={(event) => { event.preventDefault(); if (title.trim()) onCreate({ title: title.trim(), description: description.trim(), category }); }}><header><div><Camera size={17} /><span><strong>{t('New photo point')}</strong><small>X {(position.x / 1000).toFixed(2)} m · Y {(position.z / 1000).toFixed(2)} m · Z {(position.y / 1000).toFixed(2)} m</small></span></div><button type="button" aria-label={t('Close dialog')} onClick={onClose}><X size={16} /></button></header><div><label className="field"><span>{t('Name')}</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>{t('Category')}</span><select value={category} onChange={(event) => setCategory(event.target.value as PhotoCategory)}>{PHOTO_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label><label className="field"><span>{t('Description')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><footer><button type="button" onClick={onClose}>{t('Cancel')}</button><button className="primary" type="submit" disabled={!title.trim()}>{t('Create photo point')}</button></footer></form></div>;
}
