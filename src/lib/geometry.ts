import type { AssociationType, Device, DevicePort, Dimensions3, MountingFace, Route, RouteKind, ServiceCategory, Vec2, Vec3, Wall } from '../../shared/types';

export const MM_PER_M = 1000;
export const roundMm = (value: number) => Math.round(value);
export const mmToM = (value: number) => value / MM_PER_M;
export const mToMm = (value: number) => roundMm(value * MM_PER_M);
export const mmToCm = (value: number) => value / 10;
export const cmToMm = (value: number) => roundMm(value * 10);
export const ceilingRouteHeight = (ceilingHeightMm: number, offsetMm: number) => roundMm(ceilingHeightMm - offsetMm);

export function floorRouteHeight(offsetMm: number, kind: RouteKind, order: RouteKind[], spacingMm: number): number {
  const index = Math.max(0, order.indexOf(kind));
  const cableIndex = Math.max(0, order.indexOf('cable'));
  return Math.min(-1, roundMm(offsetMm + (index - cableIndex) * spacingMm));
}

/** Local wall depth for a concealed route in the lining, never in the structural core. */
export function wallServiceDepthMm(wall: Wall, side: -1 | 1 = 1): number {
  const total = wall.structuralThicknessMm + wall.liningLeftMm + wall.liningRightMm;
  if (side < 0 && wall.liningLeftMm > 0) return roundMm(-total / 2 + wall.liningLeftMm / 2);
  if (side > 0 && wall.liningRightMm > 0) return roundMm(total / 2 - wall.liningRightMm / 2);
  if (wall.liningLeftMm > 0) return roundMm(-total / 2 + wall.liningLeftMm / 2);
  if (wall.liningRightMm > 0) return roundMm(total / 2 - wall.liningRightMm / 2);
  return 0;
}

export function constrainRoutePointToWallLining(wall: Wall, point: Vec3, edgeInsetMm = 5): Vec3 {
  if (point.y < 0 || wall.liningLeftMm <= 0 && wall.liningRightMm <= 0) return point;
  const local = worldToWallLocal(wall, point); const length = wallLength(wall);
  if (local.distanceAlongMm <= edgeInsetMm || local.distanceAlongMm >= length - edgeInsetMm || local.heightMm < 0 || local.heightMm > wall.heightMm) return point;
  const total = wall.thicknessMm; const intervals: Array<{ min: number; max: number; center: number }> = [];
  if (wall.liningLeftMm > 0) { const min = -total / 2; const max = -total / 2 + wall.liningLeftMm; intervals.push({ min, max, center: (min + max) / 2 }); }
  if (wall.liningRightMm > 0) { const min = total / 2 - wall.liningRightMm; const max = total / 2; intervals.push({ min, max, center: (min + max) / 2 }); }
  const interval = intervals.sort((a, b) => Math.abs(local.depthMm - a.center) - Math.abs(local.depthMm - b.center))[0];
  const inset = Math.min(edgeInsetMm, Math.max(0, (interval.max - interval.min) / 2)); const depth = Math.max(interval.min + inset, Math.min(interval.max - inset, local.depthMm));
  return wallLocalToWorld(wall, local.distanceAlongMm, local.heightMm, depth);
}

/**
 * Keeps intermediate wall-run controls inside the finished wall envelope and
 * enforces axis-aligned wall-local runs without moving device endpoints.
 * Floor and ceiling segments sit outside the wall height and remain untouched,
 * so their plan paths may still run diagonally.
 */
export function confineRouteToAssociatedWalls(route: Route, walls: Wall[], proximityMm = 300): Route {
  if (!route.wallIds.length || route.points.length < 2) return route;
  const associated = walls.filter((wall) => route.wallIds.includes(wall.id));
  if (!associated.length) return route;
  let changed = false;
  const points = route.points.map((point, index) => {
    if (index === 0 || index === route.points.length - 1 || point.y < 0) return point;
    const candidate = associated.map((wall) => ({ wall, local: worldToWallLocal(wall, point) }))
      .filter(({ wall, local }) => local.distanceAlongMm >= -5 && local.distanceAlongMm <= wallLength(wall) + 5 && local.heightMm >= 0 && local.heightMm <= wall.heightMm && Math.abs(local.depthMm) <= wall.thicknessMm / 2 + proximityMm)
      .sort((a, b) => Math.abs(a.local.depthMm) - a.wall.thicknessMm / 2 - (Math.abs(b.local.depthMm) - b.wall.thicknessMm / 2))[0];
    if (!candidate) return point;
    const limit = Math.max(0, candidate.wall.thicknessMm / 2 - 5);
    const depth = Math.max(-limit, Math.min(limit, candidate.local.depthMm));
    if (Math.abs(depth - candidate.local.depthMm) <= 1) return point;
    changed = true;
    const confined = wallLocalToWorld(candidate.wall, candidate.local.distanceAlongMm, candidate.local.heightMm, depth);
    return { ...point, ...constrainRoutePointToWallLining(candidate.wall, confined) };
  });
  const orthogonal = orthogonalizeWallRoutePoints(points, associated);
  const geometryChanged = changed || orthogonal.length !== route.points.length || orthogonal.some((point, index) => {
    const previous = route.points[index]; return !previous || distance3(point, previous) > 1;
  });
  if (!geometryChanged) return route;
  return { ...route, points: orthogonal.map((point, order) => ({ ...point, id: 'id' in point && typeof point.id === 'string' ? point.id : crypto.randomUUID(), order })) };
}

/** Applies the project floor-service stack using each service's minimum separation. */
export function stackFloorRoutes(routes: Route[], floorId: string, offsetMm: number, order: RouteKind[], separations: Partial<Record<ServiceCategory, number>>): Route[] {
  return routes.map((route) => {
    if (route.floorId !== floorId) return route;
    const targetY = floorRouteHeight(offsetMm, route.kind, order, separations[route.serviceCategory] ?? 30);
    const belowFloor = route.points.filter((point) => point.y <= 0);
    if (!belowFloor.length) return route;
    const planeWeights = new Map<number, number>();
    route.points.slice(1).forEach((end, index) => { const start = route.points[index]; if (start.y <= 0 && end.y <= 0 && Math.abs(start.y - end.y) <= 1) planeWeights.set(start.y, (planeWeights.get(start.y) ?? 0) + Math.max(1, Math.hypot(end.x - start.x, end.z - start.z))); });
    belowFloor.forEach((point) => { if (!planeWeights.has(point.y)) planeWeights.set(point.y, 1); });
    const currentY = [...planeWeights].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - targetY) - Math.abs(b[0] - targetY))[0][0];
    const delta = targetY - currentY;
    if (!delta) return route;
    const points = route.points.map((point) => {
      if (point.y > 0) return point;
      return { ...point, y: point.y + delta };
    });
    return { ...route, points };
  });
}

export function drywallAreaMm2(wall: Wall, devices: Device[] = []): number {
  const sides = Number(wall.liningLeftMm > 0) + Number(wall.liningRightMm > 0);
  if (!sides) return 0;
  const openingArea = devices.filter((device) => device.wallId === wall.id && ['door-opening', 'window-opening'].includes(device.typeId))
    .reduce((sum, device) => sum + Math.min(wallLength(wall), device.dimensions.width) * Math.min(wall.heightMm, device.dimensions.height), 0);
  return Math.max(0, wallLength(wall) * wall.heightMm - openingArea) * sides;
}

export function verticalTransitionBounds(firstBoundaryMm: number, secondBoundaryMm: number, ceilingOffsetMm: number, minimumHeightMm = 60) {
  const start = Math.min(firstBoundaryMm, secondBoundaryMm); const end = Math.max(firstBoundaryMm, secondBoundaryMm); const span = end - start;
  const requestedInset = Math.max(0, -ceilingOffsetMm); const maximumInset = Math.max(0, (span - minimumHeightMm) / 2); const inset = Math.min(requestedInset, maximumInset);
  const startMm = roundMm(start + inset); const endMm = roundMm(end - inset);
  return { startMm, endMm, centerMm: roundMm((startMm + endMm) / 2), heightMm: Math.max(minimumHeightMm, endMm - startMm), insetMm: roundMm(inset) };
}

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function wallLength(wall: Wall): number {
  return roundMm(distance2(wall.start, wall.end));
}

export function routeLength(route: Pick<Route, 'points'>, bendRadiusMm = 0, walls: Wall[] = []): number {
  const points = bendRadiusMm > 0 ? roundedRoutePoints(route.points, bendRadiusMm, walls) : route.points;
  return roundMm(points.slice(1).reduce((sum, point, index) => sum + distance3(points[index], point), 0));
}

/** Uses an explicit installed envelope first, then the project service default. */
export function routeDisplayDiameterMm(route: Route, defaults: Partial<Record<ServiceCategory, number>>): number {
  const explicit = route.kind === 'cable' ? route.conduit?.diameterMm
    : route.kind === 'pipe' ? route.pipe?.externalDiameterMm
      : route.duct?.diameterMm ?? Math.max(route.duct?.widthMm ?? 0, route.duct?.heightMm ?? 0);
  return Math.max(1, roundMm(explicit && explicit > 0 ? explicit : defaults[route.serviceCategory] ?? 20));
}

/** Larger installed envelopes are rendered volumetrically instead of as flat lines. */
export function routeUsesTubeRendering(route: Route, defaults: Partial<Record<ServiceCategory, number>>, thresholdMm = 40): boolean {
  return routeDisplayDiameterMm(route, defaults) > thresholdMm;
}

export function polygonArea(points: Vec2[]): number {
  if (points.length < 3) return 0;
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  return Math.abs(twiceArea) / 2;
}

export function snapValue(value: number, gridMm: number): number {
  return roundMm(value / gridMm) * gridMm;
}

export function snapPoint(point: Vec2, gridMm: number): Vec2 {
  return { x: snapValue(point.x, gridMm), z: snapValue(point.z, gridMm) };
}

export function nearestEndpoint(point: Vec2, walls: Wall[], toleranceMm = 180): Vec2 | undefined {
  let nearest: Vec2 | undefined;
  let nearestDistance = toleranceMm;
  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const distance = distance2(point, endpoint);
      if (distance <= nearestDistance) {
        nearest = endpoint;
        nearestDistance = distance;
      }
    }
  }
  return nearest ? { ...nearest } : undefined;
}

/** Snaps to the closest projected point anywhere along a wall segment. */
export function nearestWallPoint(point: Vec2, walls: Wall[], toleranceMm = 180): Vec2 | undefined {
  let nearest: Vec2 | undefined;
  let nearestDistance = toleranceMm;
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x; const dz = wall.end.z - wall.start.z;
    const lengthSquared = dx * dx + dz * dz;
    const raw = lengthSquared ? ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / lengthSquared : 0;
    const ratio = Math.max(0, Math.min(1, raw));
    const projected = { x: roundMm(wall.start.x + dx * ratio), z: roundMm(wall.start.z + dz * ratio) };
    const distance = distance2(point, projected);
    if (distance <= nearestDistance) { nearest = projected; nearestDistance = distance; }
  }
  return nearest ? { ...nearest } : undefined;
}

