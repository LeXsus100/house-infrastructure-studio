import type { Device, DevicePort, DeviceType, Route, RouteKind, ServiceCategory } from '../../shared/types';

function installedRouteSpaceMm(route: Route, defaults: Partial<Record<ServiceCategory, number>>): number {
  if (route.kind === 'pipe') return Math.max(route.pipe?.externalDiameterMm ?? 0, defaults[route.serviceCategory] ?? 0);
  if (route.kind === 'duct') return Math.max(route.duct?.diameterMm ?? 0, route.duct?.widthMm ?? 0, route.duct?.heightMm ?? 0, defaults[route.serviceCategory] ?? 0);
  return Math.max(route.conduit?.diameterMm ?? 0, defaults[route.serviceCategory] ?? 0);
}

/** Expands an unlimited-port enclosure to reserve the configured area of every installed termination. */
export function dimensionsForDevicePorts(
  device: Device,
  type: DeviceType,
  ports = device.ports,
  routes: Route[] = [],
  defaultRouteDiameters: Partial<Record<ServiceCategory, number>> = {}
): Device['dimensions'] {
  if (!type.unlimitedPorts) return device.dimensions;
  const connectedSpace = new Map<string, number>(); let unassignedConnections = 0;
  routes.forEach((route) => {
    const portId = route.sourceDeviceId === device.id ? route.sourcePortId : route.destinationDeviceId === device.id ? route.destinationPortId : undefined;
    if (!portId) { if (route.sourceDeviceId === device.id || route.destinationDeviceId === device.id) unassignedConnections++; return; }
    connectedSpace.set(portId, Math.max(connectedSpace.get(portId) ?? 0, installedRouteSpaceMm(route, defaultRouteDiameters) + 10));
  });
  const fallbackSpace = Math.max(10, type.defaultPortSpaceMm ?? 30); const terminationSpaces = ports.map((port) => Math.max(10, port.spaceRequiredMm ?? fallbackSpace, connectedSpace.get(port.id) ?? 0));
  for (let index = 0; index < unassignedConnections; index++) terminationSpaces.push(fallbackSpace);
  const padding = 40; const area = terminationSpaces.reduce((sum, space) => sum + space ** 2, 0);
  const aspect = Math.max(.35, type.defaultDimensions.width / Math.max(1, type.defaultDimensions.height));
  const requiredWidth = Math.ceil(Math.sqrt(area * aspect) + padding); const requiredHeight = Math.ceil(Math.sqrt(area / aspect) + padding);
  const coordinateWidth = ports.reduce((required, port, index) => Math.max(required, (Math.abs(port.position?.x ?? 0) + terminationSpaces[index] / 2 + padding / 4) * 2), 0);
  const coordinateHeight = ports.reduce((required, port, index) => Math.max(required, (Math.abs(port.position?.y ?? 0) + terminationSpaces[index] / 2 + padding / 4) * 2), 0);
  return {
    width: Math.max(type.defaultDimensions.width, requiredWidth, Math.ceil(coordinateWidth)),
    height: Math.max(type.defaultDimensions.height, requiredHeight, Math.ceil(coordinateHeight)),
    depth: Math.max(device.dimensions.depth, type.defaultDimensions.depth)
  };
}

export function supportsAutomaticCablePorts(type: DeviceType, routeKind: RouteKind): boolean {
  return routeKind === 'cable' && type.unlimitedPorts === true && ['junction-box', 'electrical-panel'].includes(type.id);
}

/** Creates the next termination inside an expandable enclosure on a stable grid. */
export function automaticEnclosurePort(device: Device, type: DeviceType, service: ServiceCategory, direction: 'input' | 'output'): DevicePort {
  const spacing = Math.max(10, type.defaultPortSpaceMm ?? 30);
  const placeholder: DevicePort = {
    id: crypto.randomUUID(), deviceId: device.id, name: '', portType: service, direction, serviceCategory: service,
    connectorType: 'terminal', notes: '', position: { x: 0, y: 0, z: 0 }, face: 'back', required: false, spaceRequiredMm: spacing
  };
  const dimensions = dimensionsForDevicePorts(device, type, [...device.ports, placeholder]);
  const padding = Math.min(40, Math.max(16, spacing));
  const columns = Math.max(1, Math.floor((dimensions.width - padding) / spacing));
  const index = device.ports.length; const column = index % columns; const row = Math.floor(index / columns);
  const x = Math.round(-dimensions.width / 2 + padding / 2 + spacing / 2 + column * spacing);
  const y = Math.round(dimensions.height / 2 - padding / 2 - spacing / 2 - row * spacing);
  const z = Math.round(-dimensions.depth / 2 + Math.min(10, dimensions.depth / 4));
  const sameKind = device.ports.filter((port) => port.serviceCategory === service && port.direction === direction).length + 1;
  const label = service === 'data' ? 'Data' : service.charAt(0).toUpperCase() + service.slice(1);
  return { ...placeholder, name: `${label} ${direction} ${sameKind}`, position: { x, y, z } };
}
