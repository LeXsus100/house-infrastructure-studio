import { useEffect, useState } from 'react';
import { Armchair, BetweenVerticalStart, Cable, Camera, Circle, CircuitBoard, Columns3, Construction, Cylinder, Eye, EyeOff, Fan, Flame, GitMerge, Images, Network, Pipette, PlugZap, Radio, Ruler, Shield, Square, Thermometer, Wifi } from 'lucide-react';
import type { DeviceType, Floor, Measurement, ProjectSnapshot, Room, Selection, ServiceCategory, ToolMode } from '../../shared/types';
import { DraftNumberInput } from './DraftNumberInput';
import { useI18n } from '../lib/i18n';
import { ROUTE_SERVICE_COMPATIBILITY } from '../catalog';
import { FloorSelector } from './FloorSelector';

const iconFor: Record<string, typeof PlugZap> = { electrical: PlugZap, lighting: Radio, data: Network, wifi: Wifi, security: Shield, cctv: Camera, hvac: Fan, heating: Flame, plumbing: Pipette, sensors: Thermometer, automation: CircuitBoard, storage: Cylinder, structural: Columns3, transitions: BetweenVerticalStart, generic: Square, custom: Construction };

interface Props {
  project: ProjectSnapshot;
  activeFloorId: string;
  tool: ToolMode;
  selection: Selection | null;
  placementType?: DeviceType;
  routeKind: 'cable' | 'pipe' | 'duct' | 'junction' | 'transition';
  measurementType: Measurement['type'];
  routeService: ServiceCategory;
  visibleServices: Set<ServiceCategory>;
  showAllFloors: boolean;
  onActiveFloor: (id: string) => void;
  onUpdateFloor: (id: string, patch: Partial<Floor>) => void;
  onNewWallLayers: (layers: Pick<ProjectSnapshot['preferences'], 'newWallStructuralThicknessMm' | 'newWallLiningLeftMm' | 'newWallLiningRightMm'>) => void;
  onTool: (tool: ToolMode) => void;
  onPlacementType: (type: DeviceType) => void;
  onRouteKind: (kind: 'cable' | 'pipe' | 'duct' | 'junction' | 'transition') => void;
  onMeasurementType: (type: Measurement['type']) => void;
  onRouteService: (service: ServiceCategory) => void;
  onToggleService: (service: ServiceCategory) => void;
  onSetAllServices: (visible: boolean) => void;
  onShowAllFloors: (visible: boolean) => void;
  onSelect: (selection: Selection) => void;
  onManageFloors: () => void;
  onChooseFurniture: () => void;
  onCreateCustomType: () => void;
  onCreateRoomFromWalls: () => void;
  onAddRoomCategory: () => void;
  onEditRoomCategory: (id: string) => void;
  onDeleteRoomCategory: (id: string) => void;
}