/**
 * Creates non-overlapping rendered butt joints while preserving independent wall records.
 * At a corner one stable wall owns the joint; branches stop at the finished face.
 */
export function wallRenderEndExtensions(wall: Wall, walls: Wall[], toleranceMm = 4): { startMm: number; endMm: number } {
  const wallDx = wall.end.x - wall.start.x; const wallDz = wall.end.z - wall.start.z; const wallMagnitude = Math.hypot(wallDx, wallDz) || 1;
  const extensionAt = (endpoint: Vec2) => {
    const candidates = walls.flatMap((other) => {
      if (other.id === wall.id || other.floorId !== wall.floorId) return [];
      const otherDx = other.end.x - other.start.x; const otherDz = other.end.z - other.start.z; const otherMagnitude = Math.hypot(otherDx, otherDz) || 1;
      const cross = Math.abs(wallDx * otherDz - wallDz * otherDx) / (wallMagnitude * otherMagnitude);
      if (cross < .25) return [];
      const projected = nearestWallPoint(endpoint, [other], toleranceMm);
      if (!projected) return [];
      const reach = Math.round(other.thicknessMm / 2 / cross);
      const meetsOtherEndpoint = distance2(endpoint, other.start) <= toleranceMm || distance2(endpoint, other.end) <= toleranceMm;
      return [meetsOtherEndpoint && wall.id.localeCompare(other.id) < 0 ? reach : -reach];
    });
    return candidates.some((value) => value < 0) ? Math.min(...candidates) : Math.max(0, ...candidates);
  };
  return { startMm: extensionAt(wall.start), endMm: extensionAt(wall.end) };
}

export interface WallRenderIntersectionCut { startMm: number; endMm: number; heightMm: number; otherWallId: string }

/**
 * Removes duplicate rendered volume at true mid-span wall intersections.
 * The stable lexical owner remains continuous; only the later wall is split.
 * Endpoint corners and T branches remain handled by wallRenderEndExtensions.
 */
export function wallRenderIntersectionCuts(wall: Wall, walls: Wall[], toleranceMm = 4): WallRenderIntersectionCut[] {
  const length = wallLength(wall); if (length <= toleranceMm) return [];
  const rx = wall.end.x - wall.start.x; const rz = wall.end.z - wall.start.z;
  return walls.flatMap((other): WallRenderIntersectionCut[] => {
    if (other.id === wall.id || other.floorId !== wall.floorId || wall.id.localeCompare(other.id) < 0) return [];
    const otherLength = wallLength(other); if (otherLength <= toleranceMm) return [];
    const sx = other.end.x - other.start.x; const sz = other.end.z - other.start.z;
    const denominator = rx * sz - rz * sx;
    const normalizedCross = Math.abs(denominator) / (length * otherLength);
    if (normalizedCross < .001) {
      const localStart = worldToWallLocal(wall, { x: other.start.x, y: 0, z: other.start.z });
      const localEnd = worldToWallLocal(wall, { x: other.end.x, y: 0, z: other.end.z });
      if (Math.max(Math.abs(localStart.depthMm), Math.abs(localEnd.depthMm)) > toleranceMm) return [];
      const startMm = Math.max(0, Math.min(localStart.distanceAlongMm, localEnd.distanceAlongMm));
      const endMm = Math.min(length, Math.max(localStart.distanceAlongMm, localEnd.distanceAlongMm));
      return endMm - startMm > toleranceMm ? [{ startMm: roundMm(startMm), endMm: roundMm(endMm), heightMm: Math.min(wall.heightMm, other.heightMm), otherWallId: other.id }] : [];
    }
    const qx = other.start.x - wall.start.x; const qz = other.start.z - wall.start.z;
    const wallRatio = (qx * sz - qz * sx) / denominator;
    const otherRatio = (qx * rz - qz * rx) / denominator;
    const wallInset = toleranceMm / length; const otherInset = toleranceMm / otherLength;
    if (wallRatio <= wallInset || wallRatio >= 1 - wallInset || otherRatio <= otherInset || otherRatio >= 1 - otherInset) return [];
    const centerMm = wallRatio * length; const halfCutMm = other.thicknessMm / 2 / normalizedCross;
    return [{ startMm: roundMm(Math.max(0, centerMm - halfCutMm)), endMm: roundMm(Math.min(length, centerMm + halfCutMm)), heightMm: Math.min(wall.heightMm, other.heightMm), otherWallId: other.id }];
  }).sort((a, b) => a.startMm - b.startMm || a.endMm - b.endMm);
}

export function wallLocalToWorld(wall: Wall, distanceAlongMm: number, heightMm: number, depthMm = 0): Vec3 {
  const length = Math.max(distance2(wall.start, wall.end), 1);
  const tx = (wall.end.x - wall.start.x) / length;
  const tz = (wall.end.z - wall.start.z) / length;
  const nx = -tz;
  const nz = tx;
  return {
    x: roundMm(wall.start.x + tx * distanceAlongMm + nx * depthMm),
    y: roundMm(heightMm),
    z: roundMm(wall.start.z + tz * distanceAlongMm + nz * depthMm)
  };
}

export function worldToWallLocal(wall: Wall, position: Vec3): { distanceAlongMm: number; heightMm: number; depthMm: number } {
  const length = Math.max(distance2(wall.start, wall.end), 1);
  const tx = (wall.end.x - wall.start.x) / length;
  const tz = (wall.end.z - wall.start.z) / length;
  const dx = position.x - wall.start.x;
  const dz = position.z - wall.start.z;
  return {
    distanceAlongMm: roundMm(dx * tx + dz * tz),
    heightMm: roundMm(position.y),
    depthMm: roundMm(dx * -tz + dz * tx)
  };
}

/** Recomputes the wall-local attachment when a wall-mounted object's world coordinates are edited. */
export function projectDevicePositionOntoWall(wall: Wall, requestedPosition: Vec3, centerInWall = false): Pick<Device, 'position' | 'heightFromFloorMm' | 'distanceAlongWallMm' | 'depthInsideWallMm'> {
  const local = worldToWallLocal(wall, requestedPosition);
  const distanceAlongWallMm = Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm));
  const depthInsideWallMm = centerInWall ? 0 : local.depthMm;
  return {
    position: wallLocalToWorld(wall, distanceAlongWallMm, requestedPosition.y, depthInsideWallMm),
    heightFromFloorMm: roundMm(requestedPosition.y),
    distanceAlongWallMm: roundMm(distanceAlongWallMm),
    depthInsideWallMm: roundMm(depthInsideWallMm)
  };
}

/**
 * Finds a wall only when the plan point is physically inside its footprint.
 * This is deliberately not a nearest-wall search: it recovers clicks that the
 * renderer reported on the floor even though the pointer is directly over a wall.
 */
export function wallAtPlanPoint(walls: Wall[], point: Vec2, toleranceMm = 20): Wall | undefined {
  return walls
    .map((wall) => {
      const local = worldToWallLocal(wall, { x: point.x, y: 0, z: point.z });
      const endTolerance = wall.thicknessMm / 2 + toleranceMm;
      const insideLength = local.distanceAlongMm >= -endTolerance && local.distanceAlongMm <= wallLength(wall) + endTolerance;
      const perpendicularDistance = Math.abs(local.depthMm);
      return { wall, insideLength, perpendicularDistance };
    })
    .filter(({ wall, insideLength, perpendicularDistance }) => insideLength && perpendicularDistance <= wall.thicknessMm / 2 + toleranceMm)
    .sort((a, b) => a.perpendicularDistance - b.perpendicularDistance)[0]?.wall;
}

export function reattachDeviceToWall(device: Device, wall: Wall): Device {
  if (device.wallId !== wall.id || device.distanceAlongWallMm == null) return device;
  const position = wallLocalToWorld(wall, Math.min(device.distanceAlongWallMm, wallLength(wall)), device.heightFromFloorMm, device.depthInsideWallMm ?? 0);
  return { ...device, position };
}

export function devicePortWorldPosition(device: Device, port: DevicePort): Vec3 {
  const xAngle = device.rotationDeg.x * Math.PI / 180; const yAngle = device.rotationDeg.y * Math.PI / 180; const zAngle = device.rotationDeg.z * Math.PI / 180;
  const cx = Math.cos(xAngle); const sx = Math.sin(xAngle); const cy = Math.cos(yAngle); const sy = Math.sin(yAngle); const cz = Math.cos(zAngle); const sz = Math.sin(zAngle);
  // Match Three.js' default Euler order (XYZ): local Z, then Y, then X are applied to the vector.
  const afterZ = { x: port.position.x * cz - port.position.y * sz, y: port.position.x * sz + port.position.y * cz, z: port.position.z };
  const afterY = { x: afterZ.x * cy + afterZ.z * sy, y: afterZ.y, z: -afterZ.x * sy + afterZ.z * cy };
  const rotated = { x: afterY.x, y: afterY.y * cx - afterY.z * sx, z: afterY.y * sx + afterY.z * cx };
  return {
    x: roundMm(device.position.x + rotated.x),
    y: roundMm(device.position.y + rotated.y),
    z: roundMm(device.position.z + rotated.z)
  };
}

/** Keeps connected route endpoints on their exact device ports after the device moves or rotates. */
export function reattachRouteEndpointsToDevice(route: Route, device: Device, deviceFloorElevationMm = 0, routeFloorElevationMm = 0): Route {
  if (route.sourceDeviceId !== device.id && route.destinationDeviceId !== device.id || !route.points.length) return route;
  const points = route.points.map((point) => ({ ...point })); const elevationDelta = deviceFloorElevationMm - routeFloorElevationMm;
  const attach = (index: number, portId?: string) => {
    const port = device.ports.find((candidate) => candidate.id === portId); if (!port) return;
    const position = devicePortWorldPosition(device, port); points[index] = { ...points[index], ...position, y: position.y + elevationDelta };
  };
  if (route.sourceDeviceId === device.id) attach(0, route.sourcePortId);
  if (route.destinationDeviceId === device.id) attach(points.length - 1, route.destinationPortId);
  return points.some((point, index) => point.x !== route.points[index].x || point.y !== route.points[index].y || point.z !== route.points[index].z) ? { ...route, points } : route;
}

export function mountingFaceOffset(dimensions: Dimensions3, face: MountingFace): number {
  if (face === 'top' || face === 'bottom') return dimensions.height / 2;
  if (face === 'left' || face === 'right') return dimensions.width / 2;
  return dimensions.depth / 2;
}

/** Recess of the mounted BACK face measured inward from the selected wall surface. */
export function wallBackFaceRecessMm(wall: Wall, dimensions: Dimensions3, backFace: MountingFace, centerDepthMm: number): number {
  return roundMm(wall.thicknessMm / 2 + mountingFaceOffset(dimensions, backFace) - Math.abs(centerDepthMm));
}

/** Convert a surface-relative BACK-face recess to the signed wall-local device centre depth. */
export function wallCenterDepthForBackFaceRecess(wall: Wall, dimensions: Dimensions3, backFace: MountingFace, recessMm: number, direction: -1 | 1): number {
  return roundMm(direction * (wall.thicknessMm / 2 + mountingFaceOffset(dimensions, backFace) - recessMm));
}

