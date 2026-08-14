import type { ProjectSnapshot, Route } from '../../shared/types';
import { findJunctionDiagnostics, findRiserDiagnostics } from './diagnostics';
import { validRiserRouteLinks } from './riser';

export interface LightingNetworkIssue {
  id: string;
  kind: 'light' | 'switch' | 'route' | 'junction' | 'riser';
  message: string;
  deviceId?: string;
  routeIds: string[];
}

export interface LightingNetworkAnalysis {
  lightIds: string[];
  switchIds: string[];
  routeIds: string[];
  connectorDeviceIds: string[];
  controlsByLight: Record<string, string[]>;
  lightsBySwitch: Record<string, string[]>;
  issues: LightingNetworkIssue[];
}

const CONNECTOR_TYPES = new Set(['route-junction', 'junction-box', 'electrical-panel', 'floor-transition']);
const lightingCable = (route: Route) => route.kind === 'cable' && ['electrical', 'lighting'].includes(route.serviceCategory);
const routeTouches = (route: Route, deviceId: string) => route.sourceDeviceId === deviceId || route.destinationDeviceId === deviceId;

function link(graph: Map<string, Set<string>>, first: string, second: string) {
  if (first === second) return;
  if (!graph.has(first)) graph.set(first, new Set());
  if (!graph.has(second)) graph.set(second, new Set());
  graph.get(first)!.add(second); graph.get(second)!.add(first);
}

function connectGroup(graph: Map<string, Set<string>>, routeIds: string[]) {
  routeIds.forEach((routeId, index) => routeIds.slice(index + 1).forEach((otherId) => link(graph, routeId, otherId)));
}

function closure(graph: Map<string, Set<string>>, seeds: Iterable<string>) {
  const result = new Set(seeds); const queue = [...result];
  while (queue.length) for (const next of graph.get(queue.shift()!) ?? []) if (!result.has(next)) { result.add(next); queue.push(next); }
  return result;
}

/**
 * Builds lighting continuity only from installed route endpoints and explicit
 * junction/panel/riser correspondences. Manual lighting assignments are not used.
 */
