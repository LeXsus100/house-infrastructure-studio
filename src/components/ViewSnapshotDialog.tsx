import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { sanitizeFilename } from '../lib/geometry';
import { useI18n } from '../lib/i18n';

interface Props { source: string; projectName: string; floorName: string; onClose: () => void }

export function ViewSnapshotDialog({ source, projectName, floorName, onClose }: Props) {
  const { language, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(842); const [height, setHeight] = useState(595); const [scale, setScale] = useState(5);
  useEffect(() => {
    const image = new Image(); image.onload = () => {
      const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
      canvas.width = width * scale; canvas.height = height * scale; const padding = 26 * scale; const footer = 48 * scale;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const availableWidth = canvas.width - padding * 2; const availableHeight = canvas.height - padding * 2 - footer; const ratio = Math.min(availableWidth / image.width, availableHeight / image.height);
      const drawWidth = image.width * ratio; const drawHeight = image.height * ratio; const x = (canvas.width - drawWidth) / 2; const y = padding + (availableHeight - drawHeight) / 2;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, x, y, drawWidth, drawHeight);
      ctx.strokeStyle = '#cbd3d0'; ctx.lineWidth = Math.max(1, scale); ctx.strokeRect(x, y, drawWidth, drawHeight);
      ctx.fillStyle = '#172126'; ctx.font = `bold ${14 * scale}px Manrope, sans-serif`; ctx.fillText(projectName, padding, canvas.height - 30 * scale);
      ctx.fillStyle = '#65716d'; ctx.font = `${9 * scale}px Manrope, sans-serif`; ctx.fillText(`${t('Current 3D view')} · ${floorName} · ${t('low-ink light scheme')}`, padding, canvas.height - 14 * scale);
      ctx.textAlign = 'right'; ctx.fillText(new Date().toLocaleDateString(language === 'it' ? 'it-IT' : 'en-GB'), canvas.width - padding, canvas.height - 14 * scale); ctx.textAlign = 'left';
    }; image.src = source;
  }, [source, projectName, floorName, width, height, scale, language, t]);
  const download = () => { const canvas = canvasRef.current; if (!canvas) return; const anchor = document.createElement('a'); anchor.href = canvas.toDataURL('image/png'); anchor.download = `${sanitizeFilename(projectName)}_${sanitizeFilename(floorName)}_Current-view.png`; anchor.click(); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="snapshot-dialog" role="dialog" aria-modal="true" aria-label={t('Current view image export')}><header><div><strong>{t('Current view image')}</strong><span>{t('Light, low-ink A4 layout · generated locally')}</span></div><button aria-label={t('Close dialog')} onClick={onClose}>×</button></header><div className="snapshot-body"><aside className="export-options"><section><h3>{t('Print layout')}</h3><button className="wide" onClick={() => { setWidth(842); setHeight(595); setScale(5); }}><Printer size={14} /> A4 {t('landscape')}</button><label className="field"><span>{t('Width')}</span><input type="number" min="400" value={width} onChange={(event) => setWidth(Math.max(400, Number(event.target.value)))} /></label><label className="field"><span>{t('Height')}</span><input type="number" min="300" value={height} onChange={(event) => setHeight(Math.max(300, Number(event.target.value)))} /></label><label className="field"><span>{t('Resolution scale')}</span><select value={scale} onChange={(event) => setScale(Number(event.target.value))}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}×{value === 5 ? ` · ${t('print')}` : ''}</option>)}</select></label><p className="muted compact">{t('The 3D scene is captured in light mode, placed on white paper, and uses no decorative background to reduce ink use.')}</p></section></aside><main className="snapshot-preview"><div className="canvas-wrap"><canvas ref={canvasRef} /></div></main></div><footer><button onClick={onClose}>{t('Cancel')}</button><button className="primary" onClick={download}><Download size={15} /> {t('Save PNG')}</button></footer></div></div>;
}
