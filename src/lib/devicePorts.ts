import type { Device, DevicePort, DeviceType, RouteKind, ServiceCategory } from '../../shared/types';

/** Expands an unlimited-port enclosure to reserve the configured face area of every termination. */
export function dimensionsForDevicePorts(device: Device, type: DeviceType, ports = device.ports): Device['dimensions'] {
  if (!type.unlimitedPorts) return device.dimensions;
  const padding = 40; const area = ports.reduce((sum, port) => sum + Math.max(10, port.spaceRequiredMm ?? type.defaultPortSpaceMm ?? 30) ** 2, 0);
  const aspect = Math.max(.35, type.defaultDimensions.width / Math.max(1, type.defaultDimensions.height));
  const requiredWidth = Math.ceil(Math.sqrt(area * aspect) + padding); const requiredHeight = Math.ceil(Math.sqrt(area / aspect) + padding);
  return { width: Math.max(type.defaultDimensions.width, requiredWidth), height: Math.max(type.defaultDimensions.height, requiredHeight), depth: Math.max(device.dimensions.depth, type.defaultDimensions.depth) };
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