export function wallMountedPosition(wall: Wall, surfacePoint: Vec3, dimensions: Dimensions3, backFace: MountingFace, wallSide: 'left' | 'right' | 'center' = 'left'): Vec3 {
  const local = worldToWallLocal(wall, surfacePoint);
  const side = wallSide === 'center' ? (local.depthMm < 0 ? 'right' : 'left') : wallSide;
  const direction = side === 'right' ? -1 : 1;
  const centerDepth = direction * (wall.thicknessMm / 2 + mountingFaceOffset(dimensions, backFace));
  return wallLocalToWorld(
    wall,
    Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)),
    Math.max(0, Math.min(wall.heightMm, local.heightMm)),
    centerDepth
  );
}

export function mountingRotation(backFace: MountingFace, association: AssociationType, wall?: Wall, wallSide: 'left' | 'right' | 'center' = 'left'): Vec3 {
  if (association === 'floor') {
    const rotations: Record<MountingFace, Vec3> = {
      bottom: { x: 0, y: 0, z: 0 }, top: { x: 0, y: 0, z: 180 }, back: { x: -90, y: 0, z: 0 }, front: { x: 90, y: 0, z: 0 }, left: { x: 0, y: 0, z: 90 }, right: { x: 0, y: 0, z: -90 }
    }; return rotations[backFace];
  }
  if (association === 'ceiling') {
    const rotations: Record<MountingFace, Vec3> = {
      top: { x: 0, y: 0, z: 0 }, bottom: { x: 0, y: 0, z: 180 }, back: { x: 90, y: 0, z: 0 }, front: { x: -90, y: 0, z: 0 }, left: { x: 0, y: 0, z: -90 }, right: { x: 0, y: 0, z: 90 }
    }; return rotations[backFace];
  }
  if (association === 'wall' && wall) {
    const wallAngle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x) * 180 / Math.PI; const rightSide = wallSide === 'right'; const direction = rightSide ? -1 : 1; const yaw = -wallAngle + (rightSide ? 180 : 0);
    const rotations: Record<MountingFace, Vec3> = {
      back: { x: 0, y: yaw, z: 0 }, front: { x: 0, y: yaw + 180, z: 0 }, left: { x: 0, y: yaw - 90, z: 0 }, right: { x: 0, y: yaw + 90, z: 0 },
      // A cylinder mounted by its circular base uses TOP/BOTTOM as BACK.
      // Rotate that local Y face onto the selected wall normal.
      top: { x: -direction * 90, y: 0, z: -direction * wallAngle || 0 }, bottom: { x: direction * 90, y: 0, z: direction * wallAngle || 0 }
    }; return rotations[backFace];
  }
  return { x: 0, y: 0, z: 0 };
}

export function preferredDevicePort(device: Device, service: ServiceCategory, role: 'source' | 'destination'): DevicePort | undefined {
  const compatible = device.ports.filter((port) => port.serviceCategory === service || port.serviceCategory === 'generic' || port.serviceCategory === 'custom');
  const preferred = role === 'source' ? ['output', 'bidirectional', 'input'] : ['input', 'bidirectional', 'output'];
  return preferred.map((direction) => compatible.find((port) => port.direction === direction)).find(Boolean);
}

/** Returns the mitered intersection of two laterally offset plan segments. */
export function offsetPolylineCorner(previous: Vec3, point: Vec3, next: Vec3, offsetMm: number): Vec3 {
  const incoming = { x: point.x - previous.x, z: point.z - previous.z }; const outgoing = { x: next.x - point.x, z: next.z - point.z };
  const incomingLength = Math.hypot(incoming.x, incoming.z); const outgoingLength = Math.hypot(outgoing.x, outgoing.z);
  if (incomingLength <= 2 || outgoingLength <= 2) return { ...point };
  const first = { x: incoming.x / incomingLength, z: incoming.z / incomingLength }; const second = { x: outgoing.x / outgoingLength, z: outgoing.z / outgoingLength };
  const firstOrigin = { x: point.x - first.z * offsetMm, z: point.z + first.x * offsetMm }; const secondOrigin = { x: point.x - second.z * offsetMm, z: point.z + second.x * offsetMm };
  const denominator = first.x * second.z - first.z * second.x;
  if (Math.abs(denominator) <= .001) {
    if (first.x * second.x + first.z * second.z < 0) return { ...point };
    return { ...point, x: roundMm(firstOrigin.x), z: roundMm(firstOrigin.z) };
  }
  const delta = { x: secondOrigin.x - firstOrigin.x, z: secondOrigin.z - firstOrigin.z };
  const distanceAlongFirst = (delta.x * second.z - delta.z * second.x) / denominator;
  return { ...point, x: roundMm(firstOrigin.x + first.x * distanceAlongFirst), z: roundMm(firstOrigin.z + first.z * distanceAlongFirst) };
}

/** Removes duplicate, straight-through, and collinear backtracking control points. */
export function simplifyRoutePoints(points: Vec3[]): Vec3[] {
  let result = points.reduce<Vec3[]>((items, point) => {
    if (!items.length || distance3(items[items.length - 1], point) > 1) items.push({ ...point });
    return items;
  }, []);
  let changed = true;
  while (changed && result.length > 2) {
    changed = false; const next: Vec3[] = [result[0]];
    for (let index = 1; index < result.length - 1; index++) {
      const a = next[next.length - 1]; const b = result[index]; const c = result[index + 1];
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
      const cross = Math.hypot(ab.y * bc.z - ab.z * bc.y, ab.z * bc.x - ab.x * bc.z, ab.x * bc.y - ab.y * bc.x);
      const scale = Math.max(1, distance3(a, b) * distance3(b, c));
      // A simple route never benefits from travelling out and immediately back
      // over the same line. Ordinary straight-through controls collapse too.
      if (distance3(a, c) <= 1 || cross <= scale * .0001) { changed = true; continue; }
      next.push(b);
    }
    next.push(result[result.length - 1]);
    result = next.reduce<Vec3[]>((items, point) => { if (!items.length || distance3(items[items.length - 1], point) > 1) items.push(point); return items; }, []);
  }
  return result;
}

/** Counts meaningful 3D direction changes in a route, ignoring duplicate controls. */
export function routeTurnCount(route: Pick<Route, 'points'>): number {
  const points = simplifyRoutePoints(route.points);
  if (points.length < 3) return 0;
  return points.slice(1, -1).reduce((turns, point, index) => {
    const previous = points[index]; const next = points[index + 2];
    const incoming = { x: point.x - previous.x, y: point.y - previous.y, z: point.z - previous.z };
    const outgoing = { x: next.x - point.x, y: next.y - point.y, z: next.z - point.z };
    const incomingLength = Math.hypot(incoming.x, incoming.y, incoming.z); const outgoingLength = Math.hypot(outgoing.x, outgoing.y, outgoing.z);
    if (incomingLength <= 1 || outgoingLength <= 1) return turns;
    const dot = (incoming.x * outgoing.x + incoming.y * outgoing.y + incoming.z * outgoing.z) / (incomingLength * outgoingLength);
    return dot < .9999 ? turns + 1 : turns;
  }, 0);
}

function wallContainsRoutePoint(wall: Wall, point: Vec3, toleranceMm = 12) {
  const local = worldToWallLocal(wall, point);
  return local.distanceAlongMm >= -toleranceMm && local.distanceAlongMm <= wallLength(wall) + toleranceMm && local.heightMm >= -toleranceMm && local.heightMm <= wall.heightMm + toleranceMm && Math.abs(local.depthMm) <= wall.thicknessMm / 2 + toleranceMm;
}

/** Replaces any diagonal segment lying inside one wall with horizontal/vertical wall-local runs. */
export function orthogonalizeWallRoutePoints(points: Vec3[], walls: Wall[]): Vec3[] {
  if (points.length < 2 || !walls.length) return points.map((point) => ({ ...point }));
  const result: Vec3[] = [{ ...points[0] }];
  points.slice(1).forEach((end) => {
    const start = result[result.length - 1];
    const wall = walls.find((candidate) => wallContainsRoutePoint(candidate, start) && wallContainsRoutePoint(candidate, end));
    if (wall) {
      const localStart = worldToWallLocal(wall, start); const localEnd = worldToWallLocal(wall, end);
      if (Math.abs(localEnd.distanceAlongMm - localStart.distanceAlongMm) > 2 && Math.abs(localEnd.heightMm - localStart.heightMm) > 2) {
        const depth = roundMm((localStart.depthMm + localEnd.depthMm) / 2);
        result.push(wallLocalToWorld(wall, localEnd.distanceAlongMm, localStart.heightMm, depth));
      }
    }
    result.push({ ...end });
  });
  return simplifyRoutePoints(result);
}

/**
 * Samples smooth bends around route control points. Floor and ceiling bends use
 * the configured service radius; wall and structural-transition bends are
 * automatically clamped to the available core/lining thickness.
 */
export function roundedRoutePoints(points: Vec3[], bendRadiusMm: number, walls: Wall[] = []): Vec3[] {
  if (points.length < 3 || bendRadiusMm <= 0) return points.map((point) => ({ ...point }));
  const result: Vec3[] = [{ ...points[0] }];
  const push = (point: Vec3) => { const rounded = { x: roundMm(point.x), y: roundMm(point.y), z: roundMm(point.z) }; if (distance3(result[result.length - 1], rounded) > 1) result.push(rounded); };
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]; const corner = points[index]; const next = points[index + 1];
    const incoming = { x: corner.x - previous.x, y: corner.y - previous.y, z: corner.z - previous.z }; const outgoing = { x: next.x - corner.x, y: next.y - corner.y, z: next.z - corner.z };
    const incomingLength = Math.hypot(incoming.x, incoming.y, incoming.z); const outgoingLength = Math.hypot(outgoing.x, outgoing.y, outgoing.z);
    if (incomingLength <= 2 || outgoingLength <= 2) { push(corner); continue; }
    const first = { x: incoming.x / incomingLength, y: incoming.y / incomingLength, z: incoming.z / incomingLength }; const second = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength, z: outgoing.z / outgoingLength };
    const deflection = Math.acos(Math.max(-1, Math.min(1, first.x * second.x + first.y * second.y + first.z * second.z)));
    if (deflection < Math.PI / 36 || deflection > Math.PI * 35 / 36) { push(corner); continue; }
    const structuralWall = walls.find((wall) => wallContainsRoutePoint(wall, corner));
    const lining = structuralWall ? Math.max(structuralWall.liningLeftMm, structuralWall.liningRightMm) : 0;
    const structuralLimit = structuralWall ? Math.max(10, lining > 0 ? lining * .45 : structuralWall.structuralThicknessMm * .2) : bendRadiusMm;
    const radius = Math.min(bendRadiusMm, structuralLimit); const tangentFactor = Math.tan(deflection / 2);
    if (!Number.isFinite(tangentFactor) || tangentFactor <= .001) { push(corner); continue; }
    const tangent = Math.min(radius * tangentFactor, incomingLength * .45, outgoingLength * .45);
    if (tangent <= 2) { push(corner); continue; }
    const entry = { x: corner.x - first.x * tangent, y: corner.y - first.y * tangent, z: corner.z - first.z * tangent };
    const exit = { x: corner.x + second.x * tangent, y: corner.y + second.y * tangent, z: corner.z + second.z * tangent };
    push(entry);
    const steps = Math.max(3, Math.ceil(deflection / (Math.PI / 12)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps; const inverse = 1 - t;
      push({ x: inverse * inverse * entry.x + 2 * inverse * t * corner.x + t * t * exit.x, y: inverse * inverse * entry.y + 2 * inverse * t * corner.y + t * t * exit.y, z: inverse * inverse * entry.z + 2 * inverse * t * corner.z + t * t * exit.z });
    }
  }
  push(points.at(-1)!);
  return result;
}

