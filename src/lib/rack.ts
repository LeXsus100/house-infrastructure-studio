import type { Device, DevicePort, Dimensions3, RackConfiguration, RackModule, RackModulePort, Route, ServiceCategory } from '../../shared/types';

export const PREPARED_RACK_UNITS = 22;
export const PREPARED_RACK_WIDTH_MM = 800;
export const PREPARED_RACK_DEPTH_MM = 1000;
export const rackHeightMm = (totalUnits: number) => Math.round(Math.max(4, totalUnits) * 44.45 + 180);

const port = (
  name: string,
  serviceCategory: ServiceCategory,
  direction: RackModulePort['direction'],
  connectorType: string,
  face: RackModulePort['face'] = 'front',
  row = 1,
  column = 1,
  patch: Partial<RackModulePort> = {}
): RackModulePort => ({
  id: crypto.randomUUID(), name, displayLabel: String(column), serviceCategory, direction, connectorType, face, row, column,
  networkSpeed: serviceCategory === 'data' ? '1 Gbit/s' : undefined,
  poe: serviceCategory === 'data' ? 'none' : undefined,
  mediaType: serviceCategory === 'data' ? 'copper' : undefined,
  notes: '', ...patch
});

const module = (name: string, kind: RackModule['kind'], startUnit: number, heightUnits: number, ports: RackModulePort[], patch: Partial<RackModule> = {}): RackModule => ({
  id: crypto.randomUUID(), name, kind, startUnit, heightUnits, manufacturer: '', model: '', ports, ...patch
});

const ethernetPorts = (count: number, rows: number, speed = '1 Gbit/s'): RackModulePort[] => Array.from({ length: count }, (_, index) => {
  const columns = Math.ceil(count / rows); const row = Math.floor(index / columns) + 1; const column = index % columns + 1;
  return port(`Ethernet ${index + 1}`, 'data', 'bidirectional', 'RJ45', 'front', row, column, { displayLabel: String(index + 1), networkSpeed: speed, poe: '802.3at', mediaType: 'Cat6A copper' });
});

function patchPanel(deviceId: string | undefined, startUnit: number, portCount = 24, rows = portCount > 24 ? 2 : 1, heightUnits = portCount > 24 ? 2 : 1) {
  const ports: RackModulePort[] = []; const externalPorts: DevicePort[] = [];
  const columns = Math.ceil(portCount / Math.max(1, rows)); const panelName = `${portCount}-port patch panel`;
  for (let index = 0; index < portCount; index += 1) {
    const row = Math.floor(index / columns) + 1; const column = index % columns + 1; const displayLabel = String(index + 1);
    const front = port(`Patch ${index + 1} front`, 'data', 'bidirectional', 'RJ45', 'front', row, column, { displayLabel, networkSpeed: '10 Gbit/s', poe: '802.3bt', mediaType: 'Cat6A copper' });
    const rear = port(`Patch ${index + 1} rear`, 'data', 'bidirectional', 'RJ45', 'back', row, column, { displayLabel, networkSpeed: '10 Gbit/s', poe: '802.3bt', mediaType: 'Cat6A copper' });
    front.pairedPortId = rear.id; rear.pairedPortId = front.id;
    if (deviceId) { const external = createRackExternalPort(deviceId, index + 1, `${panelName} · ${displayLabel}`); rear.externalPortId = external.id; externalPorts.push(external); }
    ports.push(front, rear);
  }
  return { module: module(panelName, 'patch-panel', startUnit, heightUnits, ports), externalPorts };
}

