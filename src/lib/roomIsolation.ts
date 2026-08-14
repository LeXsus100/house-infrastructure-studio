import type { Vec2, Vec3 } from '../../shared/types';
import { pointInPolygon } from './geometry';

interface DistanceInterval { start: number; end: number }

function distance3(a: Vec3, b: Vec3) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end.x - start.x; const dz = end.z - start.z; const lengthSquared = dx * dx + dz * dz || 1;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * ratio), point.z - (start.z + dz * ratio));
}

function onOrInsideBoundary(point: Vec2, boundary: Vec2[], toleranceMm: number) {
  return pointInPolygon(point, boundary) || boundary.some((start, index) => pointToSegmentDistance(point, start, boundary[(index + 1) % boundary.length]) <= toleranceMm);
}

function segmentIntersectionRatio(start: Vec2, end: Vec2, edgeStart: Vec2, edgeEnd: Vec2) {
  const rx = end.x - start.x; const rz = end.z - start.z; const sx = edgeEnd.x - edgeStart.x; const sz = edgeEnd.z - edgeStart.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-7) return undefined;
  const qx = edgeStart.x - start.x; const qz = edgeStart.z - start.z;
  const routeRatio = (qx * sz - qz * sx) / denominator; const edgeRatio = (qx * rz - qz * rx) / denominator;
  return routeRatio >= 0 && routeRatio <= 1 && edgeRatio >= 0 && edgeRatio <= 1 ? routeRatio : undefined;
}

function interpolate(start: Vec3, end: Vec3, ratio: number): Vec3 {
  return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio, z: start.z + (end.z - start.z) * ratio };
}

function pointAtDistance(points: Vec3[], cumulative: number[], distance: number) {
  if (distance <= 0) return { ...points[0] };
  const total = cumulative.at(-1) ?? 0; if (distance >= total) return { ...points.at(-1)! };
  const index = cumulative.findIndex((value) => value >= distance); const startIndex = Math.max(0, index - 1);
  const segmentLength = cumulative[startIndex + 1] - cumulative[startIndex] || 1;
  return interpolate(points[startIndex], points[startIndex + 1], (distance - cumulative[startIndex]) / segmentLength);
}

/**
 * Returns only the portions of a route inside a room, extended along the route by
 * the requested documentation margin. A route that exits and later re-enters the
 * room can produce multiple isolated fragments.
 */
export function clipRouteToRoom(points: Vec3[], boundary: Vec2[], marginMm = 1000, boundaryToleranceMm = 160): Vec3[][] {
  if (points.length < 2 || boundary.length < 3) return [];
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) cumulative.push(cumulative[index - 1] + distance3(points[index - 1], points[index]));
  const total = cumulative.at(-1) ?? 0; if (!total) return onOrInsideBoundary(points[0], boundary, boundaryToleranceMm) ? [[...points]] : [];

  const breaks = new Set<number>([0, total]);
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]; const end = points[index]; const segmentLength = cumulative[index] - cumulative[index - 1];
    boundary.forEach((edgeStart, edgeIndex) => {
      const ratio = segmentIntersectionRatio(start, end, edgeStart, boundary[(edgeIndex + 1) % boundary.length]);
      if (ratio !== undefined) breaks.add(cumulative[index - 1] + segmentLength * ratio);
    });
  }
  const ordered = [...breaks].sort((a, b) => a - b); const visible: DistanceInterval[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const start = ordered[index - 1]; const end = ordered[index]; if (end - start < .01) continue;
    if (onOrInsideBoundary(pointAtDistance(points, cumulative, (start + end) / 2), boundary, boundaryToleranceMm)) visible.push({ start: Math.max(0, start - marginMm), end: Math.min(total, end + marginMm) });
  }
  if (!visible.length) return [];
  const merged = visible.sort((a, b) => a.start - b.start).reduce<DistanceInterval[]>((items, interval) => {
    const previous = items.at(-1); if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end); else items.push({ ...interval }); return items;
  }, []);
  return merged.map((interval) => {
    const fragment = [pointAtDistance(points, cumulative, interval.start)];
    cumulative.forEach((distance, index) => { if (distance > interval.start && distance < interval.end) fragment.push({ ...points[index] }); });
    fragment.push(pointAtDistance(points, cumulative, interval.end));
    return fragment.filter((point, index) => index === 0 || distance3(fragment[index - 1], point) > .01);
  }).filter((fragment) => fragment.length > 1);
}
