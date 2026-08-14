import type { ProjectSnapshot, Route, ServiceCategory } from '../../shared/types';

const cleanCode = (value: string, fallback: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12) || fallback;

export function floorRouteCode(project: Pick<ProjectSnapshot, 'floors'>, floorId: string): string {
  const ordered = [...project.floors].sort((a, b) => a.elevationMm - b.elevationMm); const floor = ordered.find((item) => item.id === floorId); if (!floor) return 'XX';
  if (floor.elevationMm === 0) return 'GF';
  if (floor.elevationMm < 0) return `B${ordered.filter((item) => item.elevationMm < 0 && item.elevationMm >= floor.elevationMm).length}`;
  return `F${ordered.filter((item) => item.elevationMm > 0 && item.elevationMm <= floor.elevationMm).length}`;
}

export function nextRouteSequence(routes: Pick<Route, 'name'>[]): number {
  return routes.reduce((maximum, route) => { const match = route.name.match(/(\d+)(?!.*\d)/); return Math.max(maximum, match ? Number(match[1]) : 0); }, 0) + 1;
}

export function formatRouteName(project: Pick<ProjectSnapshot, 'floors' | 'routes' | 'preferences'>, service: ServiceCategory, kind: Route['kind'], floorId: string, sequence = nextRouteSequence(project.routes)): string {
  const prefix = cleanCode(project.preferences.routeNamingPrefixes[service] ?? service.slice(0, 3), 'RT'); const floor = floorRouteCode(project, floorId); const serviceCode = cleanCode(service, 'SERVICE'); const kindCode = cleanCode(kind, 'ROUTE');
  const pattern = project.preferences.routeNamingPattern || '{PREFIX}-{FLOOR}-{SEQ:03}';
  const named = pattern.replace(/\{PREFIX\}/gi, prefix).replace(/\{FLOOR\}/gi, floor).replace(/\{SERVICE\}/gi, serviceCode).replace(/\{KIND\}/gi, kindCode).replace(/\{SEQ(?::(\d+))?\}/gi, (_token, width) => String(sequence).padStart(Math.min(8, Math.max(1, Number(width) || 3)), '0'));
  return named.replace(/[^A-Za-z0-9._+\-=]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '') || `${prefix}-${floor}-${String(sequence).padStart(3, '0')}`;
}