function preparedRack(deviceId?: string) {
  const patch48 = patchPanel(deviceId, 12, 48, 2, 2); const patch24 = patchPanel(deviceId, 14, 24, 1, 1); const shelfGroupId = crypto.randomUUID();
  const configuration: RackConfiguration = {
    layoutVersion: 2,
    totalUnits: PREPARED_RACK_UNITS,
    modules: [
      module('UPS', 'ups', 1, 2, [port('AC input', 'electrical', 'input', 'IEC C14', 'back'), port('UPS output', 'electrical', 'output', 'IEC C13', 'back', 1, 2)]),
      module('PDU', 'pdu', 3, 1, [port('PDU input', 'electrical', 'input', 'IEC C14', 'back'), ...Array.from({ length: 8 }, (_, index) => port(`Power ${index + 1}`, 'electrical', 'output', 'IEC C13', 'back', 1, index + 2))]),
      module('NVR', 'nvr', 4, 1, [...Array.from({ length: 8 }, (_, index) => port(`Camera ${index + 1}`, 'data', 'input', 'RJ45', 'front', 1, index + 1, { poe: '802.3at' })), port('LAN', 'data', 'bidirectional', 'RJ45', 'front', 1, 9)]),
      module('NAS', 'nas', 5, 5, [port('LAN 1', 'data', 'bidirectional', 'RJ45'), port('LAN 2', 'data', 'bidirectional', 'RJ45', 'front', 1, 2), port('Power', 'electrical', 'input', 'IEC C14', 'back')], { shelfGroupId, shelfSlot: 0, shelfSlotCount: 3 }),
      module('Router', 'router', 5, 5, [port('WAN', 'data', 'bidirectional', 'RJ45 / fibre'), ...Array.from({ length: 4 }, (_, index) => port(`LAN ${index + 1}`, 'data', 'bidirectional', 'RJ45', 'front', 1, index + 2)), port('Power', 'electrical', 'input', 'DC', 'back')], { shelfGroupId, shelfSlot: 1, shelfSlotCount: 3 }),
      module('Mini PC', 'computer', 5, 5, [port('LAN', 'data', 'bidirectional', 'RJ45'), port('Power', 'electrical', 'input', 'DC', 'back')], { shelfGroupId, shelfSlot: 2, shelfSlotCount: 3 }),
      module('Empty / cable space', 'empty', 10, 1, []),
      module('24-port switch', 'switch', 11, 1, ethernetPorts(24, 1)),
      patch48.module,
      patch24.module,
      module('48-port switch', 'switch', 15, 1, ethernetPorts(48, 2))
    ]
  };
  return { configuration, externalPorts: [...patch48.externalPorts, ...patch24.externalPorts] };
}

/** Prepared residential rack layout; every value remains editable per installed rack. */
export function createDefaultRackConfiguration(): RackConfiguration { return preparedRack().configuration; }

/** Prepared layout plus the rear patch-panel endpoints that house routes can use. */
export function createDefaultRackSystem(deviceId: string): { configuration: RackConfiguration; externalPorts: DevicePort[] } { return preparedRack(deviceId); }

export function rackModulesBottomUp(configuration: RackConfiguration): RackModule[] {
  return [...configuration.modules].sort((a, b) => a.startUnit - b.startUnit || (a.shelfSlot ?? 0) - (b.shelfSlot ?? 0) || a.name.localeCompare(b.name));
}

export function rackUsedUnits(configuration: RackConfiguration): number {
  return configuration.modules.reduce((maximum, item) => Math.max(maximum, item.startUnit + item.heightUnits - 1), 0);
}

export function normalizeRackModules(configuration: RackConfiguration): RackConfiguration {
  let cursor = 1; const groupStarts = new Map<string, number>(); const groupHeights = new Map<string, number>();
  configuration.modules.forEach((item) => { if (item.shelfGroupId) groupHeights.set(item.shelfGroupId, Math.max(groupHeights.get(item.shelfGroupId) ?? 1, Math.max(1, Math.round(item.heightUnits)))); });
  const modules = configuration.modules.map((item) => {
    const heightUnits = Math.max(1, Math.round(item.heightUnits));
    if (!item.shelfGroupId) { const next = { ...item, startUnit: cursor, heightUnits }; cursor += heightUnits; return next; }
    let startUnit = groupStarts.get(item.shelfGroupId); if (!startUnit) { startUnit = cursor; groupStarts.set(item.shelfGroupId, startUnit); cursor += groupHeights.get(item.shelfGroupId) ?? heightUnits; }
    return { ...item, startUnit, heightUnits: groupHeights.get(item.shelfGroupId) ?? heightUnits };
  });
  return { ...configuration, modules };
}

export function rackExternalPortRoutes(routes: Route[], rackId: string, portId: string): Route[] {
  return routes.filter((route) => route.sourceDeviceId === rackId && route.sourcePortId === portId || route.destinationDeviceId === rackId && route.destinationPortId === portId);
}

export function createRackExternalPort(deviceId: string, index: number, name = `Rack connection ${index}`): DevicePort {
  return { id: crypto.randomUUID(), deviceId, name, portType: 'rack patch rear', direction: 'bidirectional', serviceCategory: 'data', connectorType: 'RJ45', networkSpeed: '10 Gbit/s', mediaType: 'Cat6A copper', notes: '', position: { x: 0, y: 0, z: -400 }, face: 'back', required: false };
}

export function createPatchPanel(deviceId: string, startUnit: number, portCount = 24, rows = portCount > 24 ? 2 : 1, heightUnits = portCount > 24 ? 2 : 1) { return patchPanel(deviceId, startUnit, portCount, rows, heightUnits); }

export function createEmptyRackUnit(startUnit: number): RackModule { return module('Empty / cable space', 'empty', startUnit, 1, []); }

