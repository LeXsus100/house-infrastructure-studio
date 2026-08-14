import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import type { ExportPreset, ProjectSnapshot } from '../../shared/types';
import { canvasToBlob, renderWallElevation, wallExportName } from '../lib/elevation';
import { useI18n } from '../lib/i18n';

interface Props { project: ProjectSnapshot; selectedWallId?: string; batch: boolean; onClose: () => void }

export function ElevationDialog({ project, selectedWallId, batch, onClose }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = project.exportPresets[0];
  const [options, setOptions] = useState<ExportPreset>(base);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [manualWallIds, setManualWallIds] = useState<string[]>(selectedWallId ? [selectedWallId] : []);
  const [scope, setScope] = useState<'rooms' | 'manual' | 'all'>(selectedWallId ? 'manual' : 'rooms');
  const [busy, setBusy] = useState(false);
  const walls = useMemo(() => scope === 'all' ? project.walls : scope === 'manual' ? project.walls.filter((wall) => manualWallIds.includes(wall.id)) : project.walls.filter((wall) => project.rooms.some((room) => roomIds.includes(room.id) && room.wallIds.includes(wall.id))), [project, scope, roomIds, manualWallIds]);
  const previewWall = project.walls.find((wall) => wall.id === selectedWallId) ?? walls[0] ?? project.walls[0];

  useEffect(() => { if (canvasRef.current && previewWall) renderWallElevation(canvasRef.current, project, previewWall, options); }, [project, previewWall, options]);
  const patch = <K extends keyof ExportPreset>(key: K, value: ExportPreset[K]) => setOptions((current) => ({ ...current, [key]: value }));
  const downloadBlob = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const exportOne = async () => {
    if (!previewWall) return; setBusy(true);
    try { const canvas = document.createElement('canvas'); renderWallElevation(canvas, project, previewWall, options); downloadBlob(await canvasToBlob(canvas), wallExportName(project, previewWall)); } finally { setBusy(false); }
  };
  const exportBatch = async () => {
    if (!walls.length) return; setBusy(true);
    try { const zip = new JSZip(); for (const wall of walls) { const canvas = document.createElement('canvas'); renderWallElevation(canvas, project, wall, options); zip.file(wallExportName(project, wall), await canvasToBlob(canvas)); } const projectName = project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'house-project'; downloadBlob(await zip.generateAsync({ type: 'blob' }), `${projectName}_Wall-Schemes.zip`); } finally { setBusy(false); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="elevation-dialog" role="dialog" aria-modal="true" aria-label={t('Wall scheme export')}>
    <header><div><strong>{t(batch ? 'Batch wall schemes' : 'Wall scheme')}</strong><span>{t('Orthographic technical scheme · A4 landscape · generated locally')}</span></div><button aria-label={t('Close dialog')} onClick={onClose}>×</button></header>
    <div className="elevation-body"><aside className="export-options">
      {batch && <section><h3>{t('Export scope')}</h3><div className="segmented"><button className={scope === 'rooms' ? 'active' : ''} onClick={() => setScope('rooms')}>{t('Rooms')}</button><button className={scope === 'manual' ? 'active' : ''} onClick={() => setScope('manual')}>{t('Walls')}</button><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{t('All')}</button></div>{scope === 'rooms' && <div className="check-list">{project.rooms.map((room) => <label key={room.id}><input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => setRoomIds((ids) => ids.includes(room.id) ? ids.filter((id) => id !== room.id) : [...ids, room.id])} />{room.name}</label>)}</div>}{scope === 'manual' && <div className="check-list">{project.walls.map((wall) => <label key={wall.id}><input type="checkbox" checked={manualWallIds.includes(wall.id)} onChange={() => setManualWallIds((ids) => ids.includes(wall.id) ? ids.filter((id) => id !== wall.id) : [...ids, wall.id])} />{wall.name}</label>)}</div>}</section>}
      <section><h3>{t('Image')}</h3><button className="wide" onClick={() => setOptions((current) => ({ ...current, width: 842, height: 595, scale: 5 }))}>{t('Reset to A4 landscape')}</button><label className="field"><span>{t('Width')}</span><input type="number" min="400" value={options.width} onChange={(event) => patch('width', Number(event.target.value))} /></label><label className="field"><span>{t('Height')}</span><input type="number" min="300" value={options.height} onChange={(event) => patch('height', Number(event.target.value))} /></label><label className="field"><span>{t('Resolution scale')}</span><select value={options.scale} onChange={(event) => patch('scale', Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option><option value="5">5× · {t('print')}</option></select></label><label className="field"><span>{t('Style')}</span><select value={options.style} onChange={(event) => patch('style', event.target.value as 'light' | 'dark')}><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option></select></label></section>
      <section><h3>{t('Content')}</h3>{([['transparent','Transparent background'],['showWallOutline','Wall outline'],['showDimensions','Dimensions'],['showLabels','Labels'],['showRouteMetadata','Route metadata'],['showLegend','Legend'],['showTitleBlock','Title block'],['includeRoomName','Room name'],['includeWallName','Wall name'],['includeExportDate','Export date']] as Array<[keyof ExportPreset,string]>).map(([key,label]) => <label className="check-row" key={key}><input type="checkbox" checked={Boolean(options[key])} onChange={(event) => patch(key, event.target.checked as never)} />{t(label)}</label>)}</section>
    </aside><main className="elevation-preview"><div className="canvas-wrap">{previewWall ? <canvas ref={canvasRef} /> : <div className="empty-panel"><strong>{t('No wall available')}</strong><p>{t('Draw or select a wall first.')}</p></div>}</div>{batch && <div className="batch-preview"><strong>{walls.length} {t(walls.length === 1 ? 'file will be generated' : 'files will be generated')}</strong><div>{walls.map((wall) => <code key={wall.id}>{wallExportName(project, wall)}</code>)}</div></div>}</main></div>
    <footer><button onClick={onClose}>{t('Cancel')}</button><button className="primary" disabled={busy || !previewWall || (batch && !walls.length)} onClick={batch ? exportBatch : exportOne}>{busy ? t('Generating…') : batch ? `${t('Export')} ${walls.length} PNG · ZIP` : t('Export PNG')}</button></footer>
  </div></div>;
}