export function separateCoincidentRoute(points: Vec3[], existingRoutes: Route[], clearanceMm: number, wallConcealed: boolean): Vec3[] {
  if (points.length < 2 || clearanceMm <= 0) return points;
  const verticalOverlap = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => Math.hypot(a.x - b.x, a.z - b.z) <= 2 && Math.hypot(c.x - d.x, c.z - d.z) <= 2 && Math.hypot(a.x - c.x, a.z - c.z) <= Math.max(2, clearanceMm / 2) ? Math.max(0, Math.min(Math.max(a.y,b.y), Math.max(c.y,d.y)) - Math.max(Math.min(a.y,b.y), Math.min(c.y,d.y))) : 0;
  const sharesPath = existingRoutes.some((route) => route.points.slice(1).some((end, index) => points.slice(1).some((candidateEnd, candidateIndex) =>
    Math.max(axisAlignedOverlapLength(points[candidateIndex], candidateEnd, route.points[index], end, Math.max(2, clearanceMm)), verticalOverlap(points[candidateIndex], candidateEnd, route.points[index], end)) > clearanceMm
  )));
  if (!sharesPath) return points;
  const nearbyLaneCount = Math.max(1, existingRoutes.filter((route) => route.points.some((point) => points.some((candidate) => distance3(point, candidate) <= clearanceMm))).length);
  const lane = clearanceMm * Math.ceil(nearbyLaneCount / 2) * (nearbyLaneCount % 2 ? 1 : -1);
  const applyOffset = (point: Vec3, index: number) => {
    if (index === 0 || index === points.length - 1) return { ...point };
    const previous = points[Math.max(0, index - 1)]; const next = points[Math.min(points.length - 1, index + 1)];
    return offsetPolylineCorner(previous, point, next, lane);
  };
  if (points.length > 2) {
    const offset = simplifyRoutePoints(points.map((point, index) => wallConcealed && (index === 1 || index === points.length - 2) ? { ...point } : applyOffset(point, index)));
    return separateResidualCoincidentSegments(offset, existingRoutes, clearanceMm);
  }
  const [start, end] = points; const offsetPoint = (factor: number) => { const point = { x: roundMm(start.x + (end.x - start.x) * factor), y: roundMm(start.y + (end.y - start.y) * factor), z: roundMm(start.z + (end.z - start.z) * factor) }; const dx = end.x - start.x; const dz = end.z - start.z; const length = Math.hypot(dx, dz) || 1; return Math.hypot(dx, dz) <= 2 ? { ...point, x: roundMm(point.x + lane) } : { ...point, x: roundMm(point.x - dz / length * lane), z: roundMm(point.z + dx / length * lane) }; };
  return separateResidualCoincidentSegments([start, offsetPoint(.1), offsetPoint(.9), end], existingRoutes, clearanceMm);
}

/**
 * A corner offset cannot move a coincident run when either neighbouring control
 * changes only elevation. Fan those residual runs into a lateral lane while
 * preserving their installed height and exact endpoint controls.
 */
export function separateResidualCoincidentSegments(points: Vec3[], existingRoutes: Route[], clearanceMm: number): Vec3[] {
  const tolerance = Math.max(2, clearanceMm - 1);
  const verticalOverlap = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, planTolerance: number) => {
    if (Math.hypot(a.x - b.x, a.z - b.z) > 2 || Math.hypot(c.x - d.x, c.z - d.z) > 2 || Math.hypot(a.x - c.x, a.z - c.z) > planTolerance) return 0;
    return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
  };
  const conflicts = (start: Vec3, end: Vec3, planTolerance = tolerance) => existingRoutes.some((route) => route.points.slice(1).some((otherEnd, index) =>
    Math.max(axisAlignedOverlapLength(start, end, route.points[index], otherEnd, planTolerance), verticalOverlap(start, end, route.points[index], otherEnd, planTolerance)) > Math.max(2, clearanceMm)
  ));
  const result: Vec3[] = [{ ...points[0] }];
  points.slice(1).forEach((end, index) => {
    const start = points[index];
    if (!conflicts(start, end)) { result.push({ ...end }); return; }
    const dx = end.x - start.x; const dz = end.z - start.z; const planLength = Math.hypot(dx, dz);
    const normal = planLength > 2 ? { x: -dz / planLength, z: dx / planLength } : { x: 1, z: 0 };
    const laneCandidates: Array<{ start: Vec3; end: Vec3 }> = [];
    const maximumLane = Math.max(2, Math.min(12, existingRoutes.length + 2));
    for (let laneIndex = 1; laneIndex <= maximumLane; laneIndex++) for (const sign of [1, -1]) {
      const lane = clearanceMm * laneIndex * sign;
      laneCandidates.push({
        start: { x: roundMm(start.x + normal.x * lane), y: start.y, z: roundMm(start.z + normal.z * lane) },
        end: { x: roundMm(end.x + normal.x * lane), y: end.y, z: roundMm(end.z + normal.z * lane) }
      });
    }
    const lane = laneCandidates.find((candidate) => !conflicts(candidate.start, candidate.end)) ?? laneCandidates.at(-1)!;
    if (distance3(result[result.length - 1], lane.start) > 1) result.push(lane.start);
    if (distance3(result[result.length - 1], lane.end) > 1) result.push(lane.end);
    if (distance3(result[result.length - 1], end) > 1) result.push({ ...end });
  });
  return simplifyRoutePoints(result);
}

function planParallelOverlap(firstStart: Vec3, firstEnd: Vec3, secondStart: Vec3, secondEnd: Vec3, toleranceMm: number): number {
  const firstAlongX = Math.abs(firstStart.z - firstEnd.z) <= toleranceMm; const secondAlongX = Math.abs(secondStart.z - secondEnd.z) <= toleranceMm;
  const firstAlongZ = Math.abs(firstStart.x - firstEnd.x) <= toleranceMm; const secondAlongZ = Math.abs(secondStart.x - secondEnd.x) <= toleranceMm;
  if (firstAlongX && secondAlongX && Math.abs(firstStart.z - secondStart.z) <= toleranceMm) return Math.max(0, Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x)) - Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x)));
  if (firstAlongZ && secondAlongZ && Math.abs(firstStart.x - secondStart.x) <= toleranceMm) return Math.max(0, Math.min(Math.max(firstStart.z, firstEnd.z), Math.max(secondStart.z, secondEnd.z)) - Math.max(Math.min(firstStart.z, firstEnd.z), Math.min(secondStart.z, secondEnd.z)));
  return 0;
}

/** Keeps a new shared corridor at the installed elevation of the best-overlapping existing route. */
export function alignRouteToSharedElevation(points: Vec3[], existingRoutes: Route[], clearanceMm: number): Vec3[] {
  if (points.length < 3 || !existingRoutes.length) return points;
  const tolerance = Math.max(200, clearanceMm * 6); let selectedY: number | undefined; let bestOverlap = 0;
  points.slice(1).forEach((end, index) => existingRoutes.forEach((route) => route.points.slice(1).forEach((otherEnd, otherIndex) => {
    const otherStart = route.points[otherIndex]; if (Math.abs(otherStart.y - otherEnd.y) > 2) return;
    const overlap = planParallelOverlap(points[index], end, otherStart, otherEnd, tolerance);
    if (overlap > bestOverlap) { bestOverlap = overlap; selectedY = roundMm((otherStart.y + otherEnd.y) / 2); }
  })));
  if (selectedY == null || bestOverlap < Math.max(100, clearanceMm * 2)) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return { ...point };
    const previous = points[index - 1]; const next = points[index + 1];
    const participatesInRun = Math.hypot(point.x - previous.x, point.z - previous.z) >= 100 || Math.hypot(next.x - point.x, next.z - point.z) >= 100;
    return participatesInRun ? { ...point, y: selectedY! } : { ...point };
  });
}

function planSegmentIntersection(firstStart: Vec3, firstEnd: Vec3, secondStart: Vec3, secondEnd: Vec3) {
  const r = { x: firstEnd.x - firstStart.x, z: firstEnd.z - firstStart.z }; const s = { x: secondEnd.x - secondStart.x, z: secondEnd.z - secondStart.z };
  const denominator = r.x * s.z - r.z * s.x; if (Math.abs(denominator) < .001) return undefined;
  const delta = { x: secondStart.x - firstStart.x, z: secondStart.z - firstStart.z };
  const firstRatio = (delta.x * s.z - delta.z * s.x) / denominator; const secondRatio = (delta.x * r.z - delta.z * r.x) / denominator;
  // Ignore only the mathematical endpoint itself. A percentage-based exclusion
  // can hide a real crossing hundreds of millimetres from the endpoint on a
  // long residential run; shared-device terminal exemptions are handled by the
  // full 3D intersection audit instead.
  if (firstRatio <= .001 || firstRatio >= .999 || secondRatio <= .001 || secondRatio >= .999) return undefined;
  return { firstRatio, secondRatio, point: { x: roundMm(firstStart.x + r.x * firstRatio), z: roundMm(firstStart.z + r.z * firstRatio) } };
}

/** Adds a brief vertical dogleg only where a same-elevation route actually crosses another route. */
export function addVerticalClearanceAtCrossings(points: Vec3[], existingRoutes: Route[], clearanceMm: number, minimumY: number, maximumY: number): Vec3[] {
  if (points.length < 2 || clearanceMm <= 0) return points;
  const result: Vec3[] = [{ ...points[0] }];
  points.slice(1).forEach((end, index) => {
    const start = points[index]; const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (length < 120 || Math.abs(start.y - end.y) > 2) { result.push({ ...end }); return; }
    const crossings = existingRoutes.flatMap((route) => route.points.slice(1).map((otherEnd, otherIndex) => {
      const otherStart = route.points[otherIndex]; if (Math.abs(otherStart.y - otherEnd.y) > 2) return undefined;
      const intersection = planSegmentIntersection(start, end, otherStart, otherEnd); if (!intersection) return undefined;
      const otherY = otherStart.y + (otherEnd.y - otherStart.y) * intersection.secondRatio; const ownY = start.y;
      return Math.abs(ownY - otherY) < clearanceMm ? intersection : undefined;
    }).filter((item): item is NonNullable<typeof item> => !!item)).sort((a, b) => a.firstRatio - b.firstRatio);
    if (!crossings.length) { result.push({ ...end }); return; }
    const ownY = start.y; const liftedY = ownY + clearanceMm <= maximumY ? ownY + clearanceMm : Math.max(minimumY, ownY - clearanceMm); const approachRatio = Math.min(.12, 120 / length);
    crossings.forEach(({ firstRatio, point }) => {
      const beforeRatio = Math.max(0, firstRatio - approachRatio); const afterRatio = Math.min(1, firstRatio + approachRatio);
      const before = { x: roundMm(start.x + (end.x - start.x) * beforeRatio), y: ownY, z: roundMm(start.z + (end.z - start.z) * beforeRatio) };
      const after = { x: roundMm(start.x + (end.x - start.x) * afterRatio), y: ownY, z: roundMm(start.z + (end.z - start.z) * afterRatio) };
      [before, { ...before, y: liftedY }, { x: point.x, y: liftedY, z: point.z }, { ...after, y: liftedY }, after].forEach((pointToAdd) => { if (distance3(result[result.length - 1], pointToAdd) > 1) result.push(pointToAdd); });
    });
    if (distance3(result[result.length - 1], end) > 1) result.push({ ...end });
  });
  return result;
}