export function analyzeLightingNetwork(project: ProjectSnapshot): LightingNetworkAnalysis {
  const routes = project.routes.filter(lightingCable); const routeById = new Map(routes.map((route) => [route.id, route]));
  const devices = new Map(project.devices.map((device) => [device.id, device]));
  const lights = project.devices.filter((device) => device.typeId === 'light-point');
  const switches = project.devices.filter((device) => device.typeId === 'switch');
  const validGraph = new Map<string, Set<string>>();

  project.devices.filter((device) => ['junction-box', 'electrical-panel'].includes(device.typeId)).forEach((device) => {
    const touching = new Set(routes.filter((route) => routeTouches(route, device.id)).map((route) => route.id));
    for (const group of device.junctionRouteGroups ?? []) {
      const incoming = group.incomingRouteIds.filter((id) => touching.has(id)); const outgoing = group.outgoingRouteIds.filter((id) => touching.has(id));
      if (incoming.length && outgoing.length) connectGroup(validGraph, [...incoming, ...outgoing]);
    }
  });
  project.devices.filter((device) => device.typeId === 'route-junction').forEach((device) => connectGroup(validGraph, routes.filter((route) => routeTouches(route, device.id)).map((route) => route.id)));
  project.devices.filter((device) => device.typeId === 'floor-transition').forEach((device) => {
    validRiserRouteLinks(routes, device.id, device.riserRouteLinks).forEach((item) => link(validGraph, item.routeAId, item.routeBId));
  });

  const terminalRouteIds = new Set([...lights, ...switches].flatMap((device) => routes.filter((route) => routeTouches(route, device.id)).map((route) => route.id)));
  const validNetworkRouteIds = closure(validGraph, terminalRouteIds);
  const involvedConnectorIds = new Set<string>();
  for (const routeId of validNetworkRouteIds) {
    const route = routeById.get(routeId); if (!route) continue;
    for (const endpointId of [route.sourceDeviceId, route.destinationDeviceId]) if (endpointId && CONNECTOR_TYPES.has(devices.get(endpointId)?.typeId ?? '')) involvedConnectorIds.add(endpointId);
  }
  // One audit ring exposes an unassigned continuation without flooding the view
  // with every unrelated circuit attached to a distribution panel.
  const visibleRouteIds = new Set(validNetworkRouteIds);
  for (const connectorId of involvedConnectorIds) routes.filter((route) => routeTouches(route, connectorId)).forEach((route) => visibleRouteIds.add(route.id));

  const routeComponents = new Map<string, Set<string>>();
  for (const routeId of validNetworkRouteIds) if (!routeComponents.has(routeId)) { const component = closure(validGraph, [routeId]); component.forEach((id) => routeComponents.set(id, component)); }
  const controlsByLight: Record<string, string[]> = {}; const lightsBySwitch: Record<string, string[]> = {};
  for (const light of lights) {
    const attached = routes.filter((route) => routeTouches(route, light.id)); const component = new Set(attached.flatMap((route) => [...(routeComponents.get(route.id) ?? new Set([route.id]))]));
    controlsByLight[light.id] = switches.filter((item) => routes.some((route) => component.has(route.id) && routeTouches(route, item.id))).map((item) => item.id);
  }
  for (const item of switches) lightsBySwitch[item.id] = lights.filter((light) => controlsByLight[light.id]?.includes(item.id)).map((light) => light.id);

  const issues: LightingNetworkIssue[] = [];
  lights.filter((light) => !controlsByLight[light.id]?.length).forEach((light) => issues.push({ id: `light:${light.id}`, kind: 'light', deviceId: light.id, routeIds: routes.filter((route) => routeTouches(route, light.id)).map((route) => route.id), message: `${light.name} has no documented cable continuity to a light switch.` }));
  switches.filter((item) => !lightsBySwitch[item.id]?.length).forEach((item) => issues.push({ id: `switch:${item.id}`, kind: 'switch', deviceId: item.id, routeIds: routes.filter((route) => routeTouches(route, item.id)).map((route) => route.id), message: `${item.name} does not control a light point through documented cable continuity.` }));
  for (const route of [...visibleRouteIds].map((id) => routeById.get(id)).filter((item): item is Route => !!item)) {
    if (!route.sourceDeviceId || !route.destinationDeviceId || !devices.has(route.sourceDeviceId) || !devices.has(route.destinationDeviceId)) issues.push({ id: `route:${route.id}`, kind: 'route', routeIds: [route.id], message: `${route.name} has a missing device endpoint.` });
  }
  findJunctionDiagnostics(project).filter((item) => involvedConnectorIds.has(item.device.id)).forEach((item) => issues.push({ id: `junction:${item.device.id}`, kind: 'junction', deviceId: item.device.id, routeIds: item.unassignedRouteIds, message: `${item.device.name}: ${item.message}.` }));
  findRiserDiagnostics(project).filter((item) => involvedConnectorIds.has(item.device.id)).forEach((item) => issues.push({ id: `riser:${item.device.id}`, kind: 'riser', deviceId: item.device.id, routeIds: item.unpairedRouteIds, message: `${item.device.name}: ${item.message}.` }));

  return {
    lightIds: lights.map((item) => item.id), switchIds: switches.map((item) => item.id), routeIds: [...visibleRouteIds], connectorDeviceIds: [...involvedConnectorIds],
    controlsByLight, lightsBySwitch, issues
  };
}

export function lightingVisibleDeviceIds(project: ProjectSnapshot, analysis: LightingNetworkAnalysis): Set<string> {
  return new Set([...analysis.lightIds, ...analysis.switchIds, ...analysis.connectorDeviceIds].filter((id) => project.devices.some((device) => device.id === id)));
}
