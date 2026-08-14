import { AlertTriangle, Cable, Lightbulb, ToggleLeft } from 'lucide-react';
import type { ProjectSnapshot } from '../../shared/types';
import type { LightingNetworkAnalysis } from '../lib/lightingNetwork';
import { useI18n } from '../lib/i18n';

interface Props {
  project: ProjectSnapshot;
  activeFloorId: string;
  analysis: LightingNetworkAnalysis;
  selectedLightId?: string;
  onSelectLight: (id: string) => void;
  onLocateIssue: (deviceId?: string, routeId?: string) => void;
}
export function LightingPanel({ project, activeFloorId, analysis, selectedLightId, onSelectLight, onLocateIssue }: Props) {
  const { t } = useI18n(); const deviceById = new Map(project.devices.map((device) => [device.id, device]));
  const floorLights = analysis.lightIds.map((id) => deviceById.get(id)).filter((item) => item?.floorId === activeFloorId);
  const floorSwitches = analysis.switchIds.map((id) => deviceById.get(id)).filter((item) => item?.floorId === activeFloorId);
  const floorDeviceIds = new Set([...floorLights, ...floorSwitches].map((item) => item!.id));
  const floorRouteIds = new Set(project.routes.filter((route) => route.floorId === activeFloorId).map((route) => route.id));
  const floorIssues = analysis.issues.filter((issue) => !!issue.deviceId && floorDeviceIds.has(issue.deviceId) || issue.routeIds.some((id) => floorRouteIds.has(id)) || !!issue.deviceId && deviceById.get(issue.deviceId)?.accessibleFloorIds?.includes(activeFloorId));
  const selected = selectedLightId ? deviceById.get(selectedLightId) : undefined; const controls = selected ? (analysis.controlsByLight[selected.id] ?? []).map((id) => deviceById.get(id)).filter(Boolean) : [];

  return <aside className="properties-panel lighting-panel">
    <div className="panel-heading"><span>{t('Lighting continuity')}</span><small>{t('selected level')}</small></div>
    <section className="lighting-summary"><div><Lightbulb size={17} /><strong>{floorLights.length}</strong><span>{t('Light points')}</span></div><div><ToggleLeft size={17} /><strong>{floorSwitches.length}</strong><span>{t('Light switches')}</span></div><div className={floorIssues.length ? 'warning' : 'ok'}><AlertTriangle size={17} /><strong>{floorIssues.length}</strong><span>{t('Connection issues')}</span></div></section>
    <section className="panel-section lighting-audit"><h3>{t('Connection audit')}</h3>{!floorIssues.length ? <p className="lighting-ok">{t('No lighting wiring issues on this level.')}</p> : floorIssues.map((issue) => <button key={issue.id} onClick={() => onLocateIssue(issue.deviceId, issue.routeIds[0])}><AlertTriangle size={14} /><span><strong>{issue.kind === 'route' ? t('Cable continuity') : t(issue.kind)}</strong><small>{t(issue.message)}</small></span></button>)}</section>
    <section className="panel-section lighting-point-list"><h3>{t('Light points')}</h3><p>{t('Select a light point to identify every switch with documented cable continuity.')}</p>{floorLights.map((light) => { const count = analysis.controlsByLight[light!.id]?.length ?? 0; return <button key={light!.id} className={selectedLightId === light!.id ? 'active' : ''} onClick={() => onSelectLight(light!.id)}><Lightbulb size={15} /><span><strong>{light!.name}</strong><small>{count ? `${count} ${t(count === 1 ? 'controlling switch' : 'controlling switches')}` : t('No controlling switch')}</small></span></button>; })}{!floorLights.length && <p className="muted">{t('No light points on this level.')}</p>}</section>
    {selected && <section className="panel-section lighting-control-result"><h3>{selected.name}</h3><div className="lighting-trace"><Cable size={16} /><span>{t('Controlling switches blink red in the 3D view.')}</span></div>{controls.length ? controls.map((device) => <button key={device!.id} onClick={() => onLocateIssue(device!.id)}><ToggleLeft size={15} /><span><strong>{device!.name}</strong><small>{project.floors.find((floor) => floor.id === device!.floorId)?.name}</small></span></button>) : <p className="warning-text">{t('No complete switch-to-light cable path is documented.')}</p>}</section>}
  </aside>;
}
