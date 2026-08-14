import type { Device, ProjectSnapshot, Route } from '../../shared/types';
import { routeLength } from './geometry';
import { transitionContinuityAudit, transitionFlowAudit } from './riser';

export interface RiserDiagnostic {
  device: Device;
  unpairedRouteIds: string[];
  hasFlowDiscrepancy: boolean;
  message: string;
}

export interface JunctionDiagnostic {
  device: Device;
  unassignedRouteIds: string[];
  invalidGroupIds: string[];
  message: string;
}

export function routeDirectionAtDevice(route: Route, deviceId: string): 'incoming' | 'outgoing' | 'undirected' {
  if (route.flowDirection === 'none' || route.flowDirection === 'bidirectional') return 'undirected';
  const sourceCarriesFlow = route.flowDirection !== 'destination-to-source';
  if (route.sourceDeviceId === deviceId) return sourceCarriesFlow ? 'outgoing' : 'incoming';
  if (route.destinationDeviceId === deviceId) return sourceCarriesFlow ? 'incoming' : 'outgoing';
  return 'undirected';
}

/** Panels and junction boxes must explicitly document which incoming routes continue into which outgoing routes. */
export function findJunctionDiagnostics(project: ProjectSnapshot): JunctionDiagnostic[] {
  return project.devices.filter((device) => ['junction-box', 'electrical-panel'].includes(device.typeId)).flatMap((device) => {
    const related = project.routes.filter((route) => route.sourceDeviceId === device.id || route.destinationDeviceId === device.id);
    if (!related.length) return [];
    const relatedIds = new Set(related.map((route) => route.id)); const counts = new Map<string, number>();
    const groups = device.junctionRouteGroups ?? [];
    for (const group of groups) for (const routeId of [...group.incomingRouteIds, ...group.outgoingRouteIds]) if (relatedIds.has(routeId)) counts.set(routeId, (counts.get(routeId) ?? 0) + 1);
    const unassignedRouteIds = related.filter((route) => (counts.get(route.id) ?? 0) !== 1).map((route) => route.id);
    const invalidGroupIds = groups.filter((group) => {
      const incoming = group.incomingRouteIds.filter((id) => relatedIds.has(id)); const outgoing = group.outgoingRouteIds.filter((id) => relatedIds.has(id));
      if (!incoming.length || !outgoing.length) return true;
      return incoming.some((id) => routeDirectionAtDevice(related.find((route) => route.id === id)!, device.id) === 'outgoing') || outgoing.some((id) => routeDirectionAtDevice(related.find((route) => route.id === id)!, device.id) === 'incoming');
    }).map((group) => group.id);
    const undirected = related.filter((route) => routeDirectionAtDevice(route, device.id) === 'undirected').length;
    if (!unassignedRouteIds.length && !invalidGroupIds.length && !undirected) return [];
    const parts = [unassignedRouteIds.length ? `${unassignedRouteIds.length} unassigned or multiply assigned route${unassignedRouteIds.length === 1 ? '' : 's'}` : '', invalidGroupIds.length ? `${invalidGroupIds.length} incomplete correspondence group${invalidGroupIds.length === 1 ? '' : 's'}` : '', undirected ? `${undirected} route${undirected === 1 ? '' : 's'} without one-way flow` : ''].filter(Boolean);
    return [{ device, unassignedRouteIds, invalidGroupIds, message: parts.join(' · ') }];
  });
}

export function findRiserDiagnostics(project: ProjectSnapshot): RiserDiagnostic[] {
  return project.devices.filter((device) => device.typeId === 'floor-transition').flatMap((device) => {
    const continuity = transitionContinuityAudit(project.routes, device.id, device.riserRouteLinks);
    const flow = transitionFlowAudit(project.routes, device.id);
    const hasFlowDiscrepancy = flow.some((item) => item.undirected > 0 || item.incoming !== item.outgoing);
    if (!continuity.unpairedRoutes.length && !hasFlowDiscrepancy) return [];
    const parts = [continuity.unpairedRoutes.length ? `${continuity.unpairedRoutes.length} unpaired cable/route${continuity.unpairedRoutes.length === 1 ? '' : 's'}` : '', hasFlowDiscrepancy ? 'flow imbalance or missing direction' : ''].filter(Boolean);
    return [{ device, unpairedRouteIds: continuity.unpairedRoutes.map((route) => route.id), hasFlowDiscrepancy, message: parts.join(' · ') }];
  });
}

export function findUnconnectedDevices(project: ProjectSnapshot): Device[] {
  const connected = new Set(project.routes.flatMap((route) => [route.sourceDeviceId, route.destinationDeviceId]).filter((id): id is string => !!id));
  const technicalIds = new Set(project.deviceTypes.filter((type) => type.family === 'device' && type.id !== 'route-junction').map((type) => type.id));
  return project.devices.filter((device) => technicalIds.has(device.typeId) && !connected.has(device.id));
}

/** Cables are expected to terminate at a device or junction within 10 m; the extra metre is the accepted field tolerance. */
export function findOverlengthCables(project: ProjectSnapshot, targetLengthMm = 10_000, toleranceMm = 1_000): Route[] {
  return project.routes.filter((route) => route.kind === 'cable' && routeLength(route, project.preferences?.routeBendRadiusMm?.[route.serviceCategory] ?? 0, (project.walls ?? []).filter((wall) => route.wallIds.includes(wall.id))) > targetLengthMm + toleranceMm);
}
