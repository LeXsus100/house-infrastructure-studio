import { useMemo, useState } from 'react';
import { Cable, CircleAlert, PlugZap, X } from 'lucide-react';
import type { Device, DevicePort, DevicePortTemplate, DeviceType, MountingFace, Route, RouteKind, ServiceCategory, Vec3 } from '../../shared/types';
import { portServiceFits, replacementPorts, routeCreationPortFits, routesUsingDevicePort, type RouteEndpointRole } from '../lib/ports';
import { automaticEnclosurePort, supportsAutomaticCablePorts } from '../lib/devicePorts';
import { ObjectPreview3D } from './ObjectPreview3D';
import { DraftNumberInput } from './DraftNumberInput';
import { useI18n } from '../lib/i18n';

interface Props {
  device: Device;
  deviceType: DeviceType;
  routes: Route[];
  service: ServiceCategory;
  routeKind: RouteKind;
  role: RouteEndpointRole;
  firstPortDirection?: DevicePort['direction'];
  validationMessage?: string;
  serviceColors?: Partial<Record<ServiceCategory, string>>;
  allowedPortIds?: string[];
  allowSharedPorts?: boolean;
  onChoose: (port: DevicePort) => void;
  onAddPort: (port: DevicePort) => void;
  onReassign: (routeId: string, deviceId: string, role: RouteEndpointRole, portId: string) => void;
  onClose: () => void;
}

