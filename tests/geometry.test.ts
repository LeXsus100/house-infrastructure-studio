import { describe, expect, it } from 'vitest';
import type { Device, Route, Wall } from '../shared/types';
import { addVerticalClearanceAtCrossings, alignRouteToSharedElevation, batchExportFilename, ceilingRouteHeight, cmToMm, confineRouteToAssociatedWalls, constrainRoutePointToWallLining, devicePortWorldPosition, drywallAreaMm2, findRouteIntersections, floorRouteHeight, mmToCm, mmToM, mToMm, mountingFaceOffset, mountingRotation, offsetPolylineCorner, orderWallBoundary, orderWallBoundaryWithGaps, orthogonalizeWallRoutePoints, polygonArea, polygonEdgesCross, preferredOrthogonalPlaneRoute, preferSharedWallRoute, projectDevicePositionOntoWall, proposeRouteClearanceSolution, reattachDeviceToWall, reattachRouteEndpointsToDevice, resolveRouteConflicts, roundedRoutePoints, routeDisplayDiameterMm, routeLength, routeSegmentAvoidsOpenings, routeSegmentDetourOpenings, routeSegmentsOnWall, routeUsesTubeRendering, separateCoincidentRoute, shortestWallRoute, simplifyRoutePoints, stackFloorRoutes, verticalTransitionBounds, wallAtPlanPoint, wallBackFaceRecessMm, wallCenterDepthForBackFaceRecess, wallLength, wallLocalToWorld, wallMountedPosition, wallRoutePathLength, wallRouteTurnCount, wallServiceDepthMm, worldToWallLocal } from '../src/lib/geometry';
import { isNumericDraft, parseNumericDraft } from '../src/lib/numericDraft';
import { buildPolylinePath, routeDirectionMarkerDistances, samplePolylinePath } from '../src/lib/polyline';

const floorId = 'floor';
const wall = (id: string, sx: number, sz: number, ex: number, ez: number): Wall => ({ id, floorId, name: id, start: { x: sx, z: sz }, end: { x: ex, z: ez }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false });

