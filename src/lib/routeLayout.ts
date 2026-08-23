import type { ProjectSnapshot, Route, Vec3 } from '../../shared/types';
import { confineRouteToAssociatedWalls, findRouteIntersections, resolveRouteConflicts, routeLength, routeSurfaceBounds, routeTurnCount } from './geometry';
import { rerouteConcealedRouteViaSurface, type ConcealedRouteSurface } from './project';

export interface RouteLayoutMetrics {
  conflicts: number;
  turns: number;
  lengthMm: number;
}

export interface RouteLayoutIssue {
  id: string;
  floorId: string;
  blockerRouteId: string;
  affectedRouteIds: string[];
  affectedRouteNames: string[];
  focusPoint: Vec3;
  current: RouteLayoutMetrics;
  proposed: RouteLayoutMetrics;
  proposedRoutes: Route[];
}

const routeSignature = (route: Route) => route.points.map((point) => `${point.x},${point.y},${point.z}`).join('|');

export function routeLayoutMetrics(project: ProjectSnapshot, routes: Route[]): RouteLayoutMetrics {
  return {
    conflicts: findRouteIntersections(routes, project.preferences.routeOverlapPriorities, project.preferences.routeSeparationMm, project.preferences.routeDiameterMm).length,
    turns: routes.reduce((total, route) => total + routeTurnCount(route), 0),
    lengthMm: Math.round(routes.reduce((total, route) => total + routeLength(route), 0))
  };
}

function layoutCost(project: ProjectSnapshot, metrics: RouteLayoutMetrics) {
  // One eliminated bend is deliberately worth at least one metre. Physical
  // conflicts remain dominant and can never be traded for a shorter drawing.
  const turnCostMm = Math.max(1_000, project.preferences.routeTurnPenaltyMm);
  return metrics.conflicts * 1_000_000_000 + metrics.turns * turnCostMm + metrics.lengthMm;
}

function routeCandidates(project: ProjectSnapshot, route: Route): Array<{ route: Route; surface?: ConcealedRouteSurface }> {
  const candidates: Array<{ route: Route; surface?: ConcealedRouteSurface }> = [{ route }];
  for (const surface of ['ceiling', 'floor'] as const) {
    const candidate = rerouteConcealedRouteViaSurface(project, route, surface);
    if (candidate && routeSignature(candidate) !== routeSignature(route)) candidates.push({ route: candidate, surface });
  }
  return candidates;
}

function pairIsClose(project: ProjectSnapshot, first: Route, second: Route) {
  const nearSeparations = { ...project.preferences.routeSeparationMm };
  nearSeparations[first.serviceCategory] = Math.max(nearSeparations[first.serviceCategory] ?? 30, 180);
  nearSeparations[second.serviceCategory] = Math.max(nearSeparations[second.serviceCategory] ?? 30, 180);
  return findRouteIntersections([first, second], project.preferences.routeOverlapPriorities, nearSeparations, project.preferences.routeDiameterMm).length > 0;
}

function proposalFocus(routes: Route[]): Vec3 {
  const points = routes.flatMap((route) => route.points);
  if (!points.length) return { x: 0, y: 0, z: 0 };
  const bounds = points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minY: Math.min(result.minY, point.y), maxY: Math.max(result.maxY, point.y),
    minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
  return { x: Math.round((bounds.minX + bounds.maxX) / 2), y: Math.round((bounds.minY + bounds.maxY) / 2), z: Math.round((bounds.minZ + bounds.maxZ) / 2) };
}

