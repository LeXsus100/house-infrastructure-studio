import { useRef, useState } from 'react';
import { Camera, Trash2, Upload, X } from 'lucide-react';
import type { PhotoCategory, PhotoMarker, ProjectPhoto } from '../../shared/types';
import { api } from '../api';
import { useI18n } from '../lib/i18n';
import { PHOTO_CATEGORIES } from './PhotoSidebar';

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error('Could not read image.')); reader.readAsDataURL(file); });

interface Props {
  projectId: string;
  marker: PhotoMarker;
  onUpdate: (patch: Partial<PhotoMarker>) => void;
  onAddPhotos: (photos: ProjectPhoto[]) => void;
  onRemovePhoto: (photo: ProjectPhoto) => void;
  onDeleteMarker: () => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}

export function PhotoMarkerDialog({ projectId, marker, onUpdate, onAddPhotos, onRemovePhoto, onDeleteMarker, onClose, onNotice }: Props) {
  const { t } = useI18n(); const input = useRef<HTMLInputElement>(null); const [uploading, setUploading] = useState(false); const [activePhotoId, setActivePhotoId] = useState(marker.photos[0]?.id);
  const active = marker.photos.find((photo) => photo.id === activePhotoId) ?? marker.photos[0];
  const upload = async (files: FileList | null) => { if (!files?.length) return; setUploading(true); try { const uploaded: ProjectPhoto[] = []; for (const file of Array.from(files)) { if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error(t('Only JPEG, PNG, and WebP images are supported.')); const dataUrl = await readDataUrl(file); uploaded.push(await api.uploadPhoto(projectId, marker.id, file, dataUrl)); } onAddPhotos(uploaded); setActivePhotoId(uploaded[0]?.id); onNotice(t('Photos saved in the local project folder.')); } catch (error) { onNotice(error instanceof Error ? error.message : t('Photo upload failed.')); } finally { setUploading(false); if (input.current) input.current.value = ''; } };
  return <div className="modal-backdrop photo-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="photo-dialog" role="dialog" aria-modal="true" aria-label={t('Photo point')}><header><div><Camera size={18} /><span><strong>{marker.title}</strong><small>{t(PHOTO_CATEGORIES.find((item) => item.id === marker.category)?.label ?? 'Other')}</small></span></div><button aria-label={t('Close dialog')} onClick={onClose}><X size={17} /></button></header><div className="photo-dialog-body"><aside><label><span>{t('Name')}</span><input value={marker.title} onChange={(event) => onUpdate({ title: event.target.value })} /></label><label><span>{t('Category')}</span><select value={marker.category} onChange={(event) => onUpdate({ category: event.target.value as PhotoCategory })}>{PHOTO_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{t(category.label)}</option>)}</select></label><label><span>{t('Description')}</span><textarea value={marker.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label><div className="photo-position"><span>X {(marker.position.x / 1000).toFixed(2)} m</span><span>Y {(marker.position.z / 1000).toFixed(2)} m</span><span>Z {(marker.position.y / 1000).toFixed(2)} m</span></div><button className="primary wide" disabled={uploading} onClick={() => input.current?.click()}><Upload size={15} />{t(uploading ? 'Saving photos…' : 'Add pictures')}</button><button className="danger wide" onClick={onDeleteMarker}><Trash2 size={15} />{t('Delete photo point')}</button></aside><main>{active ? <><div className="photo-main-preview"><img src={api.photoUrl(projectId, active.storedFileName)} alt={active.caption || marker.title} /></div><div className="photo-gallery">{marker.photos.map((photo) => <div key={photo.id} className={`photo-gallery-item ${photo.id === active.id ? 'active' : ''}`}><button className="photo-gallery-select" onClick={() => setActivePhotoId(photo.id)}><img src={api.photoUrl(projectId, photo.storedFileName)} alt={photo.caption || photo.originalFileName} /><span>{photo.originalFileName}</span></button><button className="photo-delete" aria-label={t('Delete picture')} onClick={() => onRemovePhoto(photo)}><Trash2 size={12} /></button></div>)}</div></> : <div className="photo-empty"><Camera size={36} /><strong>{t('No pictures attached')}</strong><span>{t('Add one or more local images to this point.')}</span></div>}</main></div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void upload(event.target.files)} /></div></div>;
}
