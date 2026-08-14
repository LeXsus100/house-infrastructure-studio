import type { Device, DevicePort, Route, ServiceCategory } from '../../shared/types';

export type RouteEndpointRole = 'source' | 'destination';

export function portServiceFits(port: Pick<DevicePort, 'serviceCategory'>, service: ServiceCategory): boolean {
  return port.serviceCategory === service || port.serviceCategory === 'generic' || port.serviceCategory === 'custom';
}

export function routesUsingDevicePort(routes: Route[], deviceId: string, portId: string): Array<{ route: Route; role: RouteEndpointRole }> {
  return routes.flatMap((route) => {
    const result: Array<{ route: Route; role: RouteEndpointRole }> = [];
    if (route.sourceDeviceId === deviceId && route.sourcePortId === portId) result.push({ route, role: 'source' });
    if (route.destinationDeviceId === deviceId && route.destinationPortId === portId) result.push({ route, role: 'destination' });
    return result;
  });
}

export function compatibleDevicePorts(device: Device, service: ServiceCategory, role: RouteEndpointRole): DevicePort[] {
  const serviceMatches = device.ports.filter((port) => portServiceFits(port, service));
  return serviceMatches.sort((a, b) => Number(portDirectionFits(b, role)) - Number(portDirectionFits(a, role)));
}

export function routeEndpointDirectionsCoherent(first: Pick<DevicePort, 'direction'> | undefined, second: Pick<DevicePort, 'direction'>): boolean {
  if (!first || first.direction === 'bidirectional' || second.direction === 'bidirectional') return true;
  return first.direction !== second.direction;
}

/** The first route endpoint accepts any service-compatible direction. */
export function routeCreationPortFits(port: Pick<DevicePort, 'serviceCategory' | 'direction'>, service: ServiceCategory, firstPort?: Pick<DevicePort, 'direction'>): boolean {
  return portServiceFits(port, service) && routeEndpointDirectionsCoherent(firstPort, port);
}

export function routeFlowFromEndpointPorts(first?: Pick<DevicePort, 'direction'>, second?: Pick<DevicePort, 'direction'>): NonNullable<Route['flowDirection']> {
  if (first?.direction === 'output') return 'source-to-destination';
  if (first?.direction === 'input') return 'destination-to-source';
  if (second?.direction === 'input') return 'source-to-destination';
  if (second?.direction === 'output') return 'destination-to-source';
  return 'bidirectional';
}

/** Kept for imported projects and callers that only know the second endpoint. */
export function routeFlowFromSecondEndpoint(port?: Pick<DevicePort, 'direction'>): NonNullable<Route['flowDirection']> {
  return routeFlowFromEndpointPorts(undefined, port);
}

export function portDirectionFits(port: DevicePort, role: RouteEndpointRole): boolean {
  if (port.direction === 'bidirectional') return true;
  return role === 'source' ? port.direction !== 'input' : port.direction !== 'output';
}

export function replacementPorts(device: Device, routes: Route[], currentPortId: string, service: ServiceCategory, role: RouteEndpointRole): DevicePort[] {
  return compatibleDevicePorts(device, service, role).filter((port) => port.id !== currentPortId && routesUsingDevicePort(routes, device.id, port.id).length === 0 && portDirectionFits(port, role));
}

export function reassignRouteDevicePort(route: Route, deviceId: string, role: RouteEndpointRole, portId: string): Route {
  if (role === 'source' && route.sourceDeviceId === deviceId) return { ...route, sourcePortId: portId };
  if (role === 'destination' && route.destinationDeviceId === deviceId) return { ...route, destinationPortId: portId };
  return route;
}
