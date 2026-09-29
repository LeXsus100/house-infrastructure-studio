import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { sanitizeFilename } from '../lib/geometry';
import { useI18n } from '../lib/i18n';
import { imagePdf } from '../lib/pdf';
import { createViewExportSvg, VIEW_PRINT_LAYOUTS, type ViewPrintLayoutId } from '../lib/viewExport';

interface Props { source: string; projectName: string; floorName: string; northAngleRad: number; onClose: () => void }

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not render the print layout.')); image.src = source;
  });
}

async function rasterizeSvg(svg: string, width: number, height: number, type: 'image/png' | 'image/jpeg', quality?: number) {
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(source); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not create the print image.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the print image.')), type, quality));
  } finally { URL.revokeObjectURL(source); }
}

export function ViewSnapshotDialog({ source, projectName, floorName, northAngleRad, onClose }: Props) {
  const { language, t } = useI18n(); const [layoutId, setLayoutId] = useState<ViewPrintLayoutId>('A4');
  const [caption, setCaption] = useState(`${t('Current 3D view')} · ${floorName}`); const [sourceSize, setSourceSize] = useState({ width: 16, height: 9 }); const [exporting, setExporting] = useState<'png' | 'pdf'>();
  useEffect(() => { const image = new Image(); image.onload = () => setSourceSize({ width: image.naturalWidth, height: image.naturalHeight }); image.src = source; }, [source]);
  const svg = useMemo(() => createViewExportSvg({ source, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height, projectName, caption, dateLabel: new Date().toLocaleDateString(language === 'it' ? 'it-IT' : 'en-GB'), northAngleRad, layoutId }), [caption, language, layoutId, northAngleRad, projectName, source, sourceSize]);
  const previewUrl = useMemo(() => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), [svg]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  const layout = VIEW_PRINT_LAYOUTS[layoutId]; const baseName = `${sanitizeFilename(projectName)}_${sanitizeFilename(floorName)}_Current-view_${layoutId}`;
  const savePng = async () => { setExporting('png'); try { downloadBlob(await rasterizeSvg(svg, layout.pixelWidth, layout.pixelHeight, 'image/png'), `${baseName}.png`); } finally { setExporting(undefined); } };
  const savePdf = async () => {
    setExporting('pdf'); try {
      const jpeg = await rasterizeSvg(svg, layout.pixelWidth, layout.pixelHeight, 'image/jpeg', .96);
      downloadBlob(imagePdf(new Uint8Array(await jpeg.arrayBuffer()), layout.pixelWidth, layout.pixelHeight, layout.pageWidthPt, layout.pageHeightPt), `${baseName}.pdf`);
    } finally { setExporting(undefined); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="snapshot-dialog" role="dialog" aria-modal="true" aria-label={t('Current view image export')}><header><div><strong>{t('Current View - Export')}</strong></div><label className="snapshot-caption"><span>{t('Export caption')}</span><input value={caption} onChange={(event) => setCaption(event.target.value)} /></label><button aria-label={t('Close dialog')} onClick={onClose}>×</button></header><main className="snapshot-preview"><div className="canvas-wrap"><img src={previewUrl} alt={t('Current view image')} /></div></main><footer><label className="snapshot-paper-size"><span>{t('Paper size')}</span><select value={layoutId} onChange={(event) => setLayoutId(event.target.value as ViewPrintLayoutId)}>{(Object.keys(VIEW_PRINT_LAYOUTS) as ViewPrintLayoutId[]).map((id) => <option key={id} value={id}>{id} · {t('landscape')}</option>)}</select></label><div><button disabled={!!exporting} onClick={onClose}>{t('Cancel')}</button><button disabled={!!exporting} onClick={() => void savePng()}><Download size={15} /> {t(exporting === 'png' ? 'Preparing high-resolution file…' : 'Save PNG')}</button><button className="primary" disabled={!!exporting} onClick={() => void savePdf()}><FileText size={15} /> {t(exporting === 'pdf' ? 'Preparing high-resolution file…' : 'Save PDF')}</button></div></footer></div></div>;
}