export interface RouteIntersection { id: string; routeAId: string; routeBId: string; point: Vec3; severity: number; label: string }

/** Minimum centreline distance that preserves both the configured service gap and the routes' physical envelopes. */
export function routePairClearanceMm(first: Route, second: Route, separations: Partial<Record<ServiceCategory, number>> = {}, diameters: Partial<Record<ServiceCategory, number>> = {}): number {
  const physicalClearance = (routeDisplayDiameterMm(first, diameters) + routeDisplayDiameterMm(second, diameters)) / 2;
  return Math.ceil(Math.max(10, separations[first.serviceCategory] ?? 30, separations[second.serviceCategory] ?? 30, physicalClearance));
}

export function findRouteIntersections(routes: Route[], priorities: Partial<Record<ServiceCategory, number>>, separations: Partial<Record<ServiceCategory, number>> = {}, diameters: Partial<Record<ServiceCategory, number>> = {}): RouteIntersection[] {
  const found: RouteIntersection[] = [];
  for (let firstIndex = 0; firstIndex < routes.length; firstIndex++) for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex++) {
    const first = routes[firstIndex]; const second = routes[secondIndex]; if (first.floorId !== second.floorId) continue;
    first.points.slice(1).forEach((endA, indexA) => second.points.slice(1).forEach((endB, indexB) => {
      const closest = closestSegmentApproach(first.points[indexA], endA, second.points[indexB], endB); const clearance = routePairClearanceMm(first, second, separations, diameters);
      if (closest.distance >= clearance) return;
      const sharedDevice = [first.sourceDeviceId, first.destinationDeviceId].some((id) => !!id && [second.sourceDeviceId, second.destinationDeviceId].includes(id));
      const bothAtEnds = (closest.firstRatio <= .015 || closest.firstRatio >= .985) && (closest.secondRatio <= .015 || closest.secondRatio >= .985);
      const withinTerminalEnvelope = Math.min(closest.firstRatio, 1 - closest.firstRatio) * distance3(first.points[indexA], endA) <= clearance
        && Math.min(closest.secondRatio, 1 - closest.secondRatio) * distance3(second.points[indexB], endB) <= clearance;
      const parallelOverlap = axisAlignedOverlapLength(first.points[indexA], endA, second.points[indexB], endB, clearance);
      // The common terminal point itself is unavoidable, but a long shared span
      // after that terminal still needs its own physical lane.
      if (sharedDevice && (bothAtEnds || withinTerminalEnvelope) && parallelOverlap <= clearance) return;
      const point = { x: roundMm((closest.first.x + closest.second.x) / 2), y: roundMm((closest.first.y + closest.second.y) / 2), z: roundMm((closest.first.z + closest.second.z) / 2) };
      if (found.some((item) => item.routeAId === first.id && item.routeBId === second.id && distance3(item.point, point) <= clearance / 2)) return;
      const severity = Math.max(1, 6 - Math.min(priorities[first.serviceCategory] ?? 4, priorities[second.serviceCategory] ?? 4));
      found.push({ id: `${first.id}:${indexA}:${second.id}:${indexB}`, routeAId: first.id, routeBId: second.id, point, severity, label: `${first.name} × ${second.name} · ${Math.round(closest.distance)} mm clearance` });
    }));
  }
  return found.sort((a, b) => b.severity - a.severity);
}

function closestSegmentApproach(firstStart: Vec3, firstEnd: Vec3, secondStart: Vec3, secondEnd: Vec3) {
  const u = { x: firstEnd.x - firstStart.x, y: firstEnd.y - firstStart.y, z: firstEnd.z - firstStart.z };
  const v = { x: secondEnd.x - secondStart.x, y: secondEnd.y - secondStart.y, z: secondEnd.z - secondStart.z };
  const w = { x: firstStart.x - secondStart.x, y: firstStart.y - secondStart.y, z: firstStart.z - secondStart.z };
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const a = dot(u, u); const b = dot(u, v); const c = dot(v, v); const d = dot(u, w); const e = dot(v, w); const denominator = a * c - b * b; const epsilon = .000001;
  let firstNumerator = denominator; let firstDenominator = denominator; let secondNumerator = denominator; let secondDenominator = denominator;
  if (denominator < epsilon) { firstNumerator = 0; firstDenominator = 1; secondNumerator = e; secondDenominator = c; }
  else { firstNumerator = b * e - c * d; secondNumerator = a * e - b * d; if (firstNumerator < 0) { firstNumerator = 0; secondNumerator = e; secondDenominator = c; } else if (firstNumerator > firstDenominator) { firstNumerator = firstDenominator; secondNumerator = e + b; secondDenominator = c; } }
  if (secondNumerator < 0) { secondNumerator = 0; if (-d < 0) firstNumerator = 0; else if (-d > a) firstNumerator = firstDenominator; else { firstNumerator = -d; firstDenominator = a; } }
  else if (secondNumerator > secondDenominator) { secondNumerator = secondDenominator; if (-d + b < 0) firstNumerator = 0; else if (-d + b > a) firstNumerator = firstDenominator; else { firstNumerator = -d + b; firstDenominator = a; } }
  const firstRatio = Math.abs(firstNumerator) < epsilon ? 0 : firstNumerator / firstDenominator; const secondRatio = Math.abs(secondNumerator) < epsilon ? 0 : secondNumerator / secondDenominator;
  const first = { x: firstStart.x + firstRatio * u.x, y: firstStart.y + firstRatio * u.y, z: firstStart.z + firstRatio * u.z };
  const second = { x: secondStart.x + secondRatio * v.x, y: secondStart.y + secondRatio * v.y, z: secondStart.z + secondRatio * v.z };
  return { first, second, firstRatio, secondRatio, distance: distance3(first, second) };
}

export function proposeRouteClearanceSolution(route: Route, point: Vec3, clearanceMm: number, obstacles: Route[] = [], walls: Wall[] = [], targetRouteId?: string): Route {
  let nearest = 0; let best = Number.POSITIVE_INFINITY; let nearestRatio = .5;
  route.points.slice(1).forEach((end, index) => {
    const start = route.points[index]; const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }; const lengthSquared = delta.x ** 2 + delta.y ** 2 + delta.z ** 2 || 1;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y + (point.z - start.z) * delta.z) / lengthSquared));
    const projected = { x: start.x + delta.x * ratio, y: start.y + delta.y * ratio, z: start.z + delta.z * ratio }; const distance = distance3(projected, point);
    if (distance < best) { best = distance; nearest = index; nearestRatio = ratio; }
  });
  const start = route.points[nearest]; const end = route.points[nearest + 1]; const segmentLength = Math.max(1, distance3(start, end)); const direction = { x: (end.x - start.x) / segmentLength, y: (end.y - start.y) / segmentLength, z: (end.z - start.z) / segmentLength };
  const center = { x: roundMm(start.x + (end.x - start.x) * nearestRatio), y: roundMm(start.y + (end.y - start.y) * nearestRatio), z: roundMm(start.z + (end.z - start.z) * nearestRatio) };
  const approach = Math.min(300, Math.max(100, clearanceMm * 3)); const beforeDistance = Math.min(approach, nearestRatio * segmentLength); const afterDistance = Math.min(approach, (1 - nearestRatio) * segmentLength);
  const before = { x: roundMm(center.x - direction.x * beforeDistance), y: roundMm(center.y - direction.y * beforeDistance), z: roundMm(center.z - direction.z * beforeDistance) }; const after = { x: roundMm(center.x + direction.x * afterDistance), y: roundMm(center.y + direction.y * afterDistance), z: roundMm(center.z + direction.z * afterDistance) };
  const offset = Math.max(50, clearanceMm + 25); const candidates: Route[] = [];
  const candidateFromDetour = (shift: Vec3) => {
    const detour = [before, { x: before.x + shift.x, y: before.y + shift.y, z: before.z + shift.z }, { x: after.x + shift.x, y: after.y + shift.y, z: after.z + shift.z }, after];
    const added = detour.map((routePoint) => ({ ...routePoint, id: crypto.randomUUID(), order: 0 })); const points = simplifyRoutePoints([...route.points.slice(0, nearest + 1), ...added, ...route.points.slice(nearest + 1)]).map((routePoint, order) => ({ ...routePoint, id: crypto.randomUUID(), order }));
    const floorConcealed = !route.wallIds.length && center.y <= 50;
    if (points.every((routePoint) => routePoint.y >= (floorConcealed ? -500 : 0))) candidates.push({ ...route, points });
  };
  const associatedWalls = walls.filter((wall) => route.wallIds.includes(wall.id));
  const wallOnly = route.wallIds.length > 0 && (!walls.length || route.points.slice(1).every((end, index) => associatedWalls.some((wall) => routeSegmentsOnWall({ points: [route.points[index], end] }, wall).length > 0)));
  const floorConcealed = !route.wallIds.length && center.y <= 50;
  if (floorConcealed) { candidateFromDetour({ x: 0, y: offset, z: 0 }); candidateFromDetour({ x: 0, y: -offset, z: 0 }); }
  else { candidateFromDetour({ x: 0, y: offset, z: 0 }); candidateFromDetour({ x: 0, y: -offset, z: 0 }); }
  const conflictWall = associatedWalls.find((wall) => routeSegmentsOnWall({ points: [start, end] }, wall).length > 0);
  const verticalSegment = Math.hypot(direction.x, direction.z) <= .01 && Math.abs(direction.y) > .9;
  if (conflictWall && verticalSegment) {
    const length = Math.max(1, wallLength(conflictWall)); const normal = { x: -(conflictWall.end.z - conflictWall.start.z) / length, y: 0, z: (conflictWall.end.x - conflictWall.start.x) / length };
    // A vertical and a horizontal service necessarily intersect in the wall's
    // elevation plane. Pass briefly through a different valid depth layer,
    // then return to the configured lining centreline.
    candidateFromDetour({ x: normal.x * offset, y: 0, z: normal.z * offset });
    candidateFromDetour({ x: -normal.x * offset, y: 0, z: -normal.z * offset });
  }
  if (wallOnly) {
    const first = route.points[0]; const last = route.points.at(-1)!;
    for (const direction of [1, -1]) {
      const laneY = direction > 0 ? Math.max(first.y, last.y) + offset : Math.min(first.y, last.y) - offset;
      if (laneY < 0) continue;
      const lane = [first, { x: first.x, y: laneY, z: first.z }, { x: last.x, y: laneY, z: last.z }, last];
      candidates.push({ ...route, points: simplifyRoutePoints(lane).map((routePoint, order) => ({ ...routePoint, id: crypto.randomUUID(), order })) });
    }
  }
  const planLength = Math.hypot(direction.x, direction.z);
  if (!wallOnly && planLength > .01) {
    const normal = { x: -direction.z / planLength * offset, y: 0, z: direction.x / planLength * offset };
    candidateFromDetour(normal); candidateFromDetour({ x: -normal.x, y: 0, z: -normal.z });
  }
  if (!route.wallIds.length && planLength > .01) {
    const first = route.points[0]; const last = route.points[route.points.length - 1]; const planeY = center.y;
    const wholeRouteAllowance = Math.min(1500, Math.max(500, routeLength(route) * .25));
    const wholeRouteCandidates = [
      [first, { x: first.x, y: planeY, z: first.z }, { x: last.x, y: planeY, z: first.z }, { x: last.x, y: planeY, z: last.z }, last],
      [first, { x: first.x, y: planeY, z: first.z }, { x: first.x, y: planeY, z: last.z }, { x: last.x, y: planeY, z: last.z }, last]
    ].map((candidate) => ({ ...route, points: simplifyRoutePoints(candidate).map((routePoint, order) => ({ ...routePoint, id: crypto.randomUUID(), order })) }));
    wholeRouteCandidates.filter((candidate) => routeLength(candidate) <= routeLength(route) + wholeRouteAllowance).forEach((candidate) => candidates.push(candidate));
  }
  if (!candidates.length) return route;
  const otherRoutes = obstacles.filter((candidate) => candidate.id !== route.id); const separations = Object.fromEntries([route, ...otherRoutes].map((candidate) => [candidate.serviceCategory, clearanceMm])) as Partial<Record<ServiceCategory, number>>;
  const score = (candidate: Route) => {
    const conflicts = otherRoutes.flatMap((other) => findRouteIntersections([candidate, other], {}, separations));
    const targetRemains = targetRouteId ? conflicts.some((item) => item.routeAId === targetRouteId || item.routeBId === targetRouteId) : false;
    const conflictingRoutes = new Set(conflicts.map((item) => item.routeAId === candidate.id ? item.routeBId : item.routeAId)).size;
    // First make progress on the specific conflict being reviewed, then reduce
    // the number of affected routes. Raw segment-pair counts are secondary so
    // a valid dogleg is not rejected merely because it briefly approaches the
    // same terminal route in two small segments.
    return Number(targetRemains) * 1_000_000_000_000 + conflictingRoutes * 10_000_000_000 + conflicts.length * 100_000_000 + routeLength(candidate) + Math.max(0, candidate.points.length - route.points.length) * 10;
  };
  return candidates.reduce((selected, candidate) => score(candidate) < score(selected) ? candidate : selected);
}