export function LeftSidebar(props: Props) {
  const { t } = useI18n();
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  useEffect(() => { if (props.tool === 'device') setOpenCategoryId(null); }, [props.tool]);
  const technicalCategories = props.project.categories.filter((category) => category.serviceCategory !== 'structural');
  const structuralTypes = props.project.deviceTypes.filter((type) => type.family === 'structure');
  const column = structuralTypes.find((type) => type.id === 'column');
  const openingAndAccessTypes = ['door-opening', 'window-opening', 'staircase'].map((id) => structuralTypes.find((type) => type.id === id)).filter((type): type is DeviceType => !!type);
  const containerTypes = props.project.deviceTypes.filter((type) => type.serviceCategory === 'storage');
  const floorRooms = props.project.rooms.filter((room) => room.floorId === props.activeFloorId);
  const openStructureTool = () => { const door = structuralTypes.find((type) => type.id === 'door-opening'); if (door) props.onPlacementType(door); else props.onTool('structure'); };
  const openContainerTool = () => { if (containerTypes[0]) props.onPlacementType(containerTypes[0]); else props.onTool('container'); };
  return <aside className="left-sidebar">
    <FloorSelector floors={props.project.floors} activeFloorId={props.activeFloorId} onActiveFloor={props.onActiveFloor} onManageFloors={props.onManageFloors} />
    <div className="photo-house-scope editor-house-scope"><button className={props.showAllFloors ? 'active' : ''} onClick={() => props.onShowAllFloors(!props.showAllFloors)}><Images size={16} /><span>{t('Full house')}</span></button></div>
    <section className="tool-section"><h2>{t('Create')}</h2><div className="tool-grid">
      <ToolButton label={t('Wall')} shortcut="W" icon={Construction} active={props.tool === 'wall'} onClick={() => props.onTool('wall')} />
      <ToolButton label={t('Room')} shortcut="R" icon={Square} active={props.tool === 'room'} onClick={() => props.onTool('room')} />
      <ToolButton label={t('Structure')} shortcut="T" icon={Columns3} active={props.tool === 'structure'} onClick={openStructureTool} />
      <ToolButton label={t('Device')} shortcut="D" icon={PlugZap} active={props.tool === 'device'} onClick={() => { setOpenCategoryId(null); props.onTool('device'); }} />
      <ToolButton label={t('Route')} shortcut="E" icon={Cable} active={props.tool === 'route'} onClick={() => props.onTool('route')} />
      <ToolButton label={t('Container')} shortcut="C" icon={Cylinder} active={props.tool === 'container'} onClick={openContainerTool} />
      <ToolButton label={t('Measure')} shortcut="M" icon={Ruler} active={props.tool === 'measure'} onClick={() => props.onTool('measure')} />
      <ToolButton label={t('Select')} shortcut="S" icon={Square} active={props.tool === 'select'} onClick={() => props.onTool('select')} />
    </div>{props.selection?.type === 'wall' && props.selection.ids.length >= 3 && <button className="secondary wide" onClick={props.onCreateRoomFromWalls}>{t('Room from selected walls')}</button>}
    {props.tool === 'wall' && <div className="wall-default wall-layer-defaults"><div className="field-grid"><label className="field"><span>{t('Structural core')}</span><span className="input-with-suffix"><DraftNumberInput value={props.project.preferences.newWallStructuralThicknessMm / 1000} min={.01} step={.01} onCommit={(value) => props.onNewWallLayers({ newWallStructuralThicknessMm: Math.max(10, Math.round(value * 1000)), newWallLiningLeftMm: props.project.preferences.newWallLiningLeftMm, newWallLiningRightMm: props.project.preferences.newWallLiningRightMm })} /><em>m</em></span></label><label className="field"><span>{t('Drywall left')}</span><span className="input-with-suffix"><DraftNumberInput value={props.project.preferences.newWallLiningLeftMm / 1000} min={0} step={.01} onCommit={(value) => props.onNewWallLayers({ newWallStructuralThicknessMm: props.project.preferences.newWallStructuralThicknessMm, newWallLiningLeftMm: Math.max(0, Math.round(value * 1000)), newWallLiningRightMm: props.project.preferences.newWallLiningRightMm })} /><em>m</em></span></label><label className="field"><span>{t('Drywall right')}</span><span className="input-with-suffix"><DraftNumberInput value={props.project.preferences.newWallLiningRightMm / 1000} min={0} step={.01} onCommit={(value) => props.onNewWallLayers({ newWallStructuralThicknessMm: props.project.preferences.newWallStructuralThicknessMm, newWallLiningLeftMm: props.project.preferences.newWallLiningLeftMm, newWallLiningRightMm: Math.max(0, Math.round(value * 1000)) })} /><em>m</em></span></label></div><div className="wall-layer-total"><span>{t('Finished total')}</span><strong>{(props.project.preferences.newWallThicknessMm / 1000).toFixed(2)} m</strong></div></div>}
    <p className="tool-hint">{props.tool === 'wall' ? 'Click start and end points. Edit the exact length in Properties.' : props.tool === 'route' ? props.routeKind === 'junction' ? 'Click a route to split it at a junction, or place a standalone junction.' : 'Click the source device, add wall control points, then click the destination device.' : props.tool === 'room' ? 'Click a boundary; double-click to close it.' : props.tool === 'structure' ? 'Choose a column, opening, or furniture volume, then place it. Openings snap to a wall.' : props.tool === 'container' ? 'Choose a technical container, then place and size it.' : props.tool === 'device' ? 'Choose a type, then click a wall, floor or ceiling position.' : props.tool === 'measure' ? 'Click a device for its floor height, or click two points for the selected dimension.' : 'Click an object; Ctrl-click adds to the selection.'}</p></section>

    {props.tool === 'structure' && <section className="tool-section"><h2>House structure</h2><div className="structure-list">{column && <div className="column-choice"><span><span className="catalog-symbol"><Columns3 size={14} /></span>Column</span><span><button className={props.placementType?.id === column.id && props.placementType.shape === 'box' ? 'active' : ''} title="Square column" aria-label="Square column" onClick={() => props.onPlacementType({ ...column, shape: 'box' })}><Square size={14} /></button><button className={props.placementType?.id === column.id && props.placementType.shape === 'cylinder' ? 'active' : ''} title="Round column" aria-label="Round column" onClick={() => props.onPlacementType({ ...column, shape: 'cylinder' })}><Circle size={14} /></button></span></div>}{openingAndAccessTypes.map((type) => <button key={type.id} className={props.placementType?.id === type.id ? 'catalog-item active' : 'catalog-item'} onClick={() => props.onPlacementType(type)}><span className="catalog-symbol">{type.id === 'staircase' ? <BetweenVerticalStart size={14} /> : <Square size={14} />}</span><span>{type.name}</span></button>)}<button className="catalog-item furniture-picker" onClick={props.onChooseFurniture}><span className="catalog-symbol"><Armchair size={14} /></span><span>Furniture…</span></button></div></section>}

    {props.tool === 'device' && <section className="tool-section"><div className="section-title-row"><h2>{t('Device catalogue')}</h2><button onClick={props.onCreateCustomType}>{t('+ Custom')}</button></div><div className="catalog-list">{technicalCategories.filter((category) => category.serviceCategory !== 'storage').map((category) => {
      const types = props.project.deviceTypes.filter((type) => type.family === 'device' && (type.categoryId === category.id || type.serviceCategory === category.serviceCategory));
      if (!types.length) return null;
      const Icon = iconFor[category.serviceCategory] ?? Square;
      return <details key={category.id} open={openCategoryId === category.id}><summary onClick={(event) => { event.preventDefault(); setOpenCategoryId((current) => current === category.id ? null : category.id); }}><Icon size={15} /><span>{t(category.name)}</span><em>{types.length}</em></summary>{types.map((type) => {
        const hasMountVariants = ['access-point', 'light-point'].includes(type.id);
        const variantBackFace = type.id === 'light-point' ? 'top' : type.defaultBackFace;
        return <div className={hasMountVariants ? 'catalog-item-wrap has-mount-variants' : 'catalog-item-wrap'} key={type.id}><button title={t(type.name)} className={props.placementType?.id === type.id ? 'catalog-item active' : 'catalog-item'} onClick={() => props.onPlacementType(type)}><span className="catalog-symbol" style={{ '--service-color': type.defaultDisplayColor ?? category.color } as React.CSSProperties}><Icon size={13} /></span><span>{t(type.name)}</span></button>{hasMountVariants && <span className="mount-variants"><button title={t('Wall mounted')} onClick={() => props.onPlacementType({ ...type, defaultAssociation: 'wall', defaultBackFace: variantBackFace })}>{t('Wall')}</button><button title={t('Ceiling mounted')} onClick={() => props.onPlacementType({ ...type, defaultAssociation: 'ceiling', defaultBackFace: variantBackFace })}>{t('Ceiling')}</button></span>}</div>;
      })}</details>;
    })}</div></section>}

    {props.tool === 'container' && <section className="tool-section"><h2>{t('Technical containers')}</h2><div className="structure-list">{containerTypes.map((type) => <button key={type.id} className={props.placementType?.id === type.id ? 'catalog-item active' : 'catalog-item'} onClick={() => props.onPlacementType(type)}><span className="catalog-symbol" style={{ '--service-color': type.defaultDisplayColor } as React.CSSProperties}><Cylinder size={14} /></span><span>{t(type.name)}</span></button>)}</div></section>}

    {props.tool === 'route' && <section className="tool-section"><h2>{t('Route setup')}</h2><div className="segmented route-kinds"><button className={props.routeKind === 'cable' ? 'active' : ''} onClick={() => props.onRouteKind('cable')}>{t('Cable')}</button><button className={props.routeKind === 'pipe' ? 'active' : ''} onClick={() => props.onRouteKind('pipe')}>{t('Pipe')}</button><button className={props.routeKind === 'duct' ? 'active' : ''} onClick={() => props.onRouteKind('duct')}>{t('Duct')}</button><button className={props.routeKind === 'junction' ? 'active' : ''} onClick={() => props.onRouteKind('junction')}><GitMerge size={13} /> {t('Junction')}</button><button className={props.routeKind === 'transition' ? 'active' : ''} onClick={() => props.onRouteKind('transition')}><BetweenVerticalStart size={13} /> Transition</button></div>{!['junction','transition'].includes(props.routeKind) && <><span className="field-label">{t('Service')}</span><div className="route-service-grid">{technicalCategories.filter((category) => ROUTE_SERVICE_COMPATIBILITY[props.routeKind as 'cable'|'pipe'|'duct'].includes(category.serviceCategory)).map((category) => { const Icon = iconFor[category.serviceCategory] ?? Square; return <button key={category.id} className={props.routeService === category.serviceCategory ? 'active' : ''} style={{ '--service-color': category.color } as React.CSSProperties} onClick={() => props.onRouteService(category.serviceCategory)}><Icon size={14} /><span>{t(category.name)}</span><i data-pattern={category.pattern} /></button>; })}</div></>}</section>}

    {props.tool === 'measure' && <section className="tool-section"><h2>Measurement mode</h2><div className="segmented"><button className={props.measurementType === 'point-to-point' ? 'active' : ''} onClick={() => props.onMeasurementType('point-to-point')}>3D distance</button><button className={['vertical','height'].includes(props.measurementType) ? 'active' : ''} onClick={() => props.onMeasurementType('height')}>Vertical height</button></div></section>}

    <section className="tool-section services-visibility"><div className="section-title-row"><h2>{t('Services visibility')}</h2><span className="filter-actions"><button onClick={() => props.onSetAllServices(true)}>{t('All')}</button><button onClick={() => props.onSetAllServices(false)}>{t('None')}</button></span></div><div className="visibility-button-list">{technicalCategories.map((category) => { const visible = props.visibleServices.has(category.serviceCategory); return <button key={category.id} className={visible ? 'active' : ''} aria-pressed={visible} onClick={() => props.onToggleService(category.serviceCategory)}>{visible ? <Eye size={14} /> : <EyeOff size={14} />}<span className="pattern-swatch" data-pattern={category.pattern} style={{ '--service-color': category.color } as React.CSSProperties} /><span>{t(category.name)}</span></button>; })}</div></section>

    <section className="tool-section room-browser"><div className="section-title-row"><h2>{t('Rooms')}</h2><button onClick={props.onAddRoomCategory}>{t('+ Category')}</button></div>{props.project.roomCategories.length > 0 && <div className="room-category-strip">{props.project.roomCategories.map((category) => <span key={category.id}><i style={{ background: category.color }} /><button title="Edit category" onClick={() => props.onEditRoomCategory(category.id)}>{category.name}</button><button title="Delete category" aria-label={`Delete ${category.name}`} onClick={() => props.onDeleteRoomCategory(category.id)}>×</button></span>)}</div>}<div className="object-list">{floorRooms.map((room: Room) => { const category = props.project.roomCategories.find((item) => item.id === room.categoryId); return <button key={room.id} className={props.selection?.type === 'room' && props.selection.ids.includes(room.id) ? 'active' : ''} onClick={() => props.onSelect({ type: 'room', ids: [room.id] })}><span><strong>{room.name}</strong><small>{category?.name ?? t('Uncategorized')}</small></span><em>{(room.areaMm2 / 1_000_000).toFixed(1)} m²</em></button>; })}{!floorRooms.length && <p className="empty-state compact">{t('No rooms on this level.')}</p>}</div></section>
  </aside>;
}

function ToolButton({ label, shortcut, icon: Icon, active, onClick }: { label: string; shortcut: string; icon: typeof Square; active: boolean; onClick: () => void }) {
  return <button className={active ? 'tool-button active' : 'tool-button'} onClick={onClick}><Icon size={18} /><span>{label}</span><kbd>{shortcut}</kbd></button>;
}