describe('metric geometry', () => {
  it('calculates wall and route lengths in integer millimetres', () => {
    expect(wallLength(wall('w', 0, 0, 3000, 4000))).toBe(5000);
    const route = { points: [{ id: '1', order: 0, x: 0, y: 0, z: 0 }, { id: '2', order: 1, x: 3000, y: 4000, z: 0 }, { id: '3', order: 2, x: 3000, y: 4000, z: 1200 }] } as Pick<Route, 'points'>;
    expect(routeLength(route)).toBe(6200);
    expect(ceilingRouteHeight(2700, -50)).toBe(2750);
    expect(ceilingRouteHeight(2700, 50)).toBe(2650);
  });

  it('uses explicit installed route diameters before service defaults', () => {
    expect(routeDisplayDiameterMm({ kind: 'cable', serviceCategory: 'electrical' } as Route, { electrical: 16 })).toBe(16);
    expect(routeDisplayDiameterMm({ kind: 'cable', serviceCategory: 'electrical', conduit: { diameterMm: 25 } } as Route, { electrical: 16 })).toBe(25);
    expect(routeDisplayDiameterMm({ kind: 'pipe', serviceCategory: 'plumbing', pipe: { externalDiameterMm: 32 } } as Route, { plumbing: 25 })).toBe(32);
    expect(routeDisplayDiameterMm({ kind: 'duct', serviceCategory: 'hvac', duct: { widthMm: 300, heightMm: 180 } } as Route, { hvac: 160 })).toBe(300);
  });

  it('uses volumetric rendering only above the 4 cm route threshold', () => {
    const route = { kind: 'duct', serviceCategory: 'hvac', duct: { material: '', diameterMm: 40 } } as Route;
    expect(routeUsesTubeRendering(route, { hvac: 160 })).toBe(false);
    expect(routeUsesTubeRendering({ ...route, duct: { material: '', diameterMm: 41 } }, { hvac: 20 })).toBe(true);
  });

  it('reprojects edited wall openings and refreshes their wall-local cut position', () => {
    const host = wall('host', 0, 0, 4000, 0);
    expect(projectDevicePositionOntoWall(host, { x: 1300, y: 1700, z: 900 }, true)).toEqual({
      position: { x: 1300, y: 1700, z: 0 }, heightFromFloorMm: 1700, distanceAlongWallMm: 1300, depthInsideWallMm: 0
    });
    expect(projectDevicePositionOntoWall(host, { x: 5200, y: 1000, z: 40 }, true).distanceAlongWallMm).toBe(4000);
  });

  it('collapses collinear route reversals instead of preserving a 180 degree turn', () => {
    expect(simplifyRoutePoints([
      { x: 0, y: 500, z: 0 },
      { x: 1500, y: 500, z: 0 },
      { x: 1400, y: 500, z: 0 },
      { x: 1400, y: 900, z: 0 }
    ])).toEqual([
      { x: 0, y: 500, z: 0 },
      { x: 1400, y: 500, z: 0 },
      { x: 1400, y: 900, z: 0 }
    ]);
  });

  it('orders a closed wall loop and calculates room area', () => {
    const walls = [wall('a', 0, 0, 4000, 0), wall('c', 4000, 3000, 0, 3000), wall('b', 4000, 0, 4000, 3000), wall('d', 0, 3000, 0, 0)];
    const boundary = orderWallBoundary(walls);
    expect(boundary).toHaveLength(4);
    expect(polygonArea(boundary!)).toBe(12_000_000);
  });

  it('keeps wall runs orthogonal and rounds floor turns with the configured radius', () => {
    const routeWall = { ...wall('route-wall', 0, 0, 4000, 0), thicknessMm: 500, structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100 };
    const orthogonal = orthogonalizeWallRoutePoints([{ x: 200, y: 300, z: 100 }, { x: 3000, y: 1800, z: 100 }], [routeWall]);
    expect(orthogonal).toHaveLength(3);
    expect(orthogonal[1]).toMatchObject({ x: 3000, y: 300, z: 100 });
    const rounded = roundedRoutePoints([{ x: 0, y: -150, z: 0 }, { x: 1000, y: -150, z: 0 }, { x: 1000, y: -150, z: 1000 }], 200);
    expect(rounded.length).toBeGreaterThan(3);
    expect(rounded).not.toContainEqual({ x: 1000, y: -150, z: 0 });
    expect(routeLength({ points: rounded as Route['points'] })).toBeLessThan(2000);
  });

  it('enforces wall-local horizontal or vertical runs while preserving diagonal floor and ceiling spans', () => {
    const routeWall = { ...wall('route-wall', 0, 0, 4000, 0), thicknessMm: 500, structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100 };
    const wallRoute = { id: 'wall-route', wallIds: [routeWall.id], points: [{ id: 'a', order: 0, x: 200, y: 300, z: 100 }, { id: 'b', order: 1, x: 3000, y: 1800, z: 100 }] } as Route;
    const confined = confineRouteToAssociatedWalls(wallRoute, [routeWall]);
    expect(confined.points).toHaveLength(3);
    expect(confined.points[0]).toMatchObject({ id: 'a', x: 200, y: 300, z: 100 }); expect(confined.points.at(-1)).toMatchObject({ id: 'b', x: 3000, y: 1800, z: 100 });
    expect(confined.points.slice(1).every((end, index) => {
      const start = confined.points[index]; const localStart = worldToWallLocal(routeWall, start); const localEnd = worldToWallLocal(routeWall, end);
      return Math.abs(localEnd.distanceAlongMm - localStart.distanceAlongMm) <= 2 || Math.abs(localEnd.heightMm - localStart.heightMm) <= 2;
    })).toBe(true);

    const ceilingRoute = { ...wallRoute, id: 'ceiling-route', points: [{ id: 'c', order: 0, x: 200, y: 2750, z: 100 }, { id: 'd', order: 1, x: 3000, y: 2750, z: 1600 }] } as Route;
    expect(confineRouteToAssociatedWalls(ceilingRoute, [routeWall]).points).toEqual(ceilingRoute.points);
  });

  it('connects selected wall gaps without crossing an existing room', () => {
    const walls = [wall('a', 0, 0, 3900, 0), wall('b', 4000, 100, 4000, 2900), wall('c', 3900, 3000, 100, 3000), wall('d', 0, 2900, 0, 100)];
    const boundary = orderWallBoundaryWithGaps(walls)!;
    expect(boundary.length).toBeGreaterThanOrEqual(4); expect(polygonArea(boundary)).toBeGreaterThan(11_000_000);
    expect(polygonEdgesCross(boundary, [{ x: 5000, z: 0 }, { x: 6000, z: 0 }, { x: 6000, z: 1000 }, { x: 5000, z: 1000 }])).toBe(false);
    expect(polygonEdgesCross(boundary, [{ x: 2000, z: -500 }, { x: 2500, z: -500 }, { x: 2500, z: 500 }, { x: 2000, z: 500 }])).toBe(true);
  });

  it('converts between wall-local and project coordinates', () => {
    const diagonal = wall('w', 1000, 2000, 5000, 2000);
    expect(wallLocalToWorld(diagonal, 1500, 1100, 60)).toEqual({ x: 2500, y: 1100, z: 2060 });
    expect(worldToWallLocal(diagonal, { x: 2500, y: 1100, z: 2060 })).toEqual({ distanceAlongMm: 1500, heightMm: 1100, depthMm: 60 });
  });

  it('recovers only the wall whose footprint is directly under a plan click', () => {
    const horizontal = wall('horizontal', 0, 0, 4000, 0);
    const distant = wall('distant', 0, 500, 4000, 500);
    expect(wallAtPlanPoint([distant, horizontal], { x: 1800, z: 55 })?.id).toBe('horizontal');
    expect(wallAtPlanPoint([horizontal, distant], { x: 1800, z: 200 })).toBeUndefined();
    expect(wallAtPlanPoint([horizontal], { x: -65, z: 0 })?.id).toBe('horizontal');
  });

  it('keeps an attached device on a resized wall', () => {
    const device = { wallId: 'w', distanceAlongWallMm: 1000, heightFromFloorMm: 500, depthInsideWallMm: 20, position: { x: 0, y: 0, z: 0 } } as Device;
    const moved = reattachDeviceToWall(device, wall('w', 500, 700, 3500, 700));
    expect(moved.position).toEqual({ x: 1500, y: 500, z: 720 });
  });

  it('moves connected route endpoints with the exact rotated device port', () => {
    const device = { id: 'junction', floorId: 'upper', position: { x: 1200, y: 700, z: 900 }, rotationDeg: { x: 0, y: 90, z: 0 }, ports: [{ id: 'port', deviceId: 'junction', name: 'Output', serviceCategory: 'electrical', portType: 'terminal', direction: 'output', connectorType: '', notes: '', position: { x: 100, y: 20, z: 0 }, face: 'front', required: true }] } as Device;
    const route = { id: 'route', floorId: 'ground', sourceDeviceId: device.id, sourcePortId: 'port', points: [{ id: 'a', order: 0, x: 0, y: 0, z: 0 }, { id: 'b', order: 1, x: 3000, y: 500, z: 0 }] } as Route;
    const attached = reattachRouteEndpointsToDevice(route, device, 3000, 0);
    expect(attached.points[0]).toMatchObject({ x: 1200, y: 3720, z: 800 }); expect(attached.points[1]).toEqual(route.points[1]);
  });

  it('keeps concealed routes 10 cm away from wall openings', () => {
    const targetWall = wall('opening-wall', 0, 0, 5000, 0);
    const door = { typeId: 'door-opening', wallId: targetWall.id, distanceAlongWallMm: 2500, position: { x: 2500, y: 1050, z: 0 }, dimensions: { width: 900, height: 2100, depth: 120 } } as Device;
    expect(routeSegmentAvoidsOpenings(targetWall, { x: 0, y: 500, z: 0 }, { x: 5000, y: 500, z: 0 }, [door])).toBe(false);
    expect(routeSegmentAvoidsOpenings(targetWall, { x: 0, y: 2200, z: 0 }, { x: 5000, y: 2200, z: 0 }, [door])).toBe(false);
    expect(routeSegmentAvoidsOpenings(targetWall, { x: 0, y: 2301, z: 0 }, { x: 5000, y: 2301, z: 0 }, [door])).toBe(true);
    const detour = routeSegmentDetourOpenings(targetWall, { x: 0, y: 500, z: 0 }, { x: 5000, y: 500, z: 0 }, [door]);
    expect(detour.length).toBe(6);
    expect(detour.slice(1).every((point, index) => routeSegmentAvoidsOpenings(targetWall, detour[index], point, [door]))).toBe(true);
  });

  it('finds the shortest connected wall path without dropping through the floor', () => {
    const walls = [wall('horizontal', 0, 0, 4000, 0), wall('vertical', 4000, 0, 4000, 3000), wall('long-way', 0, 0, 0, 6000), wall('top', 0, 6000, 4000, 3000)];
    const route = shortestWallRoute(walls, 'horizontal', 'vertical', { x: 1000, y: 1800, z: 0 }, { x: 4000, y: 1800, z: 2500 });
    expect(route).not.toBeNull(); expect(route!.every((entry) => entry.point.y === 1800)).toBe(true);
    expect(route!.some((entry) => entry.point.x === 4000 && entry.point.z === 0)).toBe(true);
    expect(route!.map((entry) => entry.wallId)).toContain('horizontal'); expect(route!.map((entry) => entry.wallId)).toContain('vertical');
  });

  it('uses configured penalties to avoid congested wall and plane paths', () => {
    const walls = [wall('source', 0, 0, 1000, 0), wall('crowded', 1000, 0, 2000, 0), wall('up', 1000, 0, 1000, 1000), wall('top', 1000, 1000, 2000, 1000), wall('down', 2000, 1000, 2000, 0), wall('destination', 2000, 0, 3000, 0)];
    const routed = shortestWallRoute(walls, 'source', 'destination', { x: 900, y: 1500, z: 0 }, { x: 2100, y: 1500, z: 0 }, 2, (wallId) => wallId === 'crowded' ? 5000 : 0)!;
    expect(routed.map((entry) => entry.wallId)).toContain('top');
    expect(routed.map((entry) => entry.wallId)).not.toContain('crowded');
    const plane = preferredOrthogonalPlaneRoute({ x: 0, y: 0, z: 0 }, { x: 2000, y: 0, z: 2000 }, 0, [{ start: { x: 0, y: 0, z: 0 }, end: { x: 2000, y: 0, z: 0 }, weight: 10 }]);
    expect(plane[1]).toEqual({ x: 0, y: 0, z: 2000 });
  });

  it('clips multi-wall route documentation to the selected wall', () => {
    const first = wall('first', 0, 0, 4000, 0); const second = wall('second', 4000, 0, 4000, 3000);
    const route = { points: [{ id: '1', order: 0, x: 500, y: 1800, z: 0 }, { id: '2', order: 1, x: 4000, y: 1800, z: 0 }, { id: '3', order: 2, x: 4000, y: 1800, z: 2500 }] } as Pick<Route, 'points'>;
    expect(routeSegmentsOnWall(route, first)).toHaveLength(1); expect(routeSegmentsOnWall(route, second)).toHaveLength(1);
  });

  it('converts units without floating drift and generates deterministic filenames', () => {
    expect(mmToM(1250)).toBe(1.25); expect(mToMm(1.25)).toBe(1250); expect(mmToCm(1250)).toBe(125); expect(cmToMm(125.04)).toBe(1250);
    expect(batchExportFilename('Example house', 'Cucina', 'Wall 01')).toBe('Example-house_Cucina_Wall-01.png');
  });

  it('keeps routes in drywall and orders below-floor services from deep to shallow', () => {
    const layered = { ...wall('layered', 0, 0, 4000, 0), structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100, thicknessMm: 500 };
    expect(wallServiceDepthMm(layered, 1)).toBe(200); expect(wallServiceDepthMm(layered, -1)).toBe(-200);
    expect(worldToWallLocal(layered, constrainRoutePointToWallLining(layered, { x: 2000, y: 900, z: 0 })).depthMm).toBe(-155);
    expect(drywallAreaMm2(layered)).toBe(21_600_000);
    expect(floorRouteHeight(-150, 'pipe', ['pipe','cable','duct'], 50)).toBe(-200);
    expect(floorRouteHeight(-150, 'cable', ['pipe','cable','duct'], 50)).toBe(-150);
    expect(floorRouteHeight(-150, 'duct', ['pipe','cable','duct'], 50)).toBe(-100);
    const route = (id: string, kind: Route['kind']) => ({ id, kind, serviceCategory: kind === 'pipe' ? 'plumbing' : 'electrical', floorId, points: [{ id: `${id}-1`, order: 0, x: 0, y: 0, z: 0 }, { id: `${id}-2`, order: 1, x: 1000, y: 0, z: 0 }] }) as Route;
    const stacked = stackFloorRoutes([route('cable', 'cable'), route('pipe', 'pipe')], floorId, -150, ['pipe','cable','duct'], { electrical: 50, plumbing: 50 });
    expect(stacked.find((item) => item.kind === 'pipe')?.points[0].y).toBe(-200); expect(stacked.find((item) => item.kind === 'cable')?.points[0].y).toBe(-150);
  });

  it('treats drywall left as the left side from wall start to end', () => {
    const layered = { ...wall('directional', 0, 0, 4000, 0), structuralThicknessMm: 300, liningLeftMm: 50, liningRightMm: 100, thicknessMm: 450 };
    expect(wallServiceDepthMm(layered, -1)).toBe(-200);
    expect(wallServiceDepthMm(layered, 1)).toBe(175);
    expect(wallLocalToWorld(layered, 2000, 900, wallServiceDepthMm(layered, -1))).toEqual({ x: 2000, y: 900, z: -200 });
  });

  it('accepts decimal commas and incomplete signed numeric drafts safely', () => {
    expect(isNumericDraft('-')).toBe(true);
    expect(isNumericDraft('-12,5')).toBe(true);
    expect(parseNumericDraft('-12,5')).toBe(-12.5);
    expect(parseNumericDraft('-')).toBeNull();
    expect(parseNumericDraft('', 0, 10)).toBeNull();
    expect(parseNumericDraft('25', 0, 10)).toBe(10);
  });

  it('samples animated route markers in the selected polyline direction', () => {
    const path = buildPolylinePath([[0,0,0], [1,0,0], [1,1,0]]);
    expect(path.total).toBe(2);
    expect(samplePolylinePath(path, .25)).toEqual({ position: [.5,0,0], direction: [1,0,0] });
    expect(samplePolylinePath(path, .25, true)).toEqual({ position: [1,.5,0], direction: [0,-1,0] });
    expect(routeDirectionMarkerDistances(4, 0, 3)).toEqual([0, 1.333333, 2.666667]);
    expect(routeDirectionMarkerDistances(4, 1.2, 3)).toEqual([1.2, 2.533333, 3.866667]);
    expect(routeDirectionMarkerDistances(.8, 0, 1)).toEqual([0]);
    expect(routeDirectionMarkerDistances(.8, 1, 1)).toEqual([.2]);
    const longRouteMarkers = routeDirectionMarkerDistances(10, 1.5, Math.max(1, Math.round(10 / 1.6)));
    expect(longRouteMarkers).toHaveLength(6); expect(new Set(longRouteMarkers).size).toBe(6); expect(longRouteMarkers.every((distance) => distance >= 0 && distance < 10)).toBe(true);
  });

  it('uses a shared wall corridor only when the detour is small and straightforward', () => {
    const shortest = [{ point: { x: 0, y: 0, z: 0 }, wallId: 'a' }, { point: { x: 2000, y: 0, z: 0 }, wallId: 'b' }];
    const acceptableShared = [{ point: { x: 0, y: 0, z: 0 }, wallId: 'a' }, { point: { x: 0, y: 0, z: 80 }, wallId: 'shared' }, { point: { x: 2000, y: 0, z: 80 }, wallId: 'b' }];
    const excessiveShared = [{ point: { x: 0, y: 0, z: 0 }, wallId: 'a' }, { point: { x: 0, y: 0, z: 200 }, wallId: 'shared' }, { point: { x: 2000, y: 0, z: 200 }, wallId: 'b' }];
    expect(wallRoutePathLength(shortest)).toBe(2000);
    expect(wallRouteTurnCount(acceptableShared)).toBe(1);
    expect(preferSharedWallRoute(shortest, acceptableShared)).toBe(acceptableShared);
    expect(preferSharedWallRoute(shortest, excessiveShared)).toBe(shortest);
  });

  it('uses an exact rotated device-local port as the route endpoint', () => {
    const device = { position: { x: 1000, y: 800, z: 2000 }, rotationDeg: { x: 0, y: 90, z: 0 } } as Device;
    const port = { position: { x: 100, y: -50, z: -40 } } as Device['ports'][number];
    expect(devicePortWorldPosition(device, port)).toEqual({ x: 960, y: 750, z: 1900 });
    const floorMounted = { ...device, rotationDeg: { x: -90, y: 0, z: 0 } } as Device;
    expect(devicePortWorldPosition(floorMounted, { position: { x: 0, y: 0, z: -40 } } as Device['ports'][number])).toEqual({ x: 1000, y: 760, z: 2000 });
    expect(mountingFaceOffset({ width: 200, height: 100, depth: 80 }, 'back')).toBe(40);
    expect(mountingRotation('bottom', 'floor')).toEqual({ x: 0, y: 0, z: 0 });
    const mountingWall = wall('mounting-wall', 0, 0, 3000, 0); const backPort = { position: { x: 0, y: 0, z: -40 } } as Device['ports'][number];
    expect(mountingRotation('top', 'wall', mountingWall, 'left')).toEqual({ x: -90, y: 0, z: 0 });
    expect(mountingRotation('top', 'wall', wall('vertical-wall', 0, 0, 0, 3000), 'left')).toEqual({ x: -90, y: 0, z: -90 });
    const leftSide = { position: { x: 1000, y: 1100, z: 100 }, rotationDeg: mountingRotation('back', 'wall', mountingWall, 'left') } as Device;
    const rightSide = { position: { x: 1000, y: 1100, z: -100 }, rotationDeg: mountingRotation('back', 'wall', mountingWall, 'right') } as Device;
    expect(devicePortWorldPosition(leftSide, backPort).z).toBe(60); expect(devicePortWorldPosition(rightSide, backPort).z).toBe(-60);
  });

  it('places the device centre outside the clicked wall face so BACK remains in contact', () => {
    const mountingWall = wall('mounting-wall', 0, 0, 4000, 0);
    const dimensions = { width: 200, height: 100, depth: 80 };
    expect(wallMountedPosition(mountingWall, { x: 1500, y: 1200, z: 60 }, dimensions, 'back', 'left')).toEqual({ x: 1500, y: 1200, z: 100 });
    expect(wallMountedPosition(mountingWall, { x: 1500, y: 1200, z: -60 }, dimensions, 'back', 'right')).toEqual({ x: 1500, y: 1200, z: -100 });
    expect(wallMountedPosition(mountingWall, { x: 1500, y: 1200, z: 60 }, dimensions, 'left', 'left')).toEqual({ x: 1500, y: 1200, z: 160 });
    expect(wallBackFaceRecessMm(mountingWall, dimensions, 'back', 100)).toBe(0);
    expect(wallCenterDepthForBackFaceRecess(mountingWall, dimensions, 'back', 30, 1)).toBe(70);
    expect(wallCenterDepthForBackFaceRecess(mountingWall, dimensions, 'back', 30, -1)).toBe(-70);
    expect(wallBackFaceRecessMm(mountingWall, dimensions, 'back', -70)).toBe(30);
  });

  it('separates coincident routes and reports crossings by priority', () => {
    const existing = { id: 'a', floorId, name: 'Power', serviceCategory: 'electrical', points: [{ id: 'a1', order: 0, x: 0, y: 500, z: 0 }, { id: 'a2', order: 1, x: 3000, y: 500, z: 0 }] } as Route;
    const separated = separateCoincidentRoute([{ x: 0, y: 500, z: 0 }, { x: 3000, y: 500, z: 0 }], [existing], 40, true);
    expect(separated).toHaveLength(4); expect(separated[1]).toMatchObject({ y: 500, z: 40 });
    const crossing = { id: 'b', floorId, name: 'Water', serviceCategory: 'plumbing', points: [{ id: 'b1', order: 0, x: 1500, y: 500, z: -1000 }, { id: 'b2', order: 1, x: 1500, y: 500, z: 1000 }] } as Route;
    expect(findRouteIntersections([existing, crossing], { plumbing: 1, electrical: 2 })[0]).toMatchObject({ routeAId: 'a', routeBId: 'b', point: { x: 1500, y: 500, z: 0 } });
    const closeParallel = { ...crossing, id: 'c', name: 'Data', serviceCategory: 'data', points: [{ id: 'c1', order: 0, x: 200, y: 500, z: 20 }, { id: 'c2', order: 1, x: 2800, y: 500, z: 20 }] } as Route;
    expect(findRouteIntersections([existing, closeParallel], { electrical: 2, data: 3 }, { electrical: 30, data: 30 })).toHaveLength(1);
    const separatedParallel = { ...closeParallel, points: closeParallel.points.map((point) => ({ ...point, z: 30 })) } as Route;
    expect(findRouteIntersections([existing, separatedParallel], { electrical: 2, data: 3 }, { electrical: 30, data: 30 })).toHaveLength(0);
    const resegmented = separateCoincidentRoute([{ x: 0, y: 500, z: 0 }, { x: 1200, y: 500, z: 0 }, { x: 3000, y: 500, z: 0 }], [existing], 40, false);
    expect(resegmented[1]).toMatchObject({ x: 1200, y: 500, z: 40 });
  });

  it('uses physical route diameters when checking parallel duct clearance', () => {
    const duct = (id: string, z: number) => ({ id, kind: 'duct', floorId, name: id, serviceCategory: 'hvac', wallIds: ['wall'], sourceDeviceId: 'indoor-unit', destinationDeviceId: 'heat-pump', duct: { widthMm: 160, heightMm: 160, material: '' }, points: [{ id: `${id}-1`, order: 0, x: 0, y: 2300, z }, { id: `${id}-2`, order: 1, x: 3000, y: 2300, z }] }) as Route;
    expect(findRouteIntersections([duct('HV-074', 0), duct('HV-075', 100)], {}, { hvac: 80 }, { hvac: 160 })).toHaveLength(1);
    expect(findRouteIntersections([duct('HV-074', 0), duct('HV-075', 170)], {}, { hvac: 80 }, { hvac: 160 })).toHaveLength(0);
    const resolved = resolveRouteConflicts(duct('HV-075', 100), [duct('HV-074', 0)], {}, { hvac: 80 }, { hvac: 160 });
    expect(resolved.remainingConflicts).toBe(0);
    expect(findRouteIntersections([duct('HV-074', 0), resolved.route], {}, { hvac: 80 }, { hvac: 160 })).toHaveLength(0);
  });

  it('keeps device approaches fixed and offsets a 90-degree corridor with one mitered turn', () => {
    const existing = { id: 'a', floorId, name: 'Power', serviceCategory: 'electrical', points: [{ id: 'a1', order: 0, x: 0, y: 1200, z: 0 }, { id: 'a2', order: 1, x: 2000, y: 1200, z: 0 }, { id: 'a3', order: 2, x: 2000, y: 1200, z: 2000 }] } as Route;
    const proposed = [{ x: 0, y: 1200, z: -80 }, { x: 0, y: 1200, z: 0 }, { x: 2000, y: 1200, z: 0 }, { x: 2000, y: 1200, z: 2000 }, { x: 2080, y: 1200, z: 2000 }];
    const separated = separateCoincidentRoute(proposed, [existing], 40, true);
    expect(separated[1]).toEqual(proposed[1]); expect(separated.at(-2)).toEqual(proposed.at(-2));
    expect(offsetPolylineCorner(proposed[1], proposed[2], proposed[3], 40)).toEqual({ x: 1960, y: 1200, z: 40 });
    const corridorCorner = separated.find((point) => point.x === 1960 && point.z === 40);
    expect(corridorCorner).toBeDefined();
  });

  it('fans out a shared wall span even when adjacent controls change only height', () => {
    const existing = { id: 'EL-F1-064', floorId, name: 'EL-F1-064', serviceCategory: 'electrical', points: [{ id: 'a', order: 0, x: -2047, y: 1380, z: 3550 }, { id: 'b', order: 1, x: -3055, y: 1380, z: 3550 }] } as Route;
    const requested = [{ x: -1961, y: 1325, z: 3550 }, { x: -2107, y: 1325, z: 3550 }, { x: -2107, y: 1380, z: 3550 }, { x: -3037, y: 1380, z: 3550 }, { x: -3037, y: 421, z: 3550 }];
    const separated = separateCoincidentRoute(requested, [existing], 30, false);
    const longHorizontal = separated.slice(1).map((end, index) => ({ start: separated[index], end })).filter((segment) => segment.start.y === 1380 && segment.end.y === 1380 && Math.abs(segment.end.x - segment.start.x) > 500);
    expect(longHorizontal.length).toBeGreaterThan(0);
    expect(longHorizontal.every((segment) => segment.start.z !== 3550 || segment.end.z !== 3550)).toBe(true);
    expect(separated.some((point) => point.z === 3580 || point.z === 3520)).toBe(true);
  });

  it('confines escaped intermediate duct controls to the associated finished wall', () => {
    const ductWall = { ...wall('duct-wall', -3650, -3283, -3633, 8300), thicknessMm: 250, structuralThicknessMm: 150, liningLeftMm: 100, liningRightMm: 0 };
    const duct = { id: 'HV-F1-072', wallIds: [ductWall.id], points: [{ id: 'p0', order: 0, x: -3516, y: 2320, z: 6271 }, { id: 'p1', order: 1, x: -3402, y: 2320, z: 6206 }, { id: 'p2', order: 2, x: -3614, y: 2320, z: 490 }, { id: 'p3', order: 3, x: -3614, y: 1798, z: 490 }] } as Route;
    const confined = confineRouteToAssociatedWalls(duct, [ductWall]);
    expect(Math.abs(worldToWallLocal(ductWall, confined.points[1]).depthMm)).toBeLessThanOrEqual(ductWall.thicknessMm / 2);
    expect(confined.points[0]).toEqual(duct.points[0]); expect(confined.points.at(-1)).toEqual(duct.points.at(-1));
  });

  it('removes duplicate wall-corner points while preserving one real 90-degree turn', () => {
    const simplified = simplifyRoutePoints([{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }]);
    expect(simplified).toEqual([{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }]);
  });

  it('insets a vertical transition to the configured concealed ceiling elevation', () => {
    expect(verticalTransitionBounds(2700, 3000, -50)).toEqual({ startMm: 2750, endMm: 2950, centerMm: 2850, heightMm: 200, insetMm: 50 });
    expect(verticalTransitionBounds(2700, 3000, 50)).toEqual({ startMm: 2700, endMm: 3000, centerMm: 2850, heightMm: 300, insetMm: 0 });
  });

  it('selects a clean bounded conflict detour instead of blindly applying one fixed dogleg', () => {
    const route = { id: 'route', floorId, name: 'Power', serviceCategory: 'electrical', wallIds: [], points: [{ id: 'r1', order: 0, x: -1000, y: 500, z: 0 }, { id: 'r2', order: 1, x: 1000, y: 500, z: 0 }] } as unknown as Route;
    const obstacle = { id: 'obstacle', floorId, name: 'Data', serviceCategory: 'data', wallIds: [], points: [{ id: 'o1', order: 0, x: 0, y: 500, z: -1000 }, { id: 'o2', order: 1, x: 0, y: 500, z: 1000 }] } as unknown as Route;
    const proposed = proposeRouteClearanceSolution(route, { x: 0, y: 500, z: 0 }, 30, [obstacle]);
    expect(findRouteIntersections([proposed, obstacle], {}, { electrical: 30, data: 30 })).toHaveLength(0);
    expect(routeLength(proposed) - routeLength(route)).toBeLessThanOrEqual(200);
    const resolved = resolveRouteConflicts(route, [obstacle], {}, { electrical: 30, data: 30 });
    expect(resolved.remainingConflicts).toBe(0); expect(findRouteIntersections([resolved.route, obstacle], {}, { electrical: 30, data: 30 })).toHaveLength(0);
  });

  it('applies the same surface-aware crossing rules to every route service and kind', () => {
    const host = { ...wall('service-wall', 0, 0, 4000, 0), thicknessMm: 500, structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100 };
    const obstacle = (id: string, serviceCategory: Route['serviceCategory'], points: Array<{ x: number; y: number; z: number }>) => ({ id, floorId, name: id, kind: 'cable', serviceCategory, wallIds: [host.id], points: points.map((point, order) => ({ ...point, id: `${id}-${order}`, order })) }) as Route;
    const obstacles = [
      obstacle('ceiling-x', 'electrical', [{ x: 1000, y: 2750, z: 1500 }, { x: 1000, y: 2750, z: 2500 }]),
      obstacle('ceiling-z', 'data', [{ x: 1500, y: 2750, z: 1000 }, { x: 2500, y: 2750, z: 1000 }]),
      obstacle('wall-high', 'electrical', [{ x: 500, y: 2000, z: 0 }, { x: 3500, y: 2000, z: 0 }]),
      obstacle('wall-low', 'data', [{ x: 500, y: 1000, z: 0 }, { x: 3500, y: 1000, z: 0 }]),
      obstacle('wall-parallel', 'security', [{ x: 1975, y: 2700, z: 0 }, { x: 1975, y: 500, z: 0 }])
    ];
    const separations = { electrical: 30, data: 30, security: 30, sensors: 30, automation: 30, generic: 30, plumbing: 40, heating: 40, hvac: 80 };
    const diameters = { electrical: 16, data: 8, security: 6, sensors: 6, automation: 8, generic: 20, plumbing: 25, heating: 20, hvac: 60 };
    const cases: Array<[Route['kind'], Route['serviceCategory']]> = [
      ['cable','electrical'], ['cable','data'], ['cable','security'], ['cable','sensors'], ['cable','automation'], ['cable','generic'],
      ['pipe','plumbing'], ['pipe','heating'], ['duct','hvac']
    ];
    for (const [kind, serviceCategory] of cases) {
      const route = { id: `candidate-${kind}-${serviceCategory}`, floorId, name: serviceCategory, kind, serviceCategory, wallIds: [host.id], points: [
        { id: 'r0', order: 0, x: 500, y: 2700, z: 2000 }, { id: 'r1', order: 1, x: 500, y: 2750, z: 2000 },
        { id: 'r2', order: 2, x: 2000, y: 2750, z: 2000 }, { id: 'r3', order: 3, x: 2000, y: 2750, z: 0 },
        { id: 'r4', order: 4, x: 2000, y: 400, z: 0 }
      ] } as Route;
      expect(findRouteIntersections([...obstacles, route], {}, separations, diameters).length, `${kind}/${serviceCategory} fixture`).toBeGreaterThan(2);
      const resolved = resolveRouteConflicts(route, obstacles, {}, separations, diameters, 10, [host]);
      expect(resolved.remainingConflicts, `${kind}/${serviceCategory}`).toBe(0);
      const candidateConflicts = findRouteIntersections([...obstacles, resolved.route], {}, separations, diameters).filter((conflict) => conflict.routeAId === route.id || conflict.routeBId === route.id);
      expect(candidateConflicts, `${kind}/${serviceCategory}`).toEqual([]);
    }
  });

  it('keeps bundled routes at one elevation and lifts only at a crossing', () => {
    const existing = { id: 'existing', floorId, name: 'Power', serviceCategory: 'electrical', wallIds: ['w'], points: [{ id: 'a1', order: 0, x: 0, y: 700, z: 0 }, { id: 'a2', order: 1, x: 3000, y: 700, z: 0 }] } as Route;
    const aligned = alignRouteToSharedElevation([{ x: -100, y: 400, z: 0 }, { x: 0, y: 400, z: 0 }, { x: 3000, y: 400, z: 0 }, { x: 3100, y: 400, z: 0 }], [existing], 30);
    expect(aligned.slice(1, -1).every((point) => point.y === 700)).toBe(true); expect(aligned[0].y).toBe(400); expect(aligned.at(-1)!.y).toBe(400);
    const crossing = addVerticalClearanceAtCrossings([{ x: 1500, y: 700, z: -1000 }, { x: 1500, y: 700, z: 1000 }], [existing], 40, 100, 2600);
    expect(crossing[0].y).toBe(700); expect(crossing.at(-1)!.y).toBe(700); expect(crossing.some((point) => point.y === 740)).toBe(true); expect(crossing.every((point) => point.x === 1500)).toBe(true);
  });

  it('preserves an upward floor crossing dogleg when the service stack is reapplied', () => {
    const obstacle = { id: 'obstacle', floorId, name: 'Water', kind: 'pipe', serviceCategory: 'plumbing', wallIds: [], points: [{ id: 'o1', order: 0, x: 0, y: -150, z: -1000 }, { id: 'o2', order: 1, x: 0, y: -150, z: 1000 }] } as unknown as Route;
    const route = { id: 'route', floorId, name: 'Power', kind: 'cable', serviceCategory: 'electrical', wallIds: [], points: [{ id: 'r1', order: 0, x: -1000, y: -150, z: 0 }, { id: 'r2', order: 1, x: 1000, y: -150, z: 0 }] } as unknown as Route;
    const resolved = resolveRouteConflicts(route, [obstacle], {}, { electrical: 30, plumbing: 60 }).route;
    const stacked = stackFloorRoutes([obstacle, resolved], floorId, -150, ['pipe','cable','duct'], { electrical: 30, plumbing: 60 });
    const finalRoute = stacked.find((item) => item.id === route.id)!;
    expect(Math.max(...finalRoute.points.map((point) => point.y))).toBeGreaterThan(-150);
    expect(findRouteIntersections(stacked, {}, { electrical: 30, plumbing: 60 })).toHaveLength(0);
  });
});