export function resolveRouteConflicts(route: Route, existingRoutes: Route[], priorities: Partial<Record<ServiceCategory, number>>, separations: Partial<Record<ServiceCategory, number>>, diameters: Partial<Record<ServiceCategory, number>> = {}, maximumAttempts = 10, walls: Wall[] = []) {
  const conflictsFor = (candidate: Route) => existingRoutes.flatMap((other) => findRouteIntersections([other, candidate], priorities, separations, diameters));
  const initiallyConflictingIds = new Set(conflictsFor(route).map((item) => item.routeAId === route.id ? item.routeBId : item.routeAId));
  const laneClearance = Math.max(separations[route.serviceCategory] ?? 30, routeDisplayDiameterMm(route, diameters), ...existingRoutes.filter((item) => initiallyConflictingIds.has(item.id)).map((item) => routePairClearanceMm(route, item, separations, diameters)));
  const associatedWalls = walls.filter((wall) => route.wallIds.includes(wall.id));
  const wallOnly = route.wallIds.length > 0 && (!walls.length || route.points.slice(1).every((end, index) => associatedWalls.some((wall) => routeSegmentsOnWall({ points: [route.points[index], end] }, wall).length > 0)));
  const mayApplyWholeRouteLane = !route.wallIds.length || wallOnly;
  const lateralLaneFitsServiceEnvelope = !wallOnly || routeDisplayDiameterMm(route, diameters) <= (separations[route.serviceCategory] ?? 30);
  const lanePoints = mayApplyWholeRouteLane && lateralLaneFitsServiceEnvelope
    ? separateCoincidentRoute(route.points, existingRoutes, laneClearance, wallOnly)
    : separateResidualCoincidentSegments(route.points, existingRoutes, laneClearance);
  const laneRoute = lanePoints === route.points ? route : { ...route, points: lanePoints.map((point, order) => ({ ...point, id: 'id' in point && typeof point.id === 'string' ? point.id : crypto.randomUUID(), order })) };
  let current = laneRoute; let best = laneRoute; let bestConflicts = conflictsFor(laneRoute); const seen = new Set<string>();
  for (let attempt = 0; attempt < maximumAttempts && bestConflicts.length; attempt++) {
    const currentConflicts = conflictsFor(current); if (!currentConflicts.length) return { route: current, remainingConflicts: 0 };
    const conflict = currentConflicts[0]; const otherRouteId = conflict.routeAId === current.id ? conflict.routeBId : conflict.routeAId; const otherRoute = existingRoutes.find((item) => item.id === otherRouteId); const clearance = otherRoute ? routePairClearanceMm(current, otherRoute, separations, diameters) : Math.max(10, separations[current.serviceCategory] ?? 30, routeDisplayDiameterMm(current, diameters));
    const candidate = proposeRouteClearanceSolution(current, conflict.point, clearance, existingRoutes, walls, otherRouteId); const signature = candidate.points.map((point) => `${point.x},${point.y},${point.z}`).join('|');
    if (seen.has(signature)) break; seen.add(signature); current = candidate;
    const candidateConflicts = conflictsFor(candidate);
    if (candidateConflicts.length < bestConflicts.length || candidateConflicts.length === bestConflicts.length && routeLength(candidate) < routeLength(best)) { best = candidate; bestConflicts = candidateConflicts; }
    if (!candidateConflicts.length) return { route: candidate, remainingConflicts: 0 };
  }
  return { route: best, remainingConflicts: bestConflicts.length };
}

export function orderWallBoundary(walls: Wall[], toleranceMm = 2): Vec2[] | null {
  if (walls.length < 3) return null;
  const unused = [...walls];
  const first = unused.shift()!;
  const boundary: Vec2[] = [{ ...first.start }, { ...first.end }];
  let cursor = first.end;
  while (unused.length) {
    const index = unused.findIndex((wall) => distance2(wall.start, cursor) <= toleranceMm || distance2(wall.end, cursor) <= toleranceMm);
    if (index < 0) return null;
    const wall = unused.splice(index, 1)[0];
    const next = distance2(wall.start, cursor) <= toleranceMm ? wall.end : wall.start;
    boundary.push({ ...next });
    cursor = next;
  }
  if (distance2(cursor, boundary[0]) > toleranceMm) return null;
  boundary.pop();
  return boundary;
}

export function orderWallBoundaryWithGaps(walls: Wall[]): Vec2[] | null {
  if (walls.length < 3) return null;
  const unused = [...walls]; const first = unused.shift()!; const boundary: Vec2[] = [{ ...first.start }, { ...first.end }]; let cursor = first.end;
  while (unused.length) {
    let bestIndex = -1; let bestStart: 'start' | 'end' = 'start'; let bestDistance = Number.POSITIVE_INFINITY;
    unused.forEach((wall, index) => { for (const endpoint of ['start', 'end'] as const) { const distance = distance2(cursor, wall[endpoint]); if (distance < bestDistance) { bestDistance = distance; bestIndex = index; bestStart = endpoint; } } });
    if (bestIndex < 0) return null; const wall = unused.splice(bestIndex, 1)[0]; const near = wall[bestStart]; const far = wall[bestStart === 'start' ? 'end' : 'start'];
    if (distance2(cursor, near) > 2) boundary.push({ ...near }); boundary.push({ ...far }); cursor = far;
  }
  if (distance2(boundary[boundary.length - 1], boundary[0]) <= 2) boundary.pop();
  return boundary.length >= 3 && polygonArea(boundary) > 0 ? boundary : null;
}

function orientation(a: Vec2, b: Vec2, c: Vec2) { return (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z); }
export function polygonEdgesCross(a: Vec2[], b: Vec2[]): boolean {
  for (let ai = 0; ai < a.length; ai++) for (let bi = 0; bi < b.length; bi++) {
    const a1 = a[ai]; const a2 = a[(ai + 1) % a.length]; const b1 = b[bi]; const b2 = b[(bi + 1) % b.length];
    if ([distance2(a1, b1), distance2(a1, b2), distance2(a2, b1), distance2(a2, b2)].some((distance) => distance <= 2)) continue;
    const o1 = orientation(a1, a2, b1); const o2 = orientation(a1, a2, b2); const o3 = orientation(b1, b2, a1); const o4 = orientation(b1, b2, a2);
    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  }
  return false;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || 1) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, minX: number, maxX: number, minY: number, maxY: number) {
  const dx = b.x - a.x; const dy = b.y - a.y; let start = 0; let end = 1;
  const p = [-dx, dx, -dy, dy]; const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let index = 0; index < 4; index++) {
    if (p[index] === 0) { if (q[index] < 0) return false; continue; }
    const ratio = q[index] / p[index];
    if (p[index] < 0) { if (ratio > end) return false; start = Math.max(start, ratio); }
    else { if (ratio < start) return false; end = Math.min(end, ratio); }
  }
  return true;
}

export function routeSegmentAvoidsOpenings(wall: Wall, start: Vec3, end: Vec3, devices: Device[], clearanceMm = 100): boolean {
  const localStart = worldToWallLocal(wall, start); const localEnd = worldToWallLocal(wall, end);
  return devices.filter((device) => device.wallId === wall.id && ['door-opening', 'window-opening'].includes(device.typeId)).every((opening) => {
    const center = opening.distanceAlongWallMm ?? worldToWallLocal(wall, opening.position).distanceAlongMm;
    const bottom = opening.position.y - opening.dimensions.height / 2;
    return !segmentIntersectsRect(
      { x: localStart.distanceAlongMm, y: localStart.heightMm }, { x: localEnd.distanceAlongMm, y: localEnd.heightMm },
      center - opening.dimensions.width / 2 - clearanceMm, center + opening.dimensions.width / 2 + clearanceMm,
      bottom - clearanceMm, bottom + opening.dimensions.height + clearanceMm
    );
  });
}