export function RoutePortDialog({ device, deviceType, routes, service, routeKind, role, firstPortDirection, validationMessage, serviceColors, allowedPortIds, allowSharedPorts = false, onChoose, onAddPort, onReassign, onClose }: Props) {
  const { t } = useI18n();
  const [replacement, setReplacement] = useState<Record<string,string>>({});
  const [newPortName, setNewPortName] = useState(`${service} connection`); const [newConnector, setNewConnector] = useState('');
  const coherentNewDirection: DevicePort['direction'] = role === 'source' ? 'output' : firstPortDirection === 'input' ? 'output' : 'input';
  const [newDirection, setNewDirection] = useState<DevicePort['direction']>(coherentNewDirection); const [newPosition, setNewPosition] = useState<Vec3>(); const [newFace, setNewFace] = useState<MountingFace>();
  const [newSpaceRequiredCm, setNewSpaceRequiredCm] = useState((deviceType.defaultPortSpaceMm ?? 30) / 10);
  const ports = useMemo(() => {
    const allowed = device.ports.filter((port) => !allowedPortIds || allowedPortIds.includes(port.id));
    return [...allowed].sort((a, b) => Number(routeCreationPortFits(b, service, role === 'destination' ? firstPortDirection ? { direction: firstPortDirection } : undefined : undefined)) - Number(routeCreationPortFits(a, service, role === 'destination' ? firstPortDirection ? { direction: firstPortDirection } : undefined : undefined)));
  }, [device, service, role, firstPortDirection, allowedPortIds]);
  const firstPort = role === 'destination' && firstPortDirection ? { direction: firstPortDirection } : undefined;
  const hasCompatiblePort = ports.some((port) => routeCreationPortFits(port, service, firstPort));
  const automaticCablePorts = supportsAutomaticCablePorts(deviceType, routeKind);
  const previewPorts: DevicePortTemplate[] = device.ports.map(({ id: _id, deviceId: _deviceId, ...port }) => port);
  if (newPosition && newFace) previewPorts.push({ name: newPortName || `${service} connection`, portType: service, direction: newDirection, serviceCategory: service, connectorType: newConnector, notes: '', position: newPosition, face: newFace, required: false, spaceRequiredMm: Math.max(10, Math.round(newSpaceRequiredCm * 10)) });
  const saveNewPort = () => {
    if (!newPosition || !newFace || !newPortName.trim() || !routeCreationPortFits({ serviceCategory: service, direction: newDirection }, service, firstPort)) return;
    const port: DevicePort = { id: crypto.randomUUID(), deviceId: device.id, name: newPortName.trim(), portType: service, direction: newDirection, serviceCategory: service, connectorType: newConnector.trim(), notes: '', position: newPosition, face: newFace, required: false, spaceRequiredMm: Math.max(10, Math.round(newSpaceRequiredCm * 10)) };
    onAddPort(port);
  };
  return <div className="modal-backdrop route-port-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="route-port-dialog" role="dialog" aria-modal="true" aria-label={`Choose a port on ${device.name}`}><header><div><strong>{role === 'source' ? t('Choose first endpoint port') : t('Choose second endpoint port')}</strong><span>{device.name} · {service} route</span><small>{role === 'source' ? t('Choose any service-compatible first port. The second port will be limited to the coherent direction.') : t('Only a port coherent with the first endpoint direction can finish this route.')}</small></div><button aria-label="Close port chooser" onClick={onClose}><X size={16} /></button></header>{validationMessage && <div className="route-port-validation" role="alert"><CircleAlert size={16} /><span>{validationMessage}</span></div>}<div className="route-port-list">{ports.map((port) => {
    const serviceFits = portServiceFits(port, service);
    if (!serviceFits) return <div className="route-port-card incompatible" key={port.id}><i><PlugZap size={16} /></i><span><strong>{port.name}</strong><small>{port.connectorType || 'Unspecified connector'} · {port.serviceCategory}</small></span><em>Other service</em></div>;
    const directionFits = routeCreationPortFits(port, service, firstPort);
    if (!directionFits) return <div className="route-port-card incompatible" key={port.id}><i><PlugZap size={16} /></i><span><strong>{port.name}</strong><small>{port.connectorType || 'Unspecified connector'} · {port.direction}</small></span><em>{t('Wrong direction')}</em></div>;
    const usages = routesUsingDevicePort(routes, device.id, port.id);
    if (!usages.length || allowSharedPorts) return <button className="route-port-card available" key={port.id} onClick={() => onChoose(port)}><i><PlugZap size={16} /></i><span><strong>{port.name}</strong><small>{port.connectorType || 'Unspecified connector'} · {port.direction}{usages.length ? ` · ${usages.length} route${usages.length === 1 ? '' : 's'} in this shared sleeve` : ''}</small></span><em>{usages.length ? 'Shared riser' : 'Available'}</em></button>;
    const usage = usages[0]; const candidates = replacementPorts(device, routes, port.id, usage.route.serviceCategory, usage.role);
    return <div className="route-port-card occupied" key={port.id}><i><CircleAlert size={16} /></i><span><strong>{port.name}</strong><small>Occupied by {usages.map((item) => item.route.name).join(', ')}</small></span><em>Occupied</em><div className="route-port-reassign"><label><span>Move {usage.route.name} to</span><select value={replacement[usage.route.id] ?? ''} onChange={(event) => setReplacement((current) => ({ ...current, [usage.route.id]: event.target.value }))}><option value="">Choose another free port…</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.connectorType || candidate.direction}</option>)}</select></label><button disabled={!replacement[usage.route.id] || usages.length > 1} onClick={() => { const next = replacement[usage.route.id]; if (!next) return; onReassign(usage.route.id, device.id, usage.role, next); onChoose(port); }}>Move previous route and use this port</button>{!candidates.length && <small>No compatible free replacement exists. Add another port before using this one.</small>}{usages.length > 1 && <small>This port already has multiple routes. Resolve them in rack settings first.</small>}</div></div>;
  })}{automaticCablePorts && <div className="route-port-auto-create"><span><strong>{t('Add another port')}</strong><small>{t('Automatically placed inside the enclosure; its size grows when required.')}</small></span><div>{(['input','output'] as const).map((direction) => <button key={direction} disabled={!routeCreationPortFits({ serviceCategory: service, direction }, service, firstPort)} onClick={() => onAddPort(automaticEnclosurePort(device, deviceType, service, direction))}><PlugZap size={15} />{t(direction === 'input' ? 'New input' : 'New output')}</button>)}</div></div>}{!automaticCablePorts && (!hasCompatiblePort || deviceType.unlimitedPorts) && <div className="route-port-empty route-port-create"><Cable size={25} /><strong>{hasCompatiblePort ? 'Add another port' : 'No compatible port'}</strong><span>{deviceType.unlimitedPorts ? 'This enclosure expands automatically as installed terminations are added.' : 'Add the required connection here; saving it resumes the route from this exact point.'}</span><div className="route-port-create-body"><ObjectPreview3D type={deviceType} color={device.displayColor ?? deviceType.defaultDisplayColor ?? '#6b747b'} backFace={device.backFace} ports={previewPorts} mode="port" pendingService={service} serviceColors={serviceColors} onPlacePort={(face, position) => { setNewFace(face); setNewPosition(position); }} /><div className="route-port-create-fields"><label className="field"><span>Name</span><input value={newPortName} onChange={(event) => setNewPortName(event.target.value)} /></label><label className="field"><span>Connector</span><input value={newConnector} placeholder="RJ45, terminal, threaded…" onChange={(event) => setNewConnector(event.target.value)} /></label><label className="field"><span>Direction</span><select value={newDirection} onChange={(event) => setNewDirection(event.target.value as DevicePort['direction'])}><option value="input" disabled={role === 'destination' && firstPortDirection === 'input'}>input</option><option value="output" disabled={role === 'destination' && firstPortDirection === 'output'}>output</option><option value="bidirectional">bidirectional</option></select></label><label className="field"><span>Required face space</span><span className="input-with-suffix"><DraftNumberInput min={1} step={.5} value={newSpaceRequiredCm} onCommit={setNewSpaceRequiredCm} /><em>cm</em></span></label><div className={`route-port-position-status ${newPosition ? 'ready' : ''}`}><i /><span>{newPosition ? `Position selected · ${newFace}` : 'Click the connection position on the model'}</span></div><button className="primary" disabled={!newPosition || !newPortName.trim() || !routeCreationPortFits({ serviceCategory: service, direction: newDirection }, service, firstPort)} onClick={saveNewPort}>Save port and continue route</button></div></div></div>}</div><footer><span>{deviceType.unlimitedPorts ? 'Expandable termination enclosure' : 'One installed route per physical port'}</span><button onClick={onClose}>Cancel</button></footer></div></div>;
}
