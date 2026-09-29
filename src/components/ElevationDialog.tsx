import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, Eye, EyeOff, FileText } from 'lucide-react';
import type { ExportPreset, ProjectSnapshot } from '../../shared/types';
import { canvasToBlob, createDefaultWallElevationContent, renderWallElevation, wallExportFiles, wallExportName, type WallElevationContent } from '../lib/elevation';
import { distance3, sanitizeFilename } from '../lib/geometry';
import { useI18n } from '../lib/i18n';
import { formatMeasurementLabel } from '../lib/measurement';
import { imagePdf } from '../lib/pdf';
import { VIEW_PRINT_LAYOUTS, type ViewPrintLayoutId } from '../lib/viewExport';

interface Props { project: ProjectSnapshot; selectedWallId?: string; batch: boolean; onClose: () => void }

interface ContentToggleProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function ContentToggle({ label, checked, disabled, onChange }: ContentToggleProps) {
  return <button type="button" className={`wall-content-toggle${checked ? ' active' : ''}`} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
    {checked ? <Eye size={15} /> : <EyeOff size={15} />}<span>{label}</span>
  </button>;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ElevationDialog({ project, selectedWallId, batch, onClose }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = project.exportPresets[0];
  const [options, setOptions] = useState<ExportPreset>(base);
  const [content, setContent] = useState<WallElevationContent>(() => createDefaultWallElevationContent(base));
  const [layoutId, setLayoutId] = useState<ViewPrintLayoutId>('A4');
  const [caption, setCaption] = useState('');
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [manualWallIds, setManualWallIds] = useState<string[]>(selectedWallId ? [selectedWallId] : []);
  const [scope, setScope] = useState<'rooms' | 'manual' | 'all'>(selectedWallId ? 'manual' : 'rooms');
  const [previewWallId, setPreviewWallId] = useState(selectedWallId ?? project.walls[0]?.id ?? '');
  const [exporting, setExporting] = useState<'png' | 'pdf'>();
  const walls = useMemo(() => scope === 'all' ? project.walls : scope === 'manual' ? project.walls.filter((wall) => manualWallIds.includes(wall.id)) : project.walls.filter((wall) => project.rooms.some((room) => roomIds.includes(room.id) && room.wallIds.includes(wall.id))), [project, scope, roomIds, manualWallIds]);
  const previewWall = project.walls.find((wall) => wall.id === previewWallId) ?? project.walls.find((wall) => wall.id === selectedWallId) ?? walls[0] ?? project.walls[0];
  const layout = VIEW_PRINT_LAYOUTS[layoutId];
  const previewPreset = useMemo(() => ({ ...options, width: layout.pageWidthPt, height: layout.pageHeightPt, scale: 1 }), [layout, options]);
  const exportPreset = useMemo(() => ({ ...options, width: layout.pageWidthPt, height: layout.pageHeightPt, scale: 5 }), [layout, options]);
  const previewDevices = useMemo(() => previewWall ? project.devices.filter((device) => device.wallId === previewWall.id && !device.hidden && !['door-opening', 'window-opening'].includes(device.typeId)) : [], [previewWall, project.devices]);
  const previewRoutes = useMemo(() => previewWall ? project.routes.filter((route) => route.wallIds.includes(previewWall.id) && !route.hidden) : [], [previewWall, project.routes]);
  const previewMeasurements = useMemo(() => previewWall ? project.measurements.filter((measurement) => measurement.wallId === previewWall.id && measurement.visible) : [], [previewWall, project.measurements]);

  useEffect(() => {
    if (canvasRef.current && previewWall) renderWallElevation(canvasRef.current, project, previewWall, previewPreset, content, caption);
  }, [caption, content, previewPreset, previewWall, project]);

  const patchOption = <K extends keyof ExportPreset>(key: K, value: ExportPreset[K]) => setOptions((current) => ({ ...current, [key]: value }));
  const patchContent = <K extends keyof WallElevationContent>(key: K, value: WallElevationContent[K]) => setContent((current) => ({ ...current, [key]: value }));
  const toggleItem = (key: 'hiddenDeviceIds' | 'hiddenRouteIds' | 'hiddenMeasurementIds', id: string) => setContent((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id] }));
  const renderExportCanvas = (wall: ProjectSnapshot['walls'][number], solidBackground = false) => {
    const canvas = document.createElement('canvas'); renderWallElevation(canvas, project, wall, solidBackground ? { ...exportPreset, transparent: false } : exportPreset, content, caption); return canvas;
  };
  const save = async (format: 'png' | 'pdf') => {
    if (!previewWall || batch && !walls.length) return;
    setExporting(format);
    try {
      if (batch) {
        const zip = new JSZip();
        for (const { wall, fileName } of wallExportFiles(project, walls, format)) {
          const canvas = renderExportCanvas(wall, format === 'pdf');
          if (format === 'png') zip.file(fileName, await canvasToBlob(canvas));
          else {
            const jpeg = await canvasToBlob(canvas, 'image/jpeg', .97);
            zip.file(fileName, imagePdf(new Uint8Array(await jpeg.arrayBuffer()), layout.pixelWidth, layout.pixelHeight, layout.pageWidthPt, layout.pageHeightPt));
          }
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${sanitizeFilename(project.title)}_Wall-Schemes-${format.toUpperCase()}.zip`);
      } else if (format === 'png') downloadBlob(await canvasToBlob(renderExportCanvas(previewWall)), wallExportName(project, previewWall));
      else {
        const jpeg = await canvasToBlob(renderExportCanvas(previewWall, true), 'image/jpeg', .97);
        downloadBlob(imagePdf(new Uint8Array(await jpeg.arrayBuffer()), layout.pixelWidth, layout.pixelHeight, layout.pageWidthPt, layout.pageHeightPt), wallExportName(project, previewWall, 'pdf'));
      }
    } finally { setExporting(undefined); }
  };

  const itemVisibility = (hiddenIds: string[], id: string) => !hiddenIds.includes(id);
  const setAllHidden = (key: 'hiddenDeviceIds' | 'hiddenRouteIds' | 'hiddenMeasurementIds', ids: string[], hidden: boolean) => setContent((current) => {
    const affected = new Set(ids);
    return { ...current, [key]: hidden ? [...new Set([...current[key], ...ids])] : current[key].filter((id) => !affected.has(id)) };
  });

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="snapshot-dialog wall-export-dialog" role="dialog" aria-modal="true" aria-label={t('Wall scheme export')}>
    <header><div><strong>{t(batch ? 'Batch Wall Schemes - Export' : 'Wall Scheme - Export')}</strong></div><label className="snapshot-caption"><span>{t('Export caption')}</span><input value={caption} onChange={(event) => setCaption(event.target.value)} /></label><button aria-label={t('Close dialog')} onClick={onClose}>×</button></header>
    <div className="wall-export-body"><aside className="wall-export-content" aria-label={t('Content')}>
      {batch && <section><h3>{t('Export scope')}</h3><div className="segmented"><button className={scope === 'rooms' ? 'active' : ''} onClick={() => setScope('rooms')}>{t('Rooms')}</button><button className={scope === 'manual' ? 'active' : ''} onClick={() => setScope('manual')}>{t('Walls')}</button><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{t('All')}</button></div>{scope === 'rooms' && <div className="check-list">{project.rooms.map((room) => <label key={room.id}><input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => setRoomIds((ids) => ids.includes(room.id) ? ids.filter((id) => id !== room.id) : [...ids, room.id])} />{room.name}</label>)}</div>}{scope === 'manual' && <div className="check-list">{project.walls.map((wall) => <label key={wall.id}><input type="checkbox" checked={manualWallIds.includes(wall.id)} onChange={() => setManualWallIds((ids) => ids.includes(wall.id) ? ids.filter((id) => id !== wall.id) : [...ids, wall.id])} />{wall.name}</label>)}</div>}</section>}
      <section><h3>{t('Sheet content')}</h3><div className="segmented"><button className={options.style === 'light' ? 'active' : ''} onClick={() => patchOption('style', 'light')}>{t('Light')}</button><button className={options.style === 'dark' ? 'active' : ''} onClick={() => patchOption('style', 'dark')}>{t('Dark')}</button></div><div className="wall-content-toggle-grid">
        <ContentToggle label={t('Wall outline')} checked={options.showWallOutline} onChange={(value) => patchOption('showWallOutline', value)} />
        <ContentToggle label={t('Wall dimensions')} checked={content.showWallDimensions} onChange={(value) => patchContent('showWallDimensions', value)} />
        <ContentToggle label={t('Legend')} checked={options.showLegend} onChange={(value) => patchOption('showLegend', value)} />
        <ContentToggle label={t('Title block')} checked={options.showTitleBlock} onChange={(value) => patchOption('showTitleBlock', value)} />
        <ContentToggle label={t('Room name')} checked={options.includeRoomName} disabled={!options.showTitleBlock} onChange={(value) => patchOption('includeRoomName', value)} />
        <ContentToggle label={t('Wall name')} checked={options.includeWallName} disabled={!options.showTitleBlock} onChange={(value) => patchOption('includeWallName', value)} />
        <ContentToggle label={t('Export date')} checked={options.includeExportDate} disabled={!options.showTitleBlock} onChange={(value) => patchOption('includeExportDate', value)} />
        <ContentToggle label={t('Transparent background')} checked={options.transparent} onChange={(value) => patchOption('transparent', value)} />
      </div></section>
      <section><div className="wall-content-section-heading"><h3>{t('Devices')} <span>{previewDevices.length - content.hiddenDeviceIds.filter((id) => previewDevices.some((device) => device.id === id)).length}/{previewDevices.length}</span></h3><div><button onClick={() => setAllHidden('hiddenDeviceIds', previewDevices.map((item) => item.id), false)}>{t('All')}</button><button onClick={() => setAllHidden('hiddenDeviceIds', previewDevices.map((item) => item.id), true)}>{t('None')}</button></div></div><div className="wall-content-toggle-grid">
        <ContentToggle label={t('Device geometry')} checked={content.showDevices} onChange={(value) => patchContent('showDevices', value)} />
        <ContentToggle label={t('Device names')} checked={content.showDeviceNames} disabled={!content.showDevices} onChange={(value) => patchContent('showDeviceNames', value)} />
        <ContentToggle label={t('Heights from floor')} checked={content.showDeviceHeights} disabled={!content.showDevices} onChange={(value) => patchContent('showDeviceHeights', value)} />
        <ContentToggle label={t('Horizontal positions')} checked={content.showDeviceOffsets} disabled={!content.showDevices} onChange={(value) => patchContent('showDeviceOffsets', value)} />
      </div>{previewDevices.length > 0 && <div className="wall-content-items">{previewDevices.map((device) => <ContentToggle key={device.id} label={device.name} checked={itemVisibility(content.hiddenDeviceIds, device.id)} disabled={!content.showDevices} onChange={() => toggleItem('hiddenDeviceIds', device.id)} />)}</div>}</section>
      <section><div className="wall-content-section-heading"><h3>{t('Routes')} <span>{previewRoutes.length - content.hiddenRouteIds.filter((id) => previewRoutes.some((route) => route.id === id)).length}/{previewRoutes.length}</span></h3><div><button onClick={() => setAllHidden('hiddenRouteIds', previewRoutes.map((item) => item.id), false)}>{t('All')}</button><button onClick={() => setAllHidden('hiddenRouteIds', previewRoutes.map((item) => item.id), true)}>{t('None')}</button></div></div><div className="wall-content-toggle-grid">
        <ContentToggle label={t('Route geometry')} checked={content.showRoutes} onChange={(value) => patchContent('showRoutes', value)} />
        <ContentToggle label={t('Route names')} checked={content.showRouteNames} disabled={!content.showRoutes} onChange={(value) => patchContent('showRouteNames', value)} />
        <ContentToggle label={t('Route metadata')} checked={content.showRouteMetadata} disabled={!content.showRoutes || !content.showRouteNames} onChange={(value) => patchContent('showRouteMetadata', value)} />
      </div>{previewRoutes.length > 0 && <div className="wall-content-items">{previewRoutes.map((route) => <ContentToggle key={route.id} label={route.name} checked={itemVisibility(content.hiddenRouteIds, route.id)} disabled={!content.showRoutes} onChange={() => toggleItem('hiddenRouteIds', route.id)} />)}</div>}</section>
      <section><div className="wall-content-section-heading"><h3>{t('Measurements')} <span>{previewMeasurements.length - content.hiddenMeasurementIds.filter((id) => previewMeasurements.some((measurement) => measurement.id === id)).length}/{previewMeasurements.length}</span></h3><div><button onClick={() => setAllHidden('hiddenMeasurementIds', previewMeasurements.map((item) => item.id), false)}>{t('All')}</button><button onClick={() => setAllHidden('hiddenMeasurementIds', previewMeasurements.map((item) => item.id), true)}>{t('None')}</button></div></div>
        <ContentToggle label={t('Measurement lines and labels')} checked={content.showMeasurements} onChange={(value) => patchContent('showMeasurements', value)} />
        {previewMeasurements.length > 0 && <div className="wall-content-items">{previewMeasurements.map((measurement) => <ContentToggle key={measurement.id} label={formatMeasurementLabel(measurement.text, distance3(measurement.start, measurement.end))} checked={itemVisibility(content.hiddenMeasurementIds, measurement.id)} disabled={!content.showMeasurements} onChange={() => toggleItem('hiddenMeasurementIds', measurement.id)} />)}</div>}
      </section>
    </aside><main className={`snapshot-preview wall-export-preview${batch ? ' batch' : ''}`}>{batch && walls.length > 1 && <label className="wall-preview-selector"><span>{t('Preview wall')}</span><select value={previewWall?.id ?? ''} onChange={(event) => setPreviewWallId(event.target.value)}>{walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}</select></label>}<div className="canvas-wrap">{previewWall ? <canvas ref={canvasRef} aria-label={t('Wall scheme preview')} /> : <div className="empty-panel"><strong>{t('No wall available')}</strong><p>{t('Draw or select a wall first.')}</p></div>}</div>{batch && <div className="batch-preview"><strong>{walls.length} {t(walls.length === 1 ? 'file will be generated' : 'files will be generated')}</strong><div>{wallExportFiles(project, walls).map(({ wall, fileName }) => <code key={wall.id}>{fileName}</code>)}</div></div>}</main></div>
    <footer><label className="snapshot-paper-size"><span>{t('Paper size')}</span><select value={layoutId} onChange={(event) => setLayoutId(event.target.value as ViewPrintLayoutId)}>{(Object.keys(VIEW_PRINT_LAYOUTS) as ViewPrintLayoutId[]).map((id) => <option key={id} value={id}>{id} · {t('landscape')}</option>)}</select></label><div><button disabled={!!exporting} onClick={onClose}>{t('Cancel')}</button><button disabled={!!exporting || !previewWall || batch && !walls.length} onClick={() => void save('png')}><Download size={15} /> {t(exporting === 'png' ? 'Preparing high-resolution file…' : batch ? 'Save PNG ZIP' : 'Save PNG')}</button><button className="primary" disabled={!!exporting || !previewWall || batch && !walls.length} onClick={() => void save('pdf')}><FileText size={15} /> {t(exporting === 'pdf' ? 'Preparing high-resolution file…' : batch ? 'Save PDF ZIP' : 'Save PDF')}</button></div></footer>
  </div></div>;
}
