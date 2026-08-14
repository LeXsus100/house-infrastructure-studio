import { useMemo, useRef, useState } from 'react';
import { Cable, CircuitBoard, Layers3, ListTree, MapPinned, Route as RouteIcon, Ruler, Warehouse } from 'lucide-react';
import type { ProjectSnapshot, ServiceCategory } from '../../shared/types';
import { drywallAreaMm2, routeLength, wallLength } from '../lib/geometry';
import { useI18n } from '../lib/i18n';

type Filter = ServiceCategory | 'all';
type Detail = 'rooms' | 'inventory';
const metres = (millimetres: number) => `${(millimetres / 1000).toFixed(2)} m`;

interface Props {
  project: ProjectSnapshot;
  onAddRoomCategory?: () => void;
  onEditRoomCategory?: (id: string) => void;
  onDeleteRoomCategory?: (id: string) => void;
}

export function OverviewPage({ project, onAddRoomCategory, onEditRoomCategory, onDeleteRoomCategory }: Props) {
  const { t } = useI18n(); const detailRef = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<Detail>('inventory');
  const [filter, setFilter] = useState<Filter>('all');
  const [routeKind, setRouteKind] = useState<'all' | 'cable' | 'pipe' | 'duct'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'installed' | 'tested'>('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState<'all' | 'devices' | 'routes'>('all');
  const showDetail = (next: Detail) => { setDetail(next); window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const serviceRows = useMemo(() => project.categories.filter((category) => category.serviceCategory !== 'structural').map((category) => {
    const devices = project.devices.filter((device) => device.serviceCategory === category.serviceCategory && device.serviceCategory !== 'structural');
    const routes = project.routes.filter((route) => route.serviceCategory === category.serviceCategory);
    return { ...category, devices: devices.length, routes: routes.length, length: routes.reduce((sum, route) => sum + routeLength(route), 0) };
  }).filter((row, index, rows) => rows.findIndex((item) => item.serviceCategory === row.serviceCategory) === index && (row.devices || row.routes)), [project]);
  const maximumServiceLength = Math.max(1, ...serviceRows.map((row) => row.length));
  const technicalDevices = project.devices.filter((device) => device.serviceCategory !== 'structural');
  const filteredRoutes = project.routes.filter((route) => assetFilter !== 'devices' && (filter === 'all' || route.serviceCategory === filter) && (routeKind === 'all' || route.kind === routeKind) && (statusFilter === 'all' || route.installationStatus === statusFilter) && (floorFilter === 'all' || route.floorId === floorFilter));
  const filteredDevices = technicalDevices.filter((device) => assetFilter !== 'routes' && (filter === 'all' || device.serviceCategory === filter) && (statusFilter === 'all' || device.installationStatus === statusFilter) && (floorFilter === 'all' || device.floorId === floorFilter));
  const totalRouteLength = project.routes.reduce((sum, route) => sum + routeLength(route), 0);
  const installedDevices = technicalDevices.filter((device) => ['installed', 'tested'].includes(device.installationStatus)).length;
  const testedRoutes = project.routes.filter((route) => route.testStatus.toLowerCase() !== 'not tested').length;
  const drywallArea = project.walls.reduce((sum, wall) => sum + drywallAreaMm2(wall, project.devices), 0);

  return <main className="overview-page">
    <header className="overview-heading"><div><span>{t('Whole-house MEP report')}</span><h1>{t('Infrastructure overview')}</h1><p>{t('Live totals from the locally saved project.')}</p></div></header>
    <section className="overview-metrics" aria-label={t('Project totals')}>
      <article><Warehouse /><span>{t('House model')}</span><strong>{project.floors.length} {t('floors')}</strong><small>{project.rooms.length} {t('rooms')} · {project.walls.length} {t('walls')}</small></article>
      <article><Ruler /><span>{t('Wall network')}</span><strong>{metres(project.walls.reduce((sum, wall) => sum + wallLength(wall), 0))}</strong><small>{t('Total modelled wall length')}</small></article>
      <article><CircuitBoard /><span>{t('Technical devices')}</span><strong>{technicalDevices.length}</strong><small>{installedDevices} {t('installed or tested')}</small></article>
      <article><RouteIcon /><span>{t('Technical routes')}</span><strong>{project.routes.length}</strong><small>{metres(totalRouteLength)} {t('geometric length')}</small></article>
      <article><Cable /><span>{t('Verification')}</span><strong>{testedRoutes}</strong><small>{t('Routes with a recorded test state')}</small></article>
      <article><Layers3 /><span>{t('Documentation')}</span><strong>{project.measurements.filter((item) => item.visible).length}</strong><small>{t('Visible measurements')}</small></article>
      <article><Layers3 /><span>{t('Drywall lining')}</span><strong>{(drywallArea / 1_000_000).toFixed(2)} m²</strong><small>{t('Finished lined wall faces')}</small></article>
    </section>

    <section className="overview-grid">
      <article className="report-card service-report"><header><div><span>{t('Service distribution')}</span><h2>{t('Route length by service')}</h2></div><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{t('Show all')}</button></header><div className="report-bars">{serviceRows.length ? serviceRows.map((row) => <button key={row.serviceCategory} className={filter === row.serviceCategory ? 'active' : ''} onClick={() => setFilter(row.serviceCategory)} title={`${t('Filter report to')} ${t(row.name)}`}><span className="bar-label"><i style={{ background: row.color }} />{t(row.name)}<em>{row.devices} {t('devices')} · {row.routes} {t('routes')}</em></span><span className="bar-track"><i style={{ width: `${Math.max(2, row.length / maximumServiceLength * 100)}%`, background: row.color }} /></span><strong>{metres(row.length)}</strong></button>) : <p className="empty-report">{t('Add technical devices and routes to populate this report.')}</p>}</div></article>
      <nav className="overview-section-nav" aria-label={t('Overview sections')}>{([
        ['rooms', MapPinned, 'Rooms & zones'], ['inventory', ListTree, 'Asset inventory']
      ] as const).map(([id, Icon, label]) => <button key={id} className={detail === id ? 'active' : ''} onClick={() => showDetail(id)}><Icon size={16} /><span>{t(label)}</span></button>)}</nav>
      <article className="report-card"><header><div><span>{t('Route inventory')}</span><h2>{t('Length by route type')}</h2></div></header><div className="route-kind-grid">{(['cable','pipe','duct'] as const).map((kind) => { const routes = project.routes.filter((route) => route.kind === kind); const length = routes.reduce((sum, route) => sum + routeLength(route), 0); return <button key={kind} className={routeKind === kind ? 'active' : ''} onClick={() => setRouteKind((current) => current === kind ? 'all' : kind)}><span>{t(kind)}</span><strong>{metres(length)}</strong><small>{routes.length} {t('routes')}</small></button>; })}</div></article>
      <article className="report-card floor-report"><header><div><span>{t('Level distribution')}</span><h2>{t('Inventory by floor')}</h2></div></header><div>{project.floors.map((floor) => { const devices = technicalDevices.filter((device) => device.floorId === floor.id).length; const routes = project.routes.filter((route) => route.floorId === floor.id); return <div key={floor.id}><span><strong>{floor.name}</strong><small>{(floor.elevationMm / 1000).toFixed(2)} m {t('elevation')}</small></span><em>{project.rooms.filter((room) => room.floorId === floor.id).length} {t('rooms')}</em><em>{devices} {t('devices')}</em><em>{metres(routes.reduce((sum, route) => sum + routeLength(route), 0))} {t('routes')}</em></div>; })}</div></article>
    </section>

    <section ref={detailRef} className="overview-detail" aria-live="polite">
      {detail === 'rooms' && <RoomOrganization project={project} onAdd={onAddRoomCategory} onEdit={onEditRoomCategory} onDelete={onDeleteRoomCategory} />}
      {detail === 'inventory' && <section className="report-card inventory-table"><header><div><span>{t('Filtered detail')}</span><h2>{filter === 'all' ? t('All MEP assets') : t(project.categories.find((category) => category.serviceCategory === filter)?.name ?? filter)}</h2></div><span>{filteredDevices.length} {t('devices')} · {filteredRoutes.length} {t('routes')}</span></header><div className="inventory-filters"><label><span>{t('Asset')}</span><select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value as typeof assetFilter)}><option value="all">{t('Devices and routes')}</option><option value="devices">{t('Devices only')}</option><option value="routes">{t('Routes only')}</option></select></label><label><span>{t('Service category')}</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">{t('All services')}</option>{serviceRows.map((row) => <option key={row.serviceCategory} value={row.serviceCategory}>{t(row.name)}</option>)}</select></label><label><span>{t('Status')}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">{t('All statuses')}</option>{['planned','installed','tested'].map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></label><label><span>{t('Floor')}</span><select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)}><option value="all">{t('All floors')}</option>{project.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label></div><div className={`inventory-columns ${assetFilter !== 'all' ? 'single' : ''}`}>{assetFilter !== 'routes' && <div><h3>{t('Devices')}</h3>{filteredDevices.length ? filteredDevices.map((device) => <div key={device.id}><span><strong>{device.name}</strong><small>{t(project.deviceTypes.find((type) => type.id === device.typeId)?.name ?? device.typeId)}</small></span><em>{project.floors.find((floor) => floor.id === device.floorId)?.name}</em><b>{t(device.installationStatus)}</b></div>) : <p className="empty-report">{t('No matching devices.')}</p>}</div>}{assetFilter !== 'devices' && <div><h3>{t('Routes')}</h3>{filteredRoutes.length ? filteredRoutes.map((route) => <div key={route.id}><span><strong>{route.name}</strong><small>{route.subtype || t(route.kind)} · {t(route.testStatus)}</small></span><em>{metres(routeLength(route))}</em><b>{t(route.installationStatus)}</b></div>) : <p className="empty-report">{t('No matching routes.')}</p>}</div>}</div></section>}
    </section>
  </main>;
}

