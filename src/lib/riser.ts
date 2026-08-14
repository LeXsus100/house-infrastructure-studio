import type { RiserRouteLink, Route, ServiceCategory, Vec2 } from '../../shared/types';

/** Provides one physical lane per route and expands the sleeve only when those lanes need it. */
export function riserRouteSlots(count: number, pitchMm = 38): Vec2[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    if (index === 0) return { x: 0, z: 0 };
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = pitchMm * Math.sqrt(index);
    return { x: Math.round(Math.cos(angle) * radius), z: Math.round(Math.sin(angle) * radius) };
  });
}

export function effectiveRiserDiameterMm(minimumDiameterMm: number, routeCount: number): number {
  const slots = riserRouteSlots(routeCount);
  const furthest = slots.reduce((maximum, point) => Math.max(maximum, Math.hypot(point.x, point.z)), 0);
  return Math.max(180, minimumDiameterMm, Math.ceil((furthest * 2 + 76) / 10) * 10);
}

export function connectedRiserRoutes(routes: Route[], transitionId: string): Route[] {
  return routes.filter((route) => route.sourceDeviceId === transitionId || route.destinationDeviceId === transitionId);
}

/** Valid links are one-to-one, connect routes on opposite floors, and keep kind/service compatible. */
export function validRiserRouteLinks(routes: Route[], transitionId: string, links: RiserRouteLink[] = []): RiserRouteLink[] {
  const connected = new Map(connectedRiserRoutes(routes, transitionId).map((route) => [route.id, route]));
  const used = new Set<string>();
  return links.filter((link) => {
    const a = connected.get(link.routeAId); const b = connected.get(link.routeBId);
    if (!a || !b || a.floorId === b.floorId || a.kind !== b.kind || a.serviceCategory !== b.serviceCategory || used.has(a.id) || used.has(b.id)) return false;
    used.add(a.id); used.add(b.id); return true;
  });
}

/** One rendered sleeve lane per continuous link, or per unpaired route. */
export function riserRouteGroups(routes: Route[], transitionId: string, links: RiserRouteLink[] = []): Route[][] {
  const connected = connectedRiserRoutes(routes, transitionId); const byId = new Map(connected.map((route) => [route.id, route])); const grouped = new Set<string>(); const groups: Route[][] = [];
  validRiserRouteLinks(routes, transitionId, links).forEach((link) => { const a = byId.get(link.routeAId)!; const b = byId.get(link.routeBId)!; grouped.add(a.id); grouped.add(b.id); groups.push([a, b]); });
  connected.filter((route) => !grouped.has(route.id)).forEach((route) => groups.push([route]));
  return groups;
}

export function transitionContinuityAudit(routes: Route[], transitionId: string, links: RiserRouteLink[] = []) {
  const connected = connectedRiserRoutes(routes, transitionId); const validLinks = validRiserRouteLinks(routes, transitionId, links); const linkedIds = new Set(validLinks.flatMap((link) => [link.routeAId, link.routeBId]));
  return {
    connectedRoutes: connected,
    validLinks,
    unpairedRoutes: connected.filter((route) => !linkedIds.has(route.id)),
    allPaired: connected.length > 0 && linkedIds.size === connected.length
  };
}

export function transitionFlowAudit(routes: Route[], transitionId: string): Array<{ service: ServiceCategory; incoming: number; outgoing: number; undirected: number }> {
  const counts = new Map<ServiceCategory, { incoming: number; outgoing: number; undirected: number }>();
  routes.filter((route) => route.sourceDeviceId === transitionId || route.destinationDeviceId === transitionId).forEach((route) => {
    const item = counts.get(route.serviceCategory) ?? { incoming: 0, outgoing: 0, undirected: 0 };
    if (!route.flowDirection || route.flowDirection === 'bidirectional' || route.flowDirection === 'none') item.undirected += 1;
    else {
      const forward = route.flowDirection === 'source-to-destination';
      const enters = forward ? route.destinationDeviceId === transitionId : route.sourceDeviceId === transitionId;
      if (enters) item.incoming += 1; else item.outgoing += 1;
    }
    counts.set(route.serviceCategory, item);
  });
  return [...counts].map(([service, item]) => ({ service, ...item }));
}