export function routeSegmentDetourOpenings(wall: Wall, start: Vec3, end: Vec3, devices: Device[], clearanceMm = 100): Vec3[] {
  const localStart = worldToWallLocal(wall, start); const localEnd = worldToWallLocal(wall, end);
  const direction = localEnd.distanceAlongMm >= localStart.distanceAlongMm ? 1 : -1;
  const openings = devices.filter((device) => device.wallId === wall.id && ['door-opening', 'window-opening'].includes(device.typeId)).map((opening) => {
    const center = opening.distanceAlongWallMm ?? worldToWallLocal(wall, opening.position).distanceAlongMm;
    const bottom = opening.position.y - opening.dimensions.height / 2;
    return {
      minX: center - opening.dimensions.width / 2 - clearanceMm,
      maxX: center + opening.dimensions.width / 2 + clearanceMm,
      minY: bottom - clearanceMm,
      maxY: bottom + opening.dimensions.height + clearanceMm
    };
  }).sort((a, b) => direction * (a.minX - b.minX));
  const localPoints = [{ x: localStart.distanceAlongMm, y: localStart.heightMm }];
  for (const opening of openings) {
    const current = localPoints[localPoints.length - 1];
    const destination = { x: localEnd.distanceAlongMm, y: localEnd.heightMm };
    if (!segmentIntersectsRect(current, destination, opening.minX, opening.maxX, opening.minY, opening.maxY)) continue;
    const lanes = [
      opening.maxY + 1 <= wall.heightMm ? opening.maxY + 1 : undefined,
      opening.minY - 1 >= 0 ? opening.minY - 1 : undefined
    ].filter((value): value is number => value != null);
    if (!lanes.length) continue;
    const lane = lanes.sort((a, b) => Math.abs(current.y - a) + Math.abs(destination.y - a) - Math.abs(current.y - b) - Math.abs(destination.y - b))[0];
    const before = direction > 0 ? opening.minX - 1 : opening.maxX + 1;
    const after = direction > 0 ? opening.maxX + 1 : opening.minX - 1;
    localPoints.push({ x: before, y: current.y }, { x: before, y: lane }, { x: after, y: lane }, { x: after, y: destination.y });
  }
  localPoints.push({ x: localEnd.distanceAlongMm, y: localEnd.heightMm });
  return localPoints.map((point) => wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), point.x)), Math.max(0, Math.min(wall.heightMm, point.y)), 0))
    .filter((point, index, points) => !index || distance3(point, points[index - 1]) > 1);
}

/**
 * Routes around wall-mounted equipment as well as openings, leaving clearance
 * on every side. A clearance envelope containing a real route terminal is not
 * detoured here: the contiguous terminal approach is validated separately.
 */
export function routeSegmentDetourDevices(wall: Wall, start: Vec3, end: Vec3, devices: Device[], clearanceMm = 100, excludedDeviceIds: string[] = [], terminalPoints: Vec3[] = []): Vec3[] {
  const excluded = new Set(excludedDeviceIds); const localStart = worldToWallLocal(wall, start); const localEnd = worldToWallLocal(wall, end); const direction = localEnd.distanceAlongMm >= localStart.distanceAlongMm ? 1 : -1;
  const localTerminals = terminalPoints.map((point) => worldToWallLocal(wall, point));
  const inside = (point: { distanceAlongMm: number; heightMm: number }, obstacle: { minX: number; maxX: number; minY: number; maxY: number }) => point.distanceAlongMm >= obstacle.minX && point.distanceAlongMm <= obstacle.maxX && point.heightMm >= obstacle.minY && point.heightMm <= obstacle.maxY;
  const obstacles = devices.filter((device) => device.wallId === wall.id && !excluded.has(device.id) && (device.serviceCategory !== 'structural' || ['door-opening','window-opening'].includes(device.typeId))).map((device) => {
    const center = device.distanceAlongWallMm ?? worldToWallLocal(wall, device.position).distanceAlongMm;
    return { minX: center - device.dimensions.width / 2 - clearanceMm, maxX: center + device.dimensions.width / 2 + clearanceMm, minY: device.position.y - device.dimensions.height / 2 - clearanceMm, maxY: device.position.y + device.dimensions.height / 2 + clearanceMm };
  }).filter((obstacle) => !(localTerminals.some((terminal) => inside(terminal, obstacle)) && [localStart, localEnd].some((point) => inside(point, obstacle)))).sort((a, b) => direction * (a.minX - b.minX));
  const localPoints = [{ x: localStart.distanceAlongMm, y: localStart.heightMm }];
  for (const obstacle of obstacles) {
    const current = localPoints[localPoints.length - 1]; const destination = { x: localEnd.distanceAlongMm, y: localEnd.heightMm };
    if (!segmentIntersectsRect(current, destination, obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY)) continue;
    const lanes = [obstacle.maxY + 1 <= wall.heightMm ? obstacle.maxY + 1 : undefined, obstacle.minY - 1 >= 0 ? obstacle.minY - 1 : undefined].filter((value): value is number => value != null);
    if (!lanes.length) continue;
    const lane = lanes.sort((a, b) => Math.abs(current.y - a) + Math.abs(destination.y - a) - Math.abs(current.y - b) - Math.abs(destination.y - b))[0];
    const before = direction > 0 ? obstacle.minX - 1 : obstacle.maxX + 1; const after = direction > 0 ? obstacle.maxX + 1 : obstacle.minX - 1;
    localPoints.push({ x: before, y: current.y }, { x: before, y: lane }, { x: after, y: lane }, { x: after, y: destination.y });
  }
  localPoints.push({ x: localEnd.distanceAlongMm, y: localEnd.heightMm });
  return simplifyRoutePoints(localPoints.map((point) => wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), point.x)), Math.max(0, Math.min(wall.heightMm, point.y)), 0)));
}

export interface DeviceClearanceBounds { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
export interface PlaneRouteObstacle { minX: number; maxX: number; minZ: number; maxZ: number }

export function deviceClearanceBounds(device: Device, clearanceMm = 100): DeviceClearanceBounds {
  const yaw = device.rotationDeg.y * Math.PI / 180; const cos = Math.abs(Math.cos(yaw)); const sin = Math.abs(Math.sin(yaw));
  const halfX = (cos * device.dimensions.width + sin * device.dimensions.depth) / 2;
  const halfZ = (sin * device.dimensions.width + cos * device.dimensions.depth) / 2;
  const halfY = (Math.abs(device.rotationDeg.x) > .1 || Math.abs(device.rotationDeg.z) > .1 ? Math.max(device.dimensions.width, device.dimensions.height, device.dimensions.depth) : device.dimensions.height) / 2;
  return { minX: device.position.x - halfX - clearanceMm, maxX: device.position.x + halfX + clearanceMm, minY: device.position.y - halfY - clearanceMm, maxY: device.position.y + halfY + clearanceMm, minZ: device.position.z - halfZ - clearanceMm, maxZ: device.position.z + halfZ + clearanceMm };
}

export function devicePlanObstacle(device: Device, routeHeightMm: number, clearanceMm = 100): PlaneRouteObstacle | null {
  const bounds = deviceClearanceBounds(device, clearanceMm);
  return routeHeightMm >= bounds.minY && routeHeightMm <= bounds.maxY ? bounds : null;
}

function segmentIntersectsBounds(start: Vec3, end: Vec3, bounds: DeviceClearanceBounds): boolean {
  let minimum = 0; let maximum = 1;
  for (const axis of ['x','y','z'] as const) {
    const delta = end[axis] - start[axis]; const low = bounds[`min${axis.toUpperCase()}` as 'minX'|'minY'|'minZ']; const high = bounds[`max${axis.toUpperCase()}` as 'maxX'|'maxY'|'maxZ'];
    if (Math.abs(delta) < 1e-8) { if (start[axis] >= low && start[axis] <= high) continue; return false; }
    const first = (low - start[axis]) / delta; const second = (high - start[axis]) / delta; minimum = Math.max(minimum, Math.min(first, second)); maximum = Math.min(maximum, Math.max(first, second)); if (minimum > maximum) return false;
  }
  return true;
}

function pointInsideClearanceBounds(point: Vec3, bounds: DeviceClearanceBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.y >= bounds.minY && point.y <= bounds.maxY
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

export function routePointsKeepDeviceClearance(points: Vec3[], devices: Device[], excludedDeviceIds: string[] = [], clearanceMm = 100): boolean {
  return routeDeviceClearanceConflicts(points, devices, excludedDeviceIds, clearanceMm).length === 0;
}

export interface RouteDeviceClearanceConflict {
  device: Device;
  segmentIndexes: number[];
  startInside: boolean;
  endInside: boolean;
}

export function routeDeviceClearanceConflicts(points: Vec3[], devices: Device[], excludedDeviceIds: string[] = [], clearanceMm = 100): RouteDeviceClearanceConflict[] {
  const excluded = new Set(excludedDeviceIds); const candidates = devices.filter((device) => !excluded.has(device.id) && (device.serviceCategory !== 'structural' || device.typeId.startsWith('furniture-'))).map((device) => ({ device, bounds: deviceClearanceBounds(device, clearanceMm) }));
  if (points.length < 2) return [];
  const routeStart = points[0]; const routeEnd = points[points.length - 1]; const lastSegment = points.length - 2;
  return candidates.flatMap(({ device, bounds }) => {
    const startInside = pointInsideClearanceBounds(routeStart, bounds); const endInside = pointInsideClearanceBounds(routeEnd, bounds);
    const intersecting = points.slice(1).map((end, index) => segmentIntersectsBounds(points[index], end, bounds) ? index : -1).filter((index) => index >= 0);
    const intersectionSet = new Set(intersecting); const terminalSegments = new Set<number>();
    if (startInside) for (let index = 0; index <= lastSegment && intersectionSet.has(index); index++) terminalSegments.add(index);
    if (endInside) for (let index = lastSegment; index >= 0 && intersectionSet.has(index); index--) terminalSegments.add(index);
    const segmentIndexes = intersecting.filter((index) => !terminalSegments.has(index));
    return segmentIndexes.length ? [{ device, segmentIndexes, startInside, endInside }] : [];
  });
}

export interface WallRouteEntry { point: Vec3; wallId: string }

export function wallRoutePathLength(path: WallRouteEntry[] | null): number {
  if (!path || path.length < 2) return path ? 0 : Number.POSITIVE_INFINITY;
  return roundMm(path.slice(1).reduce((total, entry, index) => total + distance3(path[index].point, entry.point), 0));
}

export function wallRouteTurnCount(path: WallRouteEntry[] | null): number {
  if (!path || path.length < 3) return 0;
  const directions = path.slice(1).map((entry, index) => {
    const previous = path[index].point; const dx = entry.point.x - previous.x; const dz = entry.point.z - previous.z; const length = Math.hypot(dx, dz);
    return length > 1 ? { x: dx / length, z: dz / length } : null;
  }).filter((direction): direction is { x: number; z: number } => !!direction);
  return directions.slice(1).reduce((turns, direction, index) => Math.abs(directions[index].x * direction.z - directions[index].z * direction.x) > .01 ? turns + 1 : turns, 0);
}

export function preferSharedWallRoute(shortest: WallRouteEntry[] | null, shared: WallRouteEntry[] | null): WallRouteEntry[] | null {
  if (!shared) return shortest;
  if (!shortest) return shared;
  const shortestLength = wallRoutePathLength(shortest); const sharedLength = wallRoutePathLength(shared);
  const usefulDetourAllowance = Math.min(300, Math.max(50, shortestLength * .05));
  const remainsStraightforward = wallRouteTurnCount(shared) <= wallRouteTurnCount(shortest) + 1;
  return remainsStraightforward && sharedLength <= shortestLength + usefulDetourAllowance ? shared : shortest;
}

export interface WeightedRouteSegment { start: Vec3; end: Vec3; weight: number }

export function axisAlignedOverlapLength(firstStart: Vec3, firstEnd: Vec3, secondStart: Vec3, secondEnd: Vec3, toleranceMm = 2): number {
  if (Math.abs(firstStart.y - firstEnd.y) > toleranceMm || Math.abs(secondStart.y - secondEnd.y) > toleranceMm || Math.abs(firstStart.y - secondStart.y) > toleranceMm) return 0;
  const firstAlongX = Math.abs(firstStart.z - firstEnd.z) <= toleranceMm; const secondAlongX = Math.abs(secondStart.z - secondEnd.z) <= toleranceMm;
  const firstAlongZ = Math.abs(firstStart.x - firstEnd.x) <= toleranceMm; const secondAlongZ = Math.abs(secondStart.x - secondEnd.x) <= toleranceMm;
  if (firstAlongX && secondAlongX && Math.abs(firstStart.z - secondStart.z) <= toleranceMm) return Math.max(0, Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x)) - Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x)));
  if (firstAlongZ && secondAlongZ && Math.abs(firstStart.x - secondStart.x) <= toleranceMm) return Math.max(0, Math.min(Math.max(firstStart.z, firstEnd.z), Math.max(secondStart.z, secondEnd.z)) - Math.max(Math.min(firstStart.z, firstEnd.z), Math.min(secondStart.z, secondEnd.z)));
  return 0;
}

