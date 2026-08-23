import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, Crosshair, Eye, EyeOff, ImagePlus, Minus, Navigation, Plus, Ruler, Trash2 } from 'lucide-react';
import type { Floor, Vec2 } from '../../shared/types';
import { alignBlueprintToReference, blueprintPixelToWorld, setBlueprintNorthArrow, updateBlueprintTransformPreservingAlignment, worldToBlueprintPixel } from '../lib/blueprint';
import { DraftNumberInput } from './DraftNumberInput';
import { useI18n } from '../lib/i18n';

interface Props {
  floors: Floor[];
  activeFloorId: string;
  showAdjacentBlueprint: boolean;
  onShowAdjacentBlueprint: (visible: boolean) => void;
  onActiveFloor: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Floor>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}

type PointMode = 'calibration' | 'alignment' | 'north';

export function LevelManagerDialog(props: Props) {
  const { t } = useI18n();
  const ordered = useMemo(() => [...props.floors].sort((a, b) => a.sortOrder - b.sortOrder || a.elevationMm - b.elevationMm), [props.floors]);
  const selected = props.floors.find((floor) => floor.id === props.activeFloorId) ?? ordered[0];
  const [calibration, setCalibration] = useState<Vec2[]>([]);
  const [northPoints, setNorthPoints] = useState<Vec2[]>([]);
  const [pointMode, setPointMode] = useState<PointMode>('calibration');
  const [zoom, setZoom] = useState(1);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [referenceFloorId, setReferenceFloorId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setCalibration(selected?.blueprint?.scaleLinePx ? [...selected.blueprint.scaleLinePx] : []);
    setNorthPoints(selected?.blueprint?.northArrowPx ? [...selected.blueprint.northArrowPx] : []);
  }, [selected?.id]);

  const upload = (file?: File) => {
    if (!file || !selected) return;
    if (!file.type.startsWith('image/')) { props.onNotice('The blueprint must be an image file.'); return; }
    if (file.size > 8_000_000) { props.onNotice('Blueprint images are limited to 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => { setCalibration([]); setNorthPoints([]); setCalibrationOpen(true); props.onUpdate(selected.id, { blueprint: {
        dataUrl: String(reader.result), fileName: file.name, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        scaleMmPerPixel: 10, offsetXmm: 0, offsetZmm: 0, rotationDeg: 0, opacity: .42, visible: true
      } }); };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clickPreview = (event: MouseEvent<HTMLDivElement>) => {
    if (!selected?.blueprint) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * selected.blueprint.naturalWidth),
      z: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * selected.blueprint.naturalHeight)
    };
    if (pointMode === 'alignment') {
      const marked = { ...selected.blueprint, alignmentPointPx: point };
      const registered = referenceFloor?.blueprint?.alignmentPointPx ? alignBlueprintToReference(marked, referenceFloor.blueprint) : marked;
      props.onUpdate(selected.id, { blueprint: registered });
      if (referenceFloor?.blueprint?.alignmentPointPx) props.onNotice(`${selected.name} aligned to ${referenceFloor.name}.`);
    }
    else if (pointMode === 'north') setNorthPoints((current) => {
      const next = current.length >= 2 ? [point] : [...current, point];
      if (next.length === 2) props.onUpdate(selected.id, { blueprint: setBlueprintNorthArrow(selected.blueprint!, [next[0], next[1]]) });
      return next;
    });
    else setCalibration((current) => {
      const next = current.length >= 2 ? [point] : [...current, point];
      if (next.length === 2) props.onUpdate(selected.id, { blueprint: { ...selected.blueprint!, scaleLinePx: [next[0], next[1]] } });
      return next;
    });
  };

  const calibrationPixels = calibration.length === 2 ? Math.hypot(calibration[1].x - calibration[0].x, calibration[1].z - calibration[0].z) : 0;
  const referenceCandidates = props.floors.filter((floor) => floor.id !== selected?.id && floor.blueprint);
  const referenceFloor = referenceCandidates.find((floor) => floor.id === referenceFloorId) ?? referenceCandidates[0];
  const originPixel = selected?.blueprint ? worldToBlueprintPixel(selected.blueprint, { x: 0, z: 0 }) : undefined;
  const originVisible = !!selected?.blueprint && !!originPixel && originPixel.x >= 0 && originPixel.x <= selected.blueprint.naturalWidth && originPixel.z >= 0 && originPixel.z <= selected.blueprint.naturalHeight;
  const selectedAnchorWorld = selected?.blueprint?.alignmentPointPx ? blueprintPixelToWorld(selected.blueprint, selected.blueprint.alignmentPointPx) : undefined;

  const alignToReference = () => {
    if (!selected?.blueprint || !referenceFloor?.blueprint?.alignmentPointPx || !selected.blueprint.alignmentPointPx) return;
    props.onUpdate(selected.id, { blueprint: alignBlueprintToReference(selected.blueprint, referenceFloor.blueprint) });
    props.onNotice(`${selected.name} aligned to ${referenceFloor.name}.`);
  };

  const statusRow = selected?.blueprint && <div className="blueprint-status-row">
    <span className={selected.blueprint.scaleLinePx && selected.blueprint.scaleLineLengthMm ? 'complete' : ''}>{selected.blueprint.scaleLinePx && selected.blueprint.scaleLineLengthMm ? `Scale saved · ${(selected.blueprint.scaleLineLengthMm / 1000).toFixed(2)} m` : selected.blueprint.scaleLinePx ? 'Scale line saved · enter its length' : 'Scale line not set'}</span>
    <span className={selected.blueprint.alignmentPointPx ? 'complete' : ''}>{selected.blueprint.alignmentPointPx ? `Alignment point saved · ${Math.round(selected.blueprint.alignmentPointPx.x)}, ${Math.round(selected.blueprint.alignmentPointPx.z)} px` : 'Alignment point not set'}</span>
    <span className={selected.blueprint.northArrowPx ? 'complete' : ''}>{selected.blueprint.northArrowPx ? `North saved · ${selected.blueprint.rotationDeg.toFixed(1)}°` : 'North arrow not set'}</span>
  </div>;
  const calibrationPreviewStyle = selected?.blueprint ? selected.blueprint.naturalHeight > selected.blueprint.naturalWidth
    ? { height: `${zoom * 100}%`, width: 'auto', aspectRatio: `${selected.blueprint.naturalWidth} / ${selected.blueprint.naturalHeight}` }
    : { width: `${zoom * 100}%`, height: 'auto', aspectRatio: `${selected.blueprint.naturalWidth} / ${selected.blueprint.naturalHeight}` }
    : undefined;

  return <>
    <div className="modal-backdrop level-manager-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="level-manager-dialog" role="dialog" aria-modal="true" aria-label="Manage levels">
        <header><div><strong>Levels &amp; blueprints</strong><span>Add, reorder, calibrate, and register every house level.</span></div><button aria-label="Close" onClick={props.onClose}>×</button></header>
        <div className="level-manager-body">
          <aside><div className="section-title-row"><h2>Levels</h2><button className="primary compact-button" onClick={props.onAdd}><Plus size={14} /> Add</button></div>
            <div className="level-list">{ordered.map((floor) => <button key={floor.id} className={floor.id === selected.id ? 'active' : ''} onClick={() => { props.onActiveFloor(floor.id); setCalibration(floor.blueprint?.scaleLinePx ? [...floor.blueprint.scaleLinePx] : []); setNorthPoints(floor.blueprint?.northArrowPx ? [...floor.blueprint.northArrowPx] : []); setZoom(1); }}><span><strong>{floor.name}</strong><small>{(floor.elevationMm / 1000).toFixed(2)} m · ceiling {(floor.ceilingHeightMm / 1000).toFixed(2)} m</small></span><i>{floor.blueprint?.visible ? <Eye size={14} /> : floor.blueprint ? <EyeOff size={14} /> : null}</i></button>)}</div>
            {selected && <div className="level-order-actions"><button disabled={ordered[0]?.id === selected.id} onClick={() => props.onReorder(selected.id, -1)}><ArrowUp size={14} /> Move up</button><button disabled={ordered.at(-1)?.id === selected.id} onClick={() => props.onReorder(selected.id, 1)}><ArrowDown size={14} /> Move down</button><button className="text-danger" disabled={props.floors.length === 1} onClick={() => props.onDelete(selected.id)}><Trash2 size={14} /> Delete</button></div>}
            <section className="adjacent-blueprint-setting"><label className="switch-row"><button type="button" role="switch" aria-checked={props.showAdjacentBlueprint} className={props.showAdjacentBlueprint ? 'on' : ''} onClick={() => props.onShowAdjacentBlueprint(!props.showAdjacentBlueprint)}><i /></button><span>{t('Adjacent blueprint')}</span></label><small className="blueprint-key"><i /> {t('Below')} <i /> {t('Above')}</small></section>
          </aside>
          {selected && <main>
            <section className="level-definition-section"><h2>Level definition</h2><div className="level-definition-grid"><label className="field"><span>Name</span><input value={selected.name} onChange={(event) => props.onUpdate(selected.id, { name: event.target.value })} /></label><label className="field"><span>Elevation</span><span className="input-with-suffix"><DraftNumberInput value={selected.elevationMm / 1000} step={.01} onCommit={(value) => props.onUpdate(selected.id, { elevationMm: Math.round(value * 1000) })} /><em>m</em></span></label><label className="field"><span>Ceiling height</span><span className="input-with-suffix"><DraftNumberInput min={.1} value={selected.ceilingHeightMm / 1000} step={.01} onCommit={(value) => props.onUpdate(selected.id, { ceilingHeightMm: Math.round(value * 1000) })} /><em>m</em></span></label></div></section>
            <section className="blueprint-settings"><div className="section-title-row"><div><h2>Blueprint underlay</h2><p>Visibility and registration stay here; precise image points open in a dedicated workspace.</p></div><button onClick={() => fileInput.current?.click()}><ImagePlus size={15} /> {selected.blueprint ? 'Replace image' : 'Upload image'}</button></div><input ref={fileInput} hidden type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0])} />
              {!selected.blueprint ? <button className="blueprint-empty" onClick={() => fileInput.current?.click()}><ImagePlus size={24} /> Upload a floor-plan image</button> : <>
                <div className="blueprint-summary-card"><span><ImagePlus size={18} /><span><strong>{selected.blueprint.fileName}</strong><small>{selected.blueprint.naturalWidth} × {selected.blueprint.naturalHeight} px</small></span></span><button className="primary" onClick={() => setCalibrationOpen(true)}><Ruler size={15} /> {t('Calibrate image')}</button></div>
                {statusRow}
                <div className="blueprint-toolbar"><label className="field"><span>Known line length</span><span className="input-with-suffix"><DraftNumberInput disabled={!calibrationPixels} min={.01} value={selected.blueprint.scaleLineLengthMm ? selected.blueprint.scaleLineLengthMm / 1000 : calibrationPixels ? calibrationPixels * selected.blueprint.scaleMmPerPixel / 1000 : 1} step={.01} onCommit={(value) => calibrationPixels && props.onUpdate(selected.id, { blueprint: { ...updateBlueprintTransformPreservingAlignment(selected.blueprint!, { scaleMmPerPixel: value * 1000 / calibrationPixels }), scaleLinePx: [calibration[0], calibration[1]], scaleLineLengthMm: Math.round(value * 1000) } })} /><em>m</em></span></label><button aria-pressed={selected.blueprint.visible} className={`blueprint-visibility ${selected.blueprint.visible ? 'active' : ''}`} onClick={() => props.onUpdate(selected.id, { blueprint: { ...selected.blueprint!, visible: !selected.blueprint!.visible } })}>{selected.blueprint.visible ? <Eye size={15} /> : <EyeOff size={15} />} {selected.blueprint.visible ? 'Shown' : 'Hidden'}</button></div>
                <div className="blueprint-alignment"><div><strong>Floor-to-floor registration</strong><small>{selectedAnchorWorld ? `Selected point: X ${(selectedAnchorWorld.x / 1000).toFixed(3)} m · Y ${(selectedAnchorWorld.z / 1000).toFixed(3)} m` : 'Open image calibration and place an alignment point on a common structural feature.'}</small></div><select aria-label="Reference blueprint floor" value={referenceFloor?.id ?? ''} onChange={(event) => { const id = event.target.value; setReferenceFloorId(id); const reference = referenceCandidates.find((candidate) => candidate.id === id); if (selected.blueprint?.alignmentPointPx && reference?.blueprint?.alignmentPointPx) props.onUpdate(selected.id, { blueprint: alignBlueprintToReference(selected.blueprint, reference.blueprint) }); }}><option value="">Reference floor…</option>{referenceCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.blueprint?.alignmentPointPx ? '' : ' · point missing'}</option>)}</select><button disabled={!selected.blueprint.alignmentPointPx || !referenceFloor?.blueprint?.alignmentPointPx} onClick={alignToReference}>Align points</button></div>
                <div className="blueprint-transform-grid"><label className="field"><span>Offset X</span><span className="input-with-suffix"><DraftNumberInput value={selected.blueprint.offsetXmm / 1000} step={.01} onCommit={(value) => props.onUpdate(selected.id, { blueprint: { ...selected.blueprint!, offsetXmm: Math.round(value * 1000) } })} /><em>m</em></span></label><label className="field"><span>Offset Y</span><span className="input-with-suffix"><DraftNumberInput value={selected.blueprint.offsetZmm / 1000} step={.01} onCommit={(value) => props.onUpdate(selected.id, { blueprint: { ...selected.blueprint!, offsetZmm: Math.round(value * 1000) } })} /><em>m</em></span></label><label className="field"><span>Rotation</span><span className="input-with-suffix"><DraftNumberInput value={selected.blueprint.rotationDeg} step={.5} onCommit={(value) => props.onUpdate(selected.id, { blueprint: updateBlueprintTransformPreservingAlignment(selected.blueprint!, { rotationDeg: value }) })} /><em>°</em></span></label><label className="field"><span>Opacity</span><input type="range" min="0.05" max="1" step="0.05" value={selected.blueprint.opacity} onChange={(event) => props.onUpdate(selected.id, { blueprint: { ...selected.blueprint!, opacity: Number(event.target.value) } })} /></label></div>
                <button className="text-danger" onClick={() => { props.onUpdate(selected.id, { blueprint: undefined }); setCalibration([]); setNorthPoints([]); setCalibrationOpen(false); }}>Remove blueprint</button>
              </>}
            </section>
          </main>}
        </div><footer><button className="primary" onClick={props.onClose}>Done</button></footer>
      </div>
    </div>
    {calibrationOpen && selected?.blueprint && <div className="modal-backdrop blueprint-calibration-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCalibrationOpen(false)}>
      <div className="blueprint-calibration-dialog" role="dialog" aria-modal="true" aria-label={t('Blueprint calibration')}>
        <header><div><strong>{t('Blueprint calibration')}</strong><span>{selected.name} · {selected.blueprint.fileName}</span></div><button aria-label={t('Close calibration')} onClick={() => setCalibrationOpen(false)}>×</button></header>
        <div className="blueprint-preview-controls"><div className="blueprint-mode-buttons"><button aria-pressed={pointMode === 'calibration'} className={pointMode === 'calibration' ? 'active' : ''} onClick={() => setPointMode('calibration')}><Ruler size={14} /> {t('Scale line')}</button><button aria-pressed={pointMode === 'alignment'} className={pointMode === 'alignment' ? 'active' : ''} onClick={() => setPointMode('alignment')}><Crosshair size={14} /> {t('Alignment point')}</button><button aria-pressed={pointMode === 'north'} className={pointMode === 'north' ? 'active' : ''} onClick={() => setPointMode('north')}><Navigation size={14} /> {t('North arrow')}</button></div><div className="blueprint-zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.5, value - .25))}><Minus size={14} /></button><input aria-label="Blueprint preview zoom" type="range" min="0.5" max="4" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + .25))}><Plus size={14} /></button><span>{Math.round(zoom * 100)}%</span></div></div>
        <div className="blueprint-calibration-workspace"><div className="blueprint-preview-scroll"><div className="blueprint-calibration" style={calibrationPreviewStyle} onClick={clickPreview}>
          <img src={selected.blueprint.dataUrl} alt={`${selected.name} blueprint`} draggable={false} />
          {calibration.map((point, index) => <i className="calibration-point" key={index} style={{ left: `${point.x / selected.blueprint!.naturalWidth * 100}%`, top: `${point.z / selected.blueprint!.naturalHeight * 100}%` }}>{index + 1}</i>)}
          {selected.blueprint.alignmentPointPx && <i className="alignment-point" title="Floor alignment point" style={{ left: `${selected.blueprint.alignmentPointPx.x / selected.blueprint.naturalWidth * 100}%`, top: `${selected.blueprint.alignmentPointPx.z / selected.blueprint.naturalHeight * 100}%` }}><Crosshair size={13} /></i>}
          {originVisible && <span className="blueprint-origin" style={{ left: `${originPixel!.x / selected.blueprint.naturalWidth * 100}%`, top: `${originPixel!.z / selected.blueprint.naturalHeight * 100}%` }}><i /><em>0,0</em></span>}
          {calibration.length === 2 && <svg viewBox={`0 0 ${selected.blueprint.naturalWidth} ${selected.blueprint.naturalHeight}`} preserveAspectRatio="none"><line x1={calibration[0].x} y1={calibration[0].z} x2={calibration[1].x} y2={calibration[1].z} /></svg>}
          {northPoints.length === 2 && <svg className="north-arrow-overlay" viewBox={`0 0 ${selected.blueprint.naturalWidth} ${selected.blueprint.naturalHeight}`} preserveAspectRatio="none"><defs><marker id="blueprint-north-tip" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs><line markerEnd="url(#blueprint-north-tip)" x1={northPoints[0].x} y1={northPoints[0].z} x2={northPoints[1].x} y2={northPoints[1].z} /><text x={northPoints[1].x} y={northPoints[1].z - 12}>N</text></svg>}
        </div></div></div>
        <footer>{statusRow}<button className="primary" onClick={() => setCalibrationOpen(false)}>Done</button></footer>
      </div>
    </div>}
  </>;
}