function RoomOrganization({ project, onAdd, onEdit, onDelete }: { project: ProjectSnapshot; onAdd?: () => void; onEdit?: (id: string) => void; onDelete?: (id: string) => void }) {
  const { t } = useI18n(); return <section className="report-card room-organization"><header><div><span>{t('House organization')}</span><h2>{t('Rooms, zones & assigned services')}</h2></div><button onClick={onAdd}>+ {t('Room category')}</button></header>{project.roomCategories.length > 0 && <div className="overview-room-categories">{project.roomCategories.map((category) => <div key={category.id}><i style={{ background: category.color }} /><span><strong>{category.name}</strong><small>{project.rooms.filter((room) => room.categoryId === category.id).length} {t('rooms')}</small></span><button onClick={() => onEdit?.(category.id)}>{t('Edit')}</button><button className="text-danger" onClick={() => onDelete?.(category.id)}>×</button></div>)}</div>}<div className="overview-room-grid">{project.rooms.map((room) => { const category = project.roomCategories.find((item) => item.id === room.categoryId); const devices = project.devices.filter((device) => device.roomId === room.id); const routes = project.routes.filter((route) => route.roomIds.includes(room.id)); return <article key={room.id}><header><MapPinned size={17} /><span><strong>{room.name}</strong><small>{category?.name ?? t('Uncategorized')} · {project.floors.find((floor) => floor.id === room.floorId)?.name}</small></span><em>{(room.areaMm2 / 1_000_000).toFixed(1)} m²</em></header><div><span>{devices.length} {t('devices')}</span><span>{routes.length} {t('routes')}</span><span>{room.wallIds.length} {t('walls')}</span></div>{devices.length ? <ul>{devices.slice(0, 5).map((device) => <li key={device.id}><i style={{ background: project.categories.find((item) => item.serviceCategory === device.serviceCategory)?.color }} />{device.name}<em>{t(device.serviceCategory)}</em></li>)}</ul> : <p>{t('No devices assigned.')}</p>}</article>; })}{!project.rooms.length && <p className="empty-report">{t('Create rooms in the editor to organize the technical inventory here.')}</p>}</div></section>;
}