function panelPortPosition(configuration: RackConfiguration, rackSize: Dimensions3, rackModule: RackModule, rackPort: RackModulePort) {
  const allOnFace = rackModule.ports.filter((item) => item.face === rackPort.face); const maxColumn = Math.max(1, ...allOnFace.map((item) => item.column)); const maxRow = Math.max(1, ...allOnFace.map((item) => item.row));
  const width = rackSize.width * .84; const x = -width / 2 + width * (rackPort.column - .5) / maxColumn;
  const unitHeight = rackSize.height / Math.max(1, configuration.totalUnits); const moduleBottom = -rackSize.height / 2 + unitHeight * (rackModule.startUnit - 1);
  const y = moduleBottom + unitHeight * rackModule.heightUnits * (1 - (rackPort.row - .5) / maxRow);
  return { x: Math.round(x), y: Math.round(y), z: Math.round((rackPort.face === 'front' ? 1 : -1) * rackSize.depth / 2) };
}

/** Keep generated rear patch endpoints at the exact panel jack after U/layout edits. */
export function synchronizeRackExternalPorts(rack: Pick<Device, 'id' | 'dimensions' | 'ports'>, configuration: RackConfiguration): DevicePort[] {
  const mapped = new Map((rack.ports ?? []).map((item) => [item.id, item])); const rackSize = rack.dimensions ?? { width: 600, height: 1200, depth: 800 };
  for (const rackModule of configuration.modules) for (const rackPort of rackModule.ports) {
    if (!rackPort.externalPortId) continue; const existing = mapped.get(rackPort.externalPortId) ?? createRackExternalPort(rack.id, mapped.size + 1, rackPort.name);
    mapped.set(rackPort.externalPortId, { ...existing, id: rackPort.externalPortId, deviceId: rack.id, name: rackPort.name.replace(/ rear$/i, ''), serviceCategory: rackPort.serviceCategory, connectorType: rackPort.connectorType, networkSpeed: rackPort.networkSpeed, mediaType: rackPort.mediaType, position: panelPortPosition(configuration, rackSize, rackModule, rackPort), face: rackPort.face });
  }
  return [...mapped.values()];
}

export function completeRackModulePort(item: RackModulePort, index = 0): RackModulePort {
  return { ...item, displayLabel: item.displayLabel ?? String(item.column ?? index + 1), face: item.face ?? 'front', row: Math.max(1, item.row ?? 1), column: Math.max(1, item.column ?? index + 1), poe: item.poe ?? (item.serviceCategory === 'data' ? 'none' : undefined) };
}

/** One-time, relationship-safe expansion of earlier prepared racks. */
export function upgradeLegacyPreparedRack(configuration: RackConfiguration, deviceId: string, existingPorts: DevicePort[]) {
  const legacyNames = ['UPS','PDU','NVR','48-port switch','24-port switch','NAS','Router','Mini PC'];
  const isPrepared = legacyNames.every((name) => configuration.modules.some((item) => item.name === name));
  if (configuration.layoutVersion === 2 || !isPrepared) return { configuration: { ...configuration, layoutVersion: configuration.layoutVersion ?? 2, modules: configuration.modules.map((item) => ({ ...item, ports: item.ports.map(completeRackModulePort) })) }, externalPorts: existingPorts };
  const prepared = preparedRack(deviceId);
  const oldByName = new Map(configuration.modules.map((item) => [item.name, item]));
  let modules: RackModule[] = prepared.configuration.modules.map((next) => {
    const old = oldByName.get(next.name); if (!old) return next;
    const oldPorts = new Map(old.ports.map((item) => [item.name, completeRackModulePort(item)]));
    const ports = next.kind === 'switch' ? next.ports.map((template) => { const existing = oldPorts.get(template.name); return existing ? { ...template, ...existing, displayLabel: existing.displayLabel ?? template.displayLabel, row: template.row, column: template.column } : template; }) : old.ports.map(completeRackModulePort);
    return { ...old, kind: next.kind, startUnit: next.startUnit, heightUnits: next.heightUnits, shelfGroupId: next.shelfGroupId, shelfSlot: next.shelfSlot, shelfSlotCount: next.shelfSlotCount, ports };
  });
  const validInternalIds = new Set(modules.flatMap((item) => item.ports.map((rackPort) => rackPort.id)));
  modules = modules.map((item) => ({ ...item, ports: item.ports.map((rackPort) => ({ ...rackPort, connectedPortId: rackPort.connectedPortId && validInternalIds.has(rackPort.connectedPortId) ? rackPort.connectedPortId : undefined, pairedPortId: rackPort.pairedPortId && validInternalIds.has(rackPort.pairedPortId) ? rackPort.pairedPortId : undefined })) }));
  const exposedIds = new Set(modules.flatMap((item) => item.ports.map((rackPort) => rackPort.externalPortId).filter((id): id is string => !!id))); const existingIds = new Set(existingPorts.map((item) => item.id));
  const generatedPorts = prepared.externalPorts.filter((item) => exposedIds.has(item.id) && !existingIds.has(item.id));
  return { configuration: { layoutVersion: 2, totalUnits: PREPARED_RACK_UNITS, modules }, externalPorts: [...existingPorts, ...generatedPorts] };
}