function coordinatedProposal(project: ProjectSnapshot, floorRoutes: Route[], blocker: Route, forced: Route, nearby: Route[]): RouteLayoutIssue | undefined {
  const affected = [blocker, ...nearby.filter((route) => route.id !== blocker.id)]; const affectedIds = new Set(affected.map((route) => route.id));
  const stationary = floorRoutes.filter((route) => !affectedIds.has(route.id));
  const selected = new Map<string, Route>();
  for (const route of affected) {
    if (route.id === blocker.id) { selected.set(route.id, forced); continue; }
    const best = routeCandidates(project, route).map((candidate) => candidate.route).sort((first, second) => {
      const firstScore = routeLength(first) + routeTurnCount(first) * Math.max(1_000, project.preferences.routeTurnPenaltyMm);
      const secondScore = routeLength(second) + routeTurnCount(second) * Math.max(1_000, project.preferences.routeTurnPenaltyMm);
      return firstScore - secondScore;
    })[0];
    selected.set(route.id, best);
  }
  // Install the routes that currently pay the detour burden first. The former
  // blocker is solved last, so one route absorbs a necessary clearance instead
  // of forcing every neighbouring service to weave around it.
  const ordered = affected.filter((route) => route.id !== blocker.id).sort((first, second) => {
    const firstBenefit = routeTurnCount(first) - routeTurnCount(selected.get(first.id)!);
    const secondBenefit = routeTurnCount(second) - routeTurnCount(selected.get(second.id)!);
    return secondBenefit - firstBenefit || routeLength(first) - routeLength(second);
  });
  ordered.push(blocker);
  const installed = [...stationary]; const proposedById = new Map<string, Route>();
  for (const original of ordered) {
    const candidate = selected.get(original.id)!;
    const resolved = project.preferences.avoidRouteOverlaps
      ? resolveRouteConflicts(candidate, installed, project.preferences.routeOverlapPriorities, project.preferences.routeSeparationMm, project.preferences.routeDiameterMm, 12, project.walls, project.preferences.routeBendRadiusMm, routeSurfaceBounds(project.floors, candidate.floorId), project.preferences.routeTurnPenaltyMm, project.devices.filter((device) => device.floorId === candidate.floorId)).route
      : candidate;
    const confined = confineRouteToAssociatedWalls(resolved, project.walls);
    installed.push(confined); proposedById.set(confined.id, confined);
  }
  const proposedFloor = floorRoutes.map((route) => proposedById.get(route.id) ?? route);
  const current = routeLayoutMetrics(project, floorRoutes); const proposed = routeLayoutMetrics(project, proposedFloor);
  const changed = affected.filter((route) => routeSignature(proposedById.get(route.id) ?? route) !== routeSignature(route));
  if (changed.length < 2 || proposed.conflicts > current.conflicts || proposed.turns >= current.turns && proposed.conflicts >= current.conflicts || layoutCost(project, proposed) >= layoutCost(project, current)) return undefined;
  const proposedRoutes = changed.map((route) => proposedById.get(route.id)!);
  return {
    id: `layout:${blocker.floorId}:${blocker.id}`,
    floorId: blocker.floorId,
    blockerRouteId: blocker.id,
    affectedRouteIds: changed.map((route) => route.id),
    affectedRouteNames: changed.map((route) => route.name),
    focusPoint: proposalFocus(proposedRoutes),
    current,
    proposed,
    proposedRoutes
  };
}

/**
 * Finds coordinated, floor-wide route improvements. Unlike the point conflict
 * audit, this can move a blocking run and rebuild several dependent runs when
 * that reduces the combined number of bends without introducing new clashes.
 */
export function findRouteLayoutIssues(project: ProjectSnapshot): RouteLayoutIssue[] {
  const issues: RouteLayoutIssue[] = [];
  for (const floor of project.floors) {
    const routes = project.routes.filter((route) => route.floorId === floor.id && !route.locked && route.installationMethod === 'concealed' && route.points.length >= 2);
    if (routes.length < 2) continue;
    const neighbours = new Map<string, Route[]>();
    for (let first = 0; first < routes.length; first++) for (let second = first + 1; second < routes.length; second++) {
      if (!pairIsClose(project, routes[first], routes[second])) continue;
      neighbours.set(routes[first].id, [...neighbours.get(routes[first].id) ?? [], routes[second]]);
      neighbours.set(routes[second].id, [...neighbours.get(routes[second].id) ?? [], routes[first]]);
    }
    const blockers = routes.filter((route) => (neighbours.get(route.id)?.length ?? 0) > 0 && routeCandidates(project, route).length > 1)
      .sort((first, second) => (neighbours.get(second.id)?.length ?? 0) * 10 + routeTurnCount(second) - ((neighbours.get(first.id)?.length ?? 0) * 10 + routeTurnCount(first))).slice(0, 12);
    for (const blocker of blockers) {
      const nearby = (neighbours.get(blocker.id) ?? []).sort((first, second) => routeTurnCount(second) - routeTurnCount(first)).slice(0, 11);
      const proposals = routeCandidates(project, blocker).filter((candidate) => candidate.surface).map((candidate) => coordinatedProposal(project, routes, blocker, candidate.route, nearby)).filter((item): item is RouteLayoutIssue => !!item);
      if (proposals.length) issues.push(proposals.sort((first, second) => layoutCost(project, first.proposed) - layoutCost(project, second.proposed))[0]);
    }
  }
  const deduplicated = new Map<string, RouteLayoutIssue>();
  for (const issue of issues.sort((first, second) => (layoutCost(project, first.current) - layoutCost(project, first.proposed)) - (layoutCost(project, second.current) - layoutCost(project, second.proposed))).reverse()) {
    const key = issue.blockerRouteId;
    if (!deduplicated.has(key)) deduplicated.set(key, issue);
  }
  return [...deduplicated.values()].slice(0, 6);
}