export function preferredOrthogonalPlaneRoute(start: Vec3, end: Vec3, y: number, existing: WeightedRouteSegment[] = [], obstacles: PlaneRouteObstacle[] = [], turnPenaltyMm = 0): Vec3[] {
  const first = { x: start.x, y, z: start.z }; const last = { x: end.x, y, z: end.z };
  const rawCandidates = first.x === last.x || first.z === last.z ? [[first,last]] : [[first, { x: last.x, y, z: first.z }, last], [first, { x: first.x, y, z: last.z }, last]];
  const segmentHits = (a: Vec3, b: Vec3, obstacle: PlaneRouteObstacle) => segmentIntersectsRect({ x: a.x, y: a.z }, { x: b.x, y: b.z }, obstacle.minX, obstacle.maxX, obstacle.minZ, obstacle.maxZ);
  const intersections = (points: Vec3[]) => points.slice(1).reduce((count, point, index) => count + obstacles.filter((obstacle) => segmentHits(points[index], point, obstacle)).length, 0);
  const turns = (points: Vec3[]) => points.slice(1, -1).reduce((total, point, index) => {
    const previous = points[index]; const next = points[index + 2];
    const incoming = { x: point.x - previous.x, z: point.z - previous.z }; const outgoing = { x: next.x - point.x, z: next.z - point.z };
    const incomingLength = Math.hypot(incoming.x, incoming.z); const outgoingLength = Math.hypot(outgoing.x, outgoing.z);
    if (incomingLength <= 1 || outgoingLength <= 1) return total;
    const cross = Math.abs(incoming.x * outgoing.z - incoming.z * outgoing.x) / (incomingLength * outgoingLength);
    const dot = (incoming.x * outgoing.x + incoming.z * outgoing.z) / (incomingLength * outgoingLength);
    return total + (cross > .001 || dot < 0 ? 1 : 0);
  }, 0);
  const score = (points: Vec3[]) => intersections(points) * 1_000_000_000 + turns(points) * Math.max(0, turnPenaltyMm) + points.slice(1).reduce((total, point, index) => total + distance3(points[index], point) + existing.reduce((overlap, segment) => overlap + axisAlignedOverlapLength(points[index], point, segment.start, segment.end) * segment.weight, 0), 0);
  const detour = (initial: Vec3[]) => {
    let result = initial.map((point) => ({ ...point }));
    for (let attempt = 0; attempt < Math.max(4, obstacles.length * 3); attempt++) {
      let conflict: { segment: number; obstacle: PlaneRouteObstacle } | undefined;
      result.slice(1).some((point, index) => { const obstacle = obstacles.find((item) => segmentHits(result[index], point, item)); if (!obstacle) return false; conflict = { segment: index, obstacle }; return true; });
      if (!conflict) break;
      const a = result[conflict.segment]; const b = result[conflict.segment + 1]; const box = conflict.obstacle; const replacements: Vec3[][] = [];
      if (Math.abs(a.z - b.z) <= 2) {
        const forward = b.x >= a.x; const before = forward ? box.minX - 1 : box.maxX + 1; const after = forward ? box.maxX + 1 : box.minX - 1;
        for (const lane of [box.minZ - 1, box.maxZ + 1]) replacements.push([a, { x: before, y, z: a.z }, { x: before, y, z: lane }, { x: after, y, z: lane }, { x: after, y, z: b.z }, b]);
      } else {
        const forward = b.z >= a.z; const before = forward ? box.minZ - 1 : box.maxZ + 1; const after = forward ? box.maxZ + 1 : box.minZ - 1;
        for (const lane of [box.minX - 1, box.maxX + 1]) replacements.push([a, { x: a.x, y, z: before }, { x: lane, y, z: before }, { x: lane, y, z: after }, { x: b.x, y, z: after }, b]);
      }
      const prefix = result.slice(0, conflict.segment); const suffix = result.slice(conflict.segment + 2); const options = replacements.map((replacement) => simplifyRoutePoints([...prefix, ...replacement, ...suffix])); const next = options.sort((one, two) => score(one) - score(two))[0];
      if (!next || score(next) >= score(result) && intersections(next) >= intersections(result)) break; result = next;
    }
    return simplifyRoutePoints(result);
  };
  const candidates = rawCandidates.map(detour); return candidates.sort((one, two) => score(one) - score(two))[0];
}

export function shortestWallRoute(walls: Wall[], sourceWallId: string, destinationWallId: string, start: Vec3, end: Vec3, connectionToleranceMm = 200, edgePenalty?: (wallId: string) => number): WallRouteEntry[] | null {
  const sourceWall = walls.find((wall) => wall.id === sourceWallId); const destinationWall = walls.find((wall) => wall.id === destinationWallId);
  if (!sourceWall || !destinationWall) return null;
  if (sourceWall.id === destinationWall.id) return [{ point: start, wallId: sourceWall.id }, { point: end, wallId: sourceWall.id }];
  const nodes: Vec2[] = []; const nodeFor = (point: Vec2) => { const existing = nodes.findIndex((node) => distance2(node, point) <= connectionToleranceMm); if (existing >= 0) return existing; nodes.push({ ...point }); return nodes.length - 1; };
  const wallNodes = new Map<string, [number, number]>(); const edges: Array<Array<{ to: number; cost: number; wallId: string }>> = [];
  for (const wall of walls) {
    const a = nodeFor(wall.start); const b = nodeFor(wall.end); wallNodes.set(wall.id, [a, b]);
    edges[a] ??= []; edges[b] ??= []; const cost = distance2(wall.start, wall.end); edges[a].push({ to: b, cost, wallId: wall.id }); edges[b].push({ to: a, cost, wallId: wall.id });
  }
  const sourceNodes = wallNodes.get(sourceWall.id)!; const destinationNodes = wallNodes.get(destinationWall.id)!;
  const distances = nodes.map(() => Number.POSITIVE_INFINITY); const previous = nodes.map(() => -1); const previousWall = nodes.map(() => ''); const visited = nodes.map(() => false);
  for (const node of sourceNodes) distances[node] = Math.hypot(start.x - nodes[node].x, start.z - nodes[node].z);
  for (let count = 0; count < nodes.length; count++) {
    let current = -1; let best = Number.POSITIVE_INFINITY;
    distances.forEach((distance, index) => { if (!visited[index] && distance < best) { best = distance; current = index; } });
    if (current < 0) break; visited[current] = true;
    for (const edge of edges[current] ?? []) { const weightedCost = Math.max(1, edge.cost + (edgePenalty?.(edge.wallId) ?? 0)); if (distances[current] + weightedCost < distances[edge.to]) { distances[edge.to] = distances[current] + weightedCost; previous[edge.to] = current; previousWall[edge.to] = edge.wallId; } }
  }
  const destinationNode = destinationNodes.reduce((best, node) => distances[node] + Math.hypot(end.x - nodes[node].x, end.z - nodes[node].z) < distances[best] + Math.hypot(end.x - nodes[best].x, end.z - nodes[best].z) ? node : best, destinationNodes[0]);
  if (!Number.isFinite(distances[destinationNode])) return null;
  const path: number[] = []; for (let cursor = destinationNode; cursor >= 0; cursor = previous[cursor]) { path.push(cursor); if (sourceNodes.includes(cursor) && previous[cursor] < 0) break; } path.reverse();
  if (!path.length || !sourceNodes.includes(path[0])) return null;
  const result: WallRouteEntry[] = [{ point: start, wallId: sourceWall.id }];
  const append = (point: Vec3, wallId: string) => { const last = result[result.length - 1]; if (last.wallId !== wallId || distance3(last.point, point) > 1) result.push({ point, wallId }); };
  append({ x: nodes[path[0]].x, y: start.y, z: nodes[path[0]].z }, sourceWall.id);
  for (let index = 1; index < path.length; index++) {
    const wallId = previousWall[path[index]]; const previousPoint = { x: nodes[path[index - 1]].x, y: start.y, z: nodes[path[index - 1]].z }; const nextPoint = { x: nodes[path[index]].x, y: start.y, z: nodes[path[index]].z };
    append(previousPoint, wallId); append(nextPoint, wallId);
  }
  append({ x: nodes[destinationNode].x, y: end.y, z: nodes[destinationNode].z }, destinationWall.id); append(end, destinationWall.id);
  return result;
}

export function routeSegmentsOnWall(route: { points: Vec3[] }, wall: Wall): Array<[Vec3, Vec3]> {
  const tolerance = Math.max(20, wall.thicknessMm / 2 + 10); const length = wallLength(wall);
  const belongs = (point: Vec3) => { const local = worldToWallLocal(wall, point); return Math.abs(local.depthMm) <= tolerance && local.distanceAlongMm >= -tolerance && local.distanceAlongMm <= length + tolerance && local.heightMm >= -tolerance && local.heightMm <= wall.heightMm + tolerance; };
  return route.points.slice(1).map((point, index) => [route.points[index], point] as [Vec3,Vec3]).filter(([start, end]) => distance3(start, end) > 1 && belongs(start) && belongs(end));
}

export function sanitizeFilename(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'e')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Untitled';
}

export function batchExportFilename(projectName: string, roomName: string, wallName: string): string {
  return `${sanitizeFilename(projectName)}_${sanitizeFilename(roomName)}_${sanitizeFilename(wallName)}.png`;
}
