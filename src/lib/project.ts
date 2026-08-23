import type { DevicePort, DevicePortTemplate, ProjectSnapshot } from '../../shared/types';
import { categoryIdForService, consolidatedServiceCategory, DEFAULT_CATEGORIES, DEFAULT_DEVICE_TYPES } from '../catalog';
import { defaultDeviceDisplayColor, ETHERNET_PAIR_COLORS, ITALIAN_CONDUCTOR_COLORS, PROJECT_SERVICE_COLORS } from './italianColors';
import { formatRouteName } from './routeNaming';
import { ceilingRouteHeight, confineRouteToAssociatedWalls, devicePlanObstacle, distance3, floorRouteHeight, isAutomaticRoutePoint, mountingRotation, preferredOrthogonalPlaneRoute, resolveRouteConflicts, restoreLegacyAutomaticClearancePoints, routePointsKeepDeviceClearance, routeSegmentAvoidsOpenings, routeSegmentsOnWall, routeSurfaceBounds, separateResidualCoincidentSegments, simplifyRoutePoints, stackFloorRoutes, verticalTransitionBounds, wallLength, wallLocalToWorld, wallServiceDepthMm, worldToWallLocal } from './geometry';
import { createDefaultRackSystem, PREPARED_RACK_DEPTH_MM, PREPARED_RACK_WIDTH_MM, rackHeightMm, synchronizeRackExternalPorts, upgradeLegacyPreparedRack } from './rack';
import { validRiserRouteLinks } from './riser';
import { DEFAULT_PROJECT_TITLE } from '../../shared/branding';
import { alignBlueprintToReference } from './blueprint';
import { dimensionsForDevicePorts } from './devicePorts';

export const DEFAULT_ROUTE_SEPARATIONS: ProjectSnapshot['preferences']['routeSeparationMm'] = { plumbing: 60, heating: 50, hvac: 80, electrical: 30, data: 30, security: 25, sensors: 25, automation: 25, generic: 30 };
export const DEFAULT_ROUTE_BEND_RADII: ProjectSnapshot['preferences']['routeBendRadiusMm'] = { plumbing: 150, heating: 150, hvac: 300, electrical: 100, data: 120, security: 80, sensors: 80, automation: 80, storage: 150, transitions: 40, generic: 100, custom: 100 };
export const DEFAULT_ROUTE_DIAMETERS: ProjectSnapshot['preferences']['routeDiameterMm'] = { plumbing: 25, heating: 20, hvac: 160, electrical: 16, data: 8, security: 6, sensors: 6, automation: 8, storage: 40, transitions: 40, generic: 20, custom: 20 };

function migrateLegacyJunctionPort<T extends { name: string; position: { x: number; y: number; z: number }; face: string }>(port: T): T {
  const input = port.name === 'Circuit input' && port.face === 'left' && port.position.x === -60 && port.position.y === 0 && port.position.z === 0;
  const output = port.name === 'Circuit output' && port.face === 'right' && port.position.x === 60 && port.position.y === 0 && port.position.z === 0;
  if (!input && !output) return port;
  return { ...port, face: 'back', position: { x: input ? -25 : 25, y: 0, z: -25 } } as T;
}

function usesLegacyMechanicalPorts(typeId: string, ports: Array<{ name: string }>): boolean {
  const names = new Set(ports.map((port) => port.name));
  if (typeId === 'indoor-unit') return ports.length === 2 && names.has('Electrical supply') && names.has('Refrigerant / flow');
  if (typeId === 'heat-pump') return ports.length <= 1 && (!ports.length || names.has('Service connection'));
  return false;
}

function revisedMechanicalDevicePorts(deviceId: string, typeId: string, existing: DevicePort[], templates: DevicePortTemplate[]): DevicePort[] {
  const unused = new Set(existing.map((port) => port.id));
  const compatibleService = (port: DevicePort, template: DevicePortTemplate) => port.serviceCategory === template.serviceCategory || typeId === 'heat-pump' && template.serviceCategory === 'hvac' && port.serviceCategory === 'heating';
  return templates.map((template) => {
    const exact = existing.find((port) => unused.has(port.id) && port.name.toLowerCase() === template.name.toLowerCase());
    const directional = existing.find((port) => unused.has(port.id) && compatibleService(port, template) && port.direction === template.direction);
    const legacyBidirectional = template.direction === 'input' ? existing.find((port) => unused.has(port.id) && compatibleService(port, template) && port.direction === 'bidirectional') : undefined;
    const previous = exact ?? directional ?? legacyBidirectional; if (previous) unused.delete(previous.id);
    return { ...structuredClone(template), id: previous?.id ?? crypto.randomUUID(), deviceId };
  });
}

/**
 * Repairs legacy concealed spans that sit at an arbitrary room height. The
 * containment rule is deliberately service-agnostic: every cable, pipe, and
 * duct must use an associated wall or the configured floor/ceiling plane.
 */
export function normalizeConcealedRouteSurfaces(project: ProjectSnapshot, routes: ProjectSnapshot['routes'] = project.routes): ProjectSnapshot['routes'] {
  const floorById = new Map(project.floors.map((floor) => [floor.id, floor])); const deviceById = new Map(project.devices.map((device) => [device.id, device])); const wallById = new Map(project.walls.map((wall) => [wall.id, wall]));
  return routes.map((route) => {
    if (route.installationMethod !== 'concealed' || route.points.length < 2) return route;
    const floor = floorById.get(route.floorId); const source = deviceById.get(route.sourceDeviceId ?? ''); const destination = deviceById.get(route.destinationDeviceId ?? '');
    const sourceWall = source?.wallId ? wallById.get(source.wallId) : undefined; const destinationWall = destination?.wallId ? wallById.get(destination.wallId) : undefined;
    if (!floor || !source || !destination) return route;
    const sourceSurface = sourceWall ? 'wall' : source.associationType; const destinationSurface = destinationWall ? 'wall' : destination.associationType;
    if (![sourceSurface, destinationSurface].every((surface) => ['wall', 'floor', 'ceiling'].includes(surface))) return route;
    // A direct floor-to-ceiling change requires an explicit wall, column, or
    // riser and cannot be inferred safely while opening an existing project.
    if (new Set([sourceSurface, destinationSurface]).has('floor') && new Set([sourceSurface, destinationSurface]).has('ceiling')) return route;
    const floorY = floorRouteHeight(project.preferences.floorRouteOffsetMm, route.kind, project.preferences.routeVerticalOrder, project.preferences.routeSeparationMm[route.serviceCategory] ?? 30);
    const ceilingY = ceilingRouteHeight(floor.ceilingHeightMm, project.preferences.ceilingRouteOffsetMm);
    const associatedWallIds = new Set([...route.wallIds, sourceWall?.id, destinationWall?.id].filter((id): id is string => !!id));
    const associatedWalls = project.walls.filter((wall) => associatedWallIds.has(wall.id));
    const escaped = route.points.slice(1).some((end, index) => {
      const start = route.points[index]; if (isAutomaticRoutePoint(start) || isAutomaticRoutePoint(end) || distance3(start, end) <= 300) return false;
      if (Math.abs(start.y - floorY) <= 5 && Math.abs(end.y - floorY) <= 5 || Math.abs(start.y - ceilingY) <= 5 && Math.abs(end.y - ceilingY) <= 5) return false;
      return !associatedWalls.some((wall) => routeSegmentsOnWall({ points: [start, end] }, wall).length > 0);
    });
    if (!escaped) return route;
    const wallAnchor = (wall: NonNullable<typeof sourceWall>, endpoint: ProjectSnapshot['routes'][number]['points'][number]) => {
      const local = worldToWallLocal(wall, endpoint); const side: -1 | 1 = local.depthMm < 0 ? -1 : 1;
      return wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)), Math.max(0, Math.min(wall.heightMm, endpoint.y)), wallServiceDepthMm(wall, side));
    };
    const start = route.points[0]; const end = route.points.at(-1)!; const startAnchor = sourceWall ? wallAnchor(sourceWall, start) : start; const endAnchor = destinationWall ? wallAnchor(destinationWall, end) : end;
    const useCeiling = sourceSurface === 'ceiling' || destinationSurface === 'ceiling' || sourceSurface !== 'floor' && destinationSurface !== 'floor' && Math.abs(startAnchor.y - ceilingY) + Math.abs(endAnchor.y - ceilingY) <= Math.abs(startAnchor.y - floorY) + Math.abs(endAnchor.y - floorY);
    const planeY = useCeiling ? ceilingY : floorY; const startPlane = { ...startAnchor, y: planeY }; const endPlane = { ...endAnchor, y: planeY };
    const plane = preferredOrthogonalPlaneRoute(startPlane, endPlane, planeY, [], [], project.preferences.routeTurnPenaltyMm);
    const points = simplifyRoutePoints([start, startAnchor, startPlane, ...plane, endPlane, endAnchor, end]);
    return { ...route, wallIds: [...associatedWallIds], points: points.map((point, order) => ({ ...point, id: crypto.randomUUID(), order })) };
  });
}

export type ConcealedRouteSurface = 'floor' | 'ceiling';

/**
 * Builds a complete endpoint-to-endpoint route through one valid concealed
 * plane. This is intentionally opt-in: diagnostics can compare a whole-route
 * alternative without silently replacing user-authored controls.
 */
export function rerouteConcealedRouteViaSurface(project: ProjectSnapshot, route: ProjectSnapshot['routes'][number], surface: ConcealedRouteSurface): ProjectSnapshot['routes'][number] | undefined {
  if (route.locked || route.installationMethod !== 'concealed' || route.points.length < 2) return undefined;
  const floor = project.floors.find((item) => item.id === route.floorId); const source = project.devices.find((item) => item.id === route.sourceDeviceId); const destination = project.devices.find((item) => item.id === route.destinationDeviceId);
  if (!floor || !source || !destination) return undefined;
  const wallById = new Map(project.walls.map((wall) => [wall.id, wall])); const sourceWall = source.wallId ? wallById.get(source.wallId) : undefined; const destinationWall = destination.wallId ? wallById.get(destination.wallId) : undefined;
  const sourceSurface = sourceWall ? 'wall' : source.associationType; const destinationSurface = destinationWall ? 'wall' : destination.associationType;
  if (![sourceSurface, destinationSurface].every((item) => ['wall', 'floor', 'ceiling'].includes(item))) return undefined;
  // A route may leave a wall for either plane, but it must not cross a room
  // vertically merely to change a floor-mounted endpoint into a ceiling run.
  if (surface === 'ceiling' && [sourceSurface, destinationSurface].includes('floor') || surface === 'floor' && [sourceSurface, destinationSurface].includes('ceiling')) return undefined;
  const planeY = surface === 'ceiling'
    ? ceilingRouteHeight(floor.ceilingHeightMm, project.preferences.ceilingRouteOffsetMm)
    : floorRouteHeight(project.preferences.floorRouteOffsetMm, route.kind, project.preferences.routeVerticalOrder, project.preferences.routeSeparationMm[route.serviceCategory] ?? 30);
  const start = route.points[0]; const end = route.points.at(-1)!;
  const wallAnchor = (wall: NonNullable<typeof sourceWall>, endpoint: typeof start) => {
    const local = worldToWallLocal(wall, endpoint); const side: -1 | 1 = local.depthMm < 0 ? -1 : 1;
    return wallLocalToWorld(wall, Math.max(0, Math.min(wallLength(wall), local.distanceAlongMm)), Math.max(0, Math.min(wall.heightMm, endpoint.y)), wallServiceDepthMm(wall, side));
  };
  const startAnchor = sourceWall ? wallAnchor(sourceWall, start) : start; const endAnchor = destinationWall ? wallAnchor(destinationWall, end) : end;
  const startPlane = { ...startAnchor, y: planeY }; const endPlane = { ...endAnchor, y: planeY };
  const excludedDevices = new Set([source.id, destination.id]);
  const obstacles = project.devices.filter((device) => device.floorId === route.floorId && !excludedDevices.has(device.id)).map((device) => devicePlanObstacle(device, planeY, 100)).filter((item): item is NonNullable<typeof item> => !!item);
  const plane = preferredOrthogonalPlaneRoute(startPlane, endPlane, planeY, [], obstacles, project.preferences.routeTurnPenaltyMm);
  const associatedWallIds = [...new Set([...route.wallIds, sourceWall?.id, destinationWall?.id].filter((id): id is string => !!id))];
  const candidate = { ...route, wallIds: associatedWallIds, points: simplifyRoutePoints([start, startAnchor, startPlane, ...plane, endPlane, endAnchor, end]).map((point, order) => ({ ...point, id: crypto.randomUUID(), order })) };
  const associatedWalls = project.walls.filter((wall) => associatedWallIds.includes(wall.id));
  const confined = confineRouteToAssociatedWalls(candidate, project.walls);
  const clearsOpenings = confined.points.slice(1).every((point, index) => associatedWalls.every((wall) => !routeSegmentsOnWall({ points: [confined.points[index], point] }, wall).length || routeSegmentAvoidsOpenings(wall, confined.points[index], point, project.devices, 100)));
  const clearsDevices = routePointsKeepDeviceClearance(confined.points, project.devices.filter((device) => device.floorId === route.floorId), [source.id, destination.id], 100);
  return clearsOpenings && clearsDevices ? confined : undefined;
}

/** Starts a project on elevation zero, falling back to the level nearest zero. */
export function startingFloorId(project: Pick<ProjectSnapshot, 'floors'>): string {
  return [...project.floors].sort((a, b) => Math.abs(a.elevationMm) - Math.abs(b.elevationMm) || a.sortOrder - b.sortOrder)[0]?.id ?? '';
}

/** Registers every calibrated floor plan to the shared point on the elevation-zero plan. */
export function alignFloorBlueprints(floors: ProjectSnapshot['floors']): ProjectSnapshot['floors'] {
  const referenceId = startingFloorId({ floors });
  const reference = floors.find((floor) => floor.id === referenceId)?.blueprint;
  if (!reference?.alignmentPointPx) return floors;
  return floors.map((floor) => floor.id === referenceId || !floor.blueprint?.alignmentPointPx
    ? floor
    : { ...floor, blueprint: alignBlueprintToReference(floor.blueprint, reference) });
}

function repairLegacyTransitionRoutes(project: ProjectSnapshot): ProjectSnapshot {
  const transitionIds = new Set(project.devices.filter((device) => device.typeId === 'floor-transition').map((device) => device.id));
  const routes = project.routes.map((route) => {
    const transitionAtStart = !!route.sourceDeviceId && transitionIds.has(route.sourceDeviceId); const transitionAtEnd = !!route.destinationDeviceId && transitionIds.has(route.destinationDeviceId);
    if (transitionAtStart === transitionAtEnd || route.points.length < 2) return route;
    const otherDeviceId = transitionAtStart ? route.destinationDeviceId : route.sourceDeviceId; const otherDevice = project.devices.find((device) => device.id === otherDeviceId);
    const hasOpenDiagonal = route.points.slice(1).some((point, index) => Math.abs(point.x - route.points[index].x) > 2 && Math.abs(point.z - route.points[index].z) > 2);
    if (!otherDevice || !['floor','free'].includes(otherDevice.associationType) || !hasOpenDiagonal && route.name !== 'EL-GF-038') return route;
    const oriented = transitionAtStart ? route.points : [...route.points].reverse(); const transitionPoint = oriented[0]; const devicePoint = oriented[oriented.length - 1];
    const transitionPlane = { x: transitionPoint.x, y: 0, z: transitionPoint.z }; const devicePlane = { x: devicePoint.x, y: 0, z: devicePoint.z };
    const rebuilt = simplifyRoutePoints([transitionPoint, transitionPlane, ...preferredOrthogonalPlaneRoute(transitionPlane, devicePlane, 0), devicePlane, devicePoint]);
    const ordered = transitionAtStart ? rebuilt : rebuilt.reverse();
    return { ...route, wallIds: [], points: ordered.map((point, order) => ({ ...point, id: crypto.randomUUID(), order })) };
  });
  return routes.some((route, index) => route !== project.routes[index]) ? { ...project, routes } : project;
}

export function createDefaultProject(title = DEFAULT_PROJECT_TITLE): ProjectSnapshot {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const floorId = crypto.randomUUID();
  const upgraded: ProjectSnapshot = {
    id: projectId,
    title: title.trim() || DEFAULT_PROJECT_TITLE,
    description: '',
    createdAt: now,
    updatedAt: now,
    floors: [{ id: floorId, name: 'Ground floor', sortOrder: 0, elevationMm: 0, ceilingHeightMm: 2700 }],
    walls: [], rooms: [], roomCategories: [], devices: [], routes: [], measurements: [],
    deviceTypes: structuredClone(DEFAULT_DEVICE_TYPES),
    categories: structuredClone(DEFAULT_CATEGORIES),
    exportPresets: [{
      id: crypto.randomUUID(), name: 'Printable wall scheme', width: 842, height: 595, scale: 5,
      transparent: false, style: 'light', showWallOutline: true, showDimensions: true,
      showLabels: true, showRouteMetadata: true, showLegend: true, showTitleBlock: true,
      includeRoomName: true, includeWallName: true, includeExportDate: true
    }],
    cameraViews: [], lightingControls: [], photoMarkers: [],
    preferences: { theme: 'system', gridSizeMm: 100, snapToGrid: true, snapToEndpoints: true, unit: 'm', newWallThicknessMm: 120, newWallStructuralThicknessMm: 120, newWallLiningLeftMm: 0, newWallLiningRightMm: 0, avoidRouteOverlaps: true, preferSharedCorridors: true, routeNamingPattern: '{PREFIX}-{FLOOR}-{SEQ:03}', routeNamingPrefixes: { electrical: 'EL', data: 'DA', security: 'S', hvac: 'HV', heating: 'HT', plumbing: 'PL', sensors: 'SN', automation: 'AU', generic: 'GN', custom: 'CU' }, routeTurnPenaltyMm: 500, ceilingRouteOffsetMm: -50, floorRouteOffsetMm: -150, routeVerticalOrder: ['pipe', 'cable', 'duct'], routeBendRadiusMm: { ...DEFAULT_ROUTE_BEND_RADII }, motionMode: 'animated', routeOverlapPriorities: { plumbing: 1, hvac: 1, heating: 2, electrical: 2, data: 3, security: 3, automation: 4, generic: 4 }, routeSeparationMm: { ...DEFAULT_ROUTE_SEPARATIONS }, routeDiameterMm: { ...DEFAULT_ROUTE_DIAMETERS }, intersectionCheckEnabled: true }
  };
  return upgraded;
}

export function upgradeProject(project: ProjectSnapshot): ProjectSnapshot {
  const title = project.title.trim() || DEFAULT_PROJECT_TITLE;
  const legacyCategoryIds = new Set(['lighting', 'wifi', 'cctv']);
  const legacyColors: Record<string, string> = { electrical: '#f0b429', data: '#2f80ed', security: '#ef476f', hvac: '#06b6d4', heating: '#f97316', plumbing: '#14b8a6', sensors: '#84cc16', automation: '#a855f7', storage: '#8b6f47', transitions: '#22d3ee', generic: '#64748b' };
  const categories = (project.categories ?? [])
    .filter((item) => !legacyCategoryIds.has(item.id) && !legacyCategoryIds.has(item.serviceCategory))
    .map((item) => { const serviceCategory = consolidatedServiceCategory(item.serviceCategory); return { ...item, serviceCategory, color: item.color.toLowerCase() === legacyColors[serviceCategory]?.toLowerCase() ? PROJECT_SERVICE_COLORS[serviceCategory] ?? item.color : item.color }; });
  const categoryIds = new Set(categories.map((item) => item.id));
  const legacyTypeIds: Record<string, string> = { 'wifi-access-point': 'access-point', 'hvac-unit': 'indoor-unit', 'square-column': 'column', 'round-column': 'column', furniture: 'furniture-custom', 'floor-riser': 'floor-transition', 'custom-electrical': 'appliance-connection' };
  const defaultTypeById = new Map(DEFAULT_DEVICE_TYPES.map((item) => [item.id, item]));
  const builtInTypeRevisionUpgrades = new Set((project.deviceTypes ?? []).map((source) => ({ source, id: legacyTypeIds[source.id] ?? source.id })).filter(({ source, id }) => { const defaults = defaultTypeById.get(id); return !source.custom && (source.builtInRevision ?? 0) < (defaults?.builtInRevision ?? 0); }).map(({ id }) => id));
  const upgradedTypeMap = new Map<string, ProjectSnapshot['deviceTypes'][number]>();
  (project.deviceTypes ?? []).forEach((source) => {
    if (source.id === 'custom-electrical') return;
    const item = { ...source, id: legacyTypeIds[source.id] ?? source.id };
    const serviceCategory = consolidatedServiceCategory(item.serviceCategory);
    const defaults = defaultTypeById.get(item.id);
    const requiresBuiltInRevision = builtInTypeRevisionUpgrades.has(item.id); const association = requiresBuiltInRevision && item.id === 'rack' ? defaults?.defaultAssociation ?? 'floor' : item.defaultAssociation ?? defaults?.defaultAssociation ?? 'wall'; const legacyMountingFace = !item.custom && item.defaultBackFace === 'back' && (association === 'floor' || association === 'ceiling') && item.id !== 'access-point'; const legacyRackSize = item.id === 'rack' && item.defaultDimensions.width === 600 && item.defaultDimensions.depth === 800; const solarDimensions = item.id === 'solar-panel' && item.defaultDimensions.height <= 60 ? defaults?.defaultDimensions : item.id === 'access-point' && !item.custom || legacyRackSize ? defaults?.defaultDimensions : item.defaultDimensions;
    const configuredDefaultPorts = (requiresBuiltInRevision && ['indoor-unit','outdoor-unit','heat-pump'].includes(item.id) ? defaults?.defaultPorts : !item.custom && usesLegacyMechanicalPorts(item.id, item.defaultPorts ?? []) ? defaults?.defaultPorts : !item.custom && !(item.defaultPorts ?? []).length ? defaults?.defaultPorts : item.defaultPorts) ?? defaults?.defaultPorts ?? [];
    upgradedTypeMap.set(item.id, {
      ...defaults, ...item, builtInRevision: defaults?.builtInRevision ?? item.builtInRevision, name: item.id === 'switch' && !item.custom ? defaults?.name ?? item.name : item.name, serviceCategory, categoryId: categoryIdForService(serviceCategory),
      defaultDisplayColor: item.defaultDisplayColor ?? defaultDeviceDisplayColor(item.id, serviceCategory),
      family: defaults?.family ?? item.family ?? 'device', shape: item.id === 'access-point' && !item.custom ? defaults?.shape ?? item.shape : item.shape, defaultBackFace: requiresBuiltInRevision && item.id === 'rack' ? defaults?.defaultBackFace ?? 'bottom' : item.id === 'access-point' && !item.custom ? 'back' : legacyMountingFace ? defaults?.defaultBackFace ?? item.defaultBackFace : item.defaultBackFace ?? defaults?.defaultBackFace ?? 'back',
      defaultAssociation: association, defaultDimensions: solarDimensions ?? defaults?.defaultDimensions ?? item.defaultDimensions,
      defaultPorts: configuredDefaultPorts.map((port) => {
        const normalized = { ...port, position: item.id === 'solar-panel' && port.name === 'DC output' && port.position?.y === -15 ? { ...port.position, y: 400 } : port.position ?? { x: 0, y: 0, z: 0 }, face: port.face ?? 'back', required: port.required ?? false, spaceRequiredMm: port.spaceRequiredMm ?? defaults?.defaultPortSpaceMm ?? 30 };
        return item.id === 'junction-box' ? migrateLegacyJunctionPort(normalized) : normalized;
      }),
      unlimitedPorts: item.unlimitedPorts ?? defaults?.unlimitedPorts ?? false, defaultPortSpaceMm: item.defaultPortSpaceMm ?? defaults?.defaultPortSpaceMm
    } as ProjectSnapshot['deviceTypes'][number]);
  });
  const deviceTypes = [...upgradedTypeMap.values()];
  const typeIds = new Set(deviceTypes.map((item) => item.id));
  const exportPresets = (project.exportPresets ?? []).map((preset, index) => index === 0 && preset.width === 1600 && preset.height === 1000 && preset.scale === 1
    ? { ...preset, name: 'Printable wall scheme', width: 842, height: 595, scale: 5 }
    : preset);
  const namingPreferences = { ...createDefaultProject().preferences, ...project.preferences, routeNamingPattern: project.preferences?.routeNamingPattern ?? '{PREFIX}-{FLOOR}-{SEQ:03}', routeNamingPrefixes: project.preferences?.routeNamingPrefixes ?? { electrical: 'EL', data: 'DA', security: 'S', hvac: 'HV', heating: 'HT', plumbing: 'PL', sensors: 'SN', automation: 'AU', generic: 'GN', custom: 'CU' } };
  const namingProject = { floors: project.floors ?? [], routes: project.routes ?? [], preferences: namingPreferences };
  const upgraded: ProjectSnapshot = {
    ...project,
    title,
    roomCategories: project.roomCategories ?? [],
    floors: (project.floors ?? []).map((floor, index) => ({ ...floor, sortOrder: floor.sortOrder ?? index })),
    walls: (project.walls ?? []).map((wall) => {
      const structuralThicknessMm = wall.structuralThicknessMm ?? wall.thicknessMm;
      const liningLeftMm = wall.liningLeftMm ?? 0; const liningRightMm = wall.liningRightMm ?? 0;
      return { ...wall, thicknessMm: structuralThicknessMm + liningLeftMm + liningRightMm, structuralThicknessMm, liningLeftMm, liningRightMm, hidden: false };
    }),
    rooms: (project.rooms ?? []).map((room) => ({ ...room, locked: room.locked ?? false })),
    categories: [...categories, ...DEFAULT_CATEGORIES.filter((item) => !categoryIds.has(item.id)).map((item) => structuredClone(item))],
    deviceTypes: [...deviceTypes, ...DEFAULT_DEVICE_TYPES.filter((item) => !typeIds.has(item.id)).map((item) => structuredClone(item))],
    devices: (project.devices ?? []).map((device) => {
      const serviceCategory = consolidatedServiceCategory(device.serviceCategory);
      const associatedWall = (project.walls ?? []).find((wall) => wall.id === device.wallId);
      const typeId = legacyTypeIds[device.typeId] ?? device.typeId;
      const defaults = defaultTypeById.get(typeId);
      const existingPorts = device.ports ?? [];
      const refreshMechanicalPorts = !!defaults && builtInTypeRevisionUpgrades.has(typeId) && ['indoor-unit','outdoor-unit','heat-pump'].includes(typeId); const portSources: DevicePort[] = refreshMechanicalPorts ? revisedMechanicalDevicePorts(device.id, typeId, existingPorts, defaults.defaultPorts) : existingPorts.length ? existingPorts : (defaults?.defaultPorts ?? []).map((port) => ({ ...structuredClone(port), id: crypto.randomUUID(), deviceId: device.id }));
      let ports: DevicePort[] = portSources.map((port) => {
        const normalized = { ...port, deviceId: device.id, serviceCategory: consolidatedServiceCategory(port.serviceCategory), position: port.position ?? { x: 0, y: 0, z: 0 }, face: port.face ?? 'back', required: port.required ?? false, spaceRequiredMm: port.spaceRequiredMm ?? defaults?.defaultPortSpaceMm ?? 30 } as DevicePort;
        return typeId === 'junction-box' ? migrateLegacyJunctionPort(normalized) : normalized;
      });
      let transitionPatch: Partial<ProjectSnapshot['devices'][number]> = {};
      if (typeId === 'access-point' && device.dimensions.width === 180 && device.dimensions.height === 45 && device.dimensions.depth === 180) {
        transitionPatch = { dimensions: { ...(defaults?.defaultDimensions ?? device.dimensions) }, backFace: 'back', rotationDeg: mountingRotation('back', device.associationType, associatedWall, device.wallSide) };
        ports = ports.map((port) => port.name === 'PoE / Ethernet' ? { ...port, position: { x: 0, y: -45, z: -18 }, face: 'back' } : port);
      }
      if (typeId === 'solar-panel' && device.dimensions.height <= 60) {
        const height = defaults?.defaultDimensions.height ?? 900; ports = ports.map((port) => port.name === 'DC output' && port.position.y === -15 ? { ...port, position: { ...port.position, y: 400 } } : port); transitionPatch = { dimensions: { ...device.dimensions, height }, position: { ...device.position, y: height / 2 }, heightFromFloorMm: height / 2 };
      }
      if (typeId === 'floor-transition' && device.transitionToFloorId) {
        const sourceFloor = (project.floors ?? []).find((floor) => floor.id === device.floorId); const targetFloor = (project.floors ?? []).find((floor) => floor.id === device.transitionToFloorId);
        if (sourceFloor && targetFloor) {
          const lowerFloor = sourceFloor.elevationMm <= targetFloor.elevationMm ? sourceFloor : targetFloor; const upperFloor = lowerFloor.id === sourceFloor.id ? targetFloor : sourceFloor;
          const lowerBoundary = lowerFloor.elevationMm + lowerFloor.ceilingHeightMm; const upperBoundary = upperFloor.elevationMm; const bounds = verticalTransitionBounds(lowerBoundary, upperBoundary, namingPreferences.ceilingRouteOffsetMm); const center = bounds.centerMm;
          const boundary = (floorId: string) => floorId === lowerFloor.id ? bounds.startMm : bounds.endMm;
          ports = ports.map((port, index) => { const portFloor = port.name === targetFloor.name || index === 1 ? targetFloor : sourceFloor; return { ...port, position: { ...port.position, y: boundary(portFloor.id) - center }, face: (portFloor.id === lowerFloor.id ? 'bottom' : 'top') as 'bottom' | 'top' }; });
          transitionPatch = { position: { ...device.position, y: center - sourceFloor.elevationMm }, heightFromFloorMm: center - sourceFloor.elevationMm, dimensions: { ...device.dimensions, height: bounds.heightMm }, accessibleFloorIds: [sourceFloor.id, targetFloor.id] };
        }
      }
      let customProperties = device.customProperties ?? [];
      if (typeId === 'staircase') {
        const sourceFloor = (project.floors ?? []).find((floor) => floor.id === device.floorId); const upperFloor = sourceFloor ? [...(project.floors ?? [])].filter((floor) => floor.elevationMm > sourceFloor.elevationMm).sort((a, b) => a.elevationMm - b.elevationMm)[0] : undefined;
        if (sourceFloor && upperFloor) {
          const rise = upperFloor.elevationMm - sourceFloor.elevationMm; const currentCount = Number(customProperties.find((item) => item.key === 'Step count')?.value) || 0; const stepCount = Math.max(currentCount, Math.ceil(rise / 180));
          transitionPatch = { ...transitionPatch, position: { ...device.position, y: Math.round(rise / 2) }, heightFromFloorMm: Math.round(rise / 2), dimensions: { ...device.dimensions, height: rise }, accessibleFloorIds: [sourceFloor.id, upperFloor.id] };
          customProperties = [...customProperties.filter((item) => !['Step count','Upper floor'].includes(item.key)), { key: 'Step count', value: String(stepCount) }, { key: 'Upper floor', value: upperFloor.id }];
        }
      }
      let rackConfiguration = device.rackConfiguration;
      if (typeId === 'rack') {
        if (!rackConfiguration) { const prepared = createDefaultRackSystem(device.id); rackConfiguration = prepared.configuration; ports = [...ports, ...prepared.externalPorts]; }
        else { const upgraded = upgradeLegacyPreparedRack(rackConfiguration, device.id, ports); rackConfiguration = upgraded.configuration; ports = upgraded.externalPorts; }
        const dimensions = { width: PREPARED_RACK_WIDTH_MM, height: rackHeightMm(rackConfiguration.totalUnits), depth: PREPARED_RACK_DEPTH_MM };
        const previousDimensions = device.dimensions ?? defaults?.defaultDimensions ?? dimensions; const previousPosition = device.position ?? { x: 0, y: previousDimensions.height / 2, z: 0 }; const migrateRackToFloor = builtInTypeRevisionUpgrades.has(typeId);
        const bottom = previousPosition.y - previousDimensions.height / 2; const y = device.associationType === 'floor' || migrateRackToFloor ? dimensions.height / 2 : bottom + dimensions.height / 2;
        transitionPatch = { ...transitionPatch, dimensions, position: { ...previousPosition, y }, heightFromFloorMm: y, ...(migrateRackToFloor ? { associationType: 'floor' as const, backFace: 'bottom' as const, wallId: undefined, distanceAlongWallMm: undefined, depthInsideWallMm: undefined, wallSide: undefined, mounting: 'surface' as const } : {}) };
        ports = synchronizeRackExternalPorts({ id: device.id, dimensions, ports }, rackConfiguration);
      }
      const upgradedDevice = {
        ...device,
        ...transitionPatch,
        name: typeId === 'switch' && /^Switch(?:\s+\d+)?$/i.test(device.name) ? device.name.replace(/^Switch/i, 'Light switch') : device.name,
        typeId,
        floorId: associatedWall?.floorId ?? device.floorId,
        installationStatus: device.installationStatus === 'decommissioned' ? 'planned' : device.installationStatus,
        showLabel: device.showLabel ?? false,
        colorSource: device.colorSource ?? 'projectConvention',
        serviceCategory,
        categoryId: categoryIdForService(serviceCategory),
        backFace: transitionPatch.backFace ?? (typeId === 'access-point' && !defaults?.custom ? 'back' : !!defaults && !defaults.custom && device.backFace === 'back' && (device.associationType === 'floor' || device.associationType === 'ceiling') ? defaults.defaultBackFace : device.backFace ?? defaults?.defaultBackFace ?? 'back'),
        accessibleFloorIds: transitionPatch.accessibleFloorIds ?? device.accessibleFloorIds ?? (typeId === 'floor-transition' ? [device.floorId, ...(device.transitionToFloorId ? [device.transitionToFloorId] : [])] : undefined),
        rackConfiguration,
        customProperties,
        junctionRouteGroups: (device.junctionRouteGroups ?? []).map((group) => ({ ...group, incomingRouteIds: (group.incomingRouteIds ?? []).filter((id) => (project.routes ?? []).some((route) => route.id === id)), outgoingRouteIds: (group.outgoingRouteIds ?? []).filter((id) => (project.routes ?? []).some((route) => route.id === id)) })),
        ports
      } as ProjectSnapshot['devices'][number];
      const upgradedType = upgradedTypeMap.get(typeId) ?? defaults;
      return upgradedType ? { ...upgradedDevice, dimensions: dimensionsForDevicePorts(upgradedDevice, upgradedType, ports) } : upgradedDevice;
    }),
    routes: (project.routes ?? []).map((route, index) => {
      const serviceCategory = consolidatedServiceCategory(route.serviceCategory); const conductorConfiguration = route.conductorConfiguration ?? (route.kind === 'cable' && serviceCategory === 'electrical' ? 'single-phase' : undefined); const ethernetTerminationStandard = route.ethernetTerminationStandard ?? (route.kind === 'cable' && serviceCategory === 'data' ? 'T568B' : undefined);
      const legacyNumber = route.name.match(/^(?:cable|pipe|duct)[-_ ]?(\d+)$/i)?.[1]; const name = legacyNumber ? formatRouteName(namingProject, serviceCategory, route.kind, route.floorId, Number(legacyNumber) || index + 1) : route.name;
      return { ...route, name, serviceCategory, points: restoreLegacyAutomaticClearancePoints(route.points ?? []), flowDirection: route.flowDirection ?? 'source-to-destination', colorSource: route.colorSource ?? 'projectConvention', conductorConfiguration, conductorColors: route.conductorColors ?? (conductorConfiguration && conductorConfiguration !== 'custom' ? structuredClone(ITALIAN_CONDUCTOR_COLORS[conductorConfiguration]) : undefined), ethernetTerminationStandard, ethernetPairColors: route.ethernetPairColors ?? (ethernetTerminationStandard ? structuredClone(ETHERNET_PAIR_COLORS[ethernetTerminationStandard]) : undefined) };
    }),
    measurements: (project.measurements ?? []).map((measurement) => ({ ...measurement, locked: measurement.locked ?? false })),
    exportPresets: exportPresets.length ? exportPresets : createDefaultProject().exportPresets,
    lightingControls: (project.lightingControls ?? []).filter((control) => (project.devices ?? []).some((device) => device.id === control.switchDeviceId && (legacyTypeIds[device.typeId] ?? device.typeId) === 'switch')).map((control) => ({ ...control, state: control.state ?? 'off', notes: control.notes ?? '', lightDeviceIds: (control.lightDeviceIds ?? []).filter((id) => (project.devices ?? []).some((device) => device.id === id && (legacyTypeIds[device.typeId] ?? device.typeId) === 'light-point')) })),
    photoMarkers: (project.photoMarkers ?? []).filter((marker) => (project.floors ?? []).some((floor) => floor.id === marker.floorId)).map((marker) => ({ ...marker, projectId: project.id, photos: marker.photos ?? [] })),
    preferences: {
      ...project.preferences,
      unit: project.preferences?.unit ?? 'm',
      newWallStructuralThicknessMm: project.preferences?.newWallStructuralThicknessMm ?? project.preferences?.newWallThicknessMm ?? 120,
      newWallLiningLeftMm: project.preferences?.newWallLiningLeftMm ?? 0,
      newWallLiningRightMm: project.preferences?.newWallLiningRightMm ?? 0,
      newWallThicknessMm: (project.preferences?.newWallStructuralThicknessMm ?? project.preferences?.newWallThicknessMm ?? 120) + (project.preferences?.newWallLiningLeftMm ?? 0) + (project.preferences?.newWallLiningRightMm ?? 0),
      avoidRouteOverlaps: project.preferences?.avoidRouteOverlaps ?? true,
      preferSharedCorridors: project.preferences?.preferSharedCorridors ?? true,
      routeNamingPattern: project.preferences?.routeNamingPattern ?? '{PREFIX}-{FLOOR}-{SEQ:03}',
      routeNamingPrefixes: project.preferences?.routeNamingPrefixes ?? { electrical: 'EL', data: 'DA', security: 'S', hvac: 'HV', heating: 'HT', plumbing: 'PL', sensors: 'SN', automation: 'AU', generic: 'GN', custom: 'CU' },
      routeTurnPenaltyMm: project.preferences?.routeTurnPenaltyMm ?? 500,
      ceilingRouteOffsetMm: project.preferences?.ceilingRouteOffsetMm == null ? -50 : project.preferences.ceilingRouteOffsetMm > 0 ? -project.preferences.ceilingRouteOffsetMm : project.preferences.ceilingRouteOffsetMm,
      floorRouteOffsetMm: project.preferences?.floorRouteOffsetMm == null ? -150 : project.preferences.floorRouteOffsetMm > 0 ? -project.preferences.floorRouteOffsetMm : project.preferences.floorRouteOffsetMm,
      routeVerticalOrder: project.preferences?.routeVerticalOrder?.length === 3 && new Set(project.preferences.routeVerticalOrder).size === 3 ? project.preferences.routeVerticalOrder : ['pipe', 'cable', 'duct'],
      routeBendRadiusMm: { ...DEFAULT_ROUTE_BEND_RADII, ...(project.preferences?.routeBendRadiusMm ?? {}) },
      motionMode: project.preferences?.motionMode === 'off' ? 'off' : 'animated',
      routeOverlapPriorities: project.preferences?.routeOverlapPriorities ?? { plumbing: 1, hvac: 1, heating: 2, electrical: 2, data: 3, security: 3, automation: 4, generic: 4 },
      routeSeparationMm: { ...DEFAULT_ROUTE_SEPARATIONS, ...(project.preferences?.routeSeparationMm ?? {}) },
      routeDiameterMm: { ...DEFAULT_ROUTE_DIAMETERS, ...(project.preferences?.routeDiameterMm ?? {}) },
      intersectionCheckEnabled: project.preferences?.intersectionCheckEnabled ?? true
    }
  };
  const aligned = { ...upgraded, floors: alignFloorBlueprints(upgraded.floors) };
  const repaired = repairLegacyTransitionRoutes(aligned);
  const surfaceRepairedRoutes = normalizeConcealedRouteSurfaces(repaired);
  const stackedRoutes = repaired.floors.reduce((items, floor) => stackFloorRoutes(items, floor.id, repaired.preferences.floorRouteOffsetMm, repaired.preferences.routeVerticalOrder, repaired.preferences.routeSeparationMm), surfaceRepairedRoutes);
  const routes = stackedRoutes.reduce<ProjectSnapshot['routes']>((items, route) => {
    const existing = items.filter((item) => item.floorId === route.floorId);
    const clearance = repaired.preferences.routeSeparationMm[route.serviceCategory] ?? 30;
    const separated = { ...route, points: separateResidualCoincidentSegments(route.points, existing, clearance).map((point, order) => ({ ...point, id: 'id' in point && typeof point.id === 'string' ? point.id : crypto.randomUUID(), order })) };
    // Reapply the same route-creation invariant in persistence order: an older
    // installed run remains stable and each later run must clear what already
    // exists, independent of route kind or service category.
    const resolved = resolveRouteConflicts(separated, repaired.preferences.avoidRouteOverlaps ? existing : [], repaired.preferences.routeOverlapPriorities, repaired.preferences.routeSeparationMm, repaired.preferences.routeDiameterMm, 10, repaired.walls, repaired.preferences.routeBendRadiusMm, routeSurfaceBounds(repaired.floors, route.floorId), repaired.preferences.routeTurnPenaltyMm, repaired.devices.filter((device) => device.floorId === route.floorId)).route;
    const confined = confineRouteToAssociatedWalls(resolved, repaired.walls); const normalized = normalizeConcealedRouteSurfaces({ ...repaired, routes: [confined] }, [confined])[0] ?? confined;
    items.push(normalized); return items;
  }, []);
  return { ...repaired, routes, devices: repaired.devices.map((device) => device.typeId === 'floor-transition' ? { ...device, riserRouteLinks: validRiserRouteLinks(routes, device.id, device.riserRouteLinks) } : device) };
}

/** Removes devices, their connected routes, and references that would otherwise become stale. */
export function removeDevicesAndConnectedRoutes(project: ProjectSnapshot, deviceIds: Iterable<string>, explicitRouteIds: Iterable<string> = []): ProjectSnapshot {
  const deletedDevices = new Set(deviceIds); const deletedRoutes = new Set(explicitRouteIds);
  project.routes.forEach((route) => { if (route.sourceDeviceId && deletedDevices.has(route.sourceDeviceId) || route.destinationDeviceId && deletedDevices.has(route.destinationDeviceId)) deletedRoutes.add(route.id); });
  const routes = project.routes.filter((route) => !deletedRoutes.has(route.id)); const routeIds = new Set(routes.map((route) => route.id));
  const devices = project.devices.filter((device) => !deletedDevices.has(device.id)).map((device) => ({
    ...device,
    riserRouteLinks: device.typeId === 'floor-transition' ? validRiserRouteLinks(routes, device.id, device.riserRouteLinks) : device.riserRouteLinks,
    junctionRouteGroups: device.junctionRouteGroups?.map((group) => ({ ...group, incomingRouteIds: group.incomingRouteIds.filter((id) => routeIds.has(id)), outgoingRouteIds: group.outgoingRouteIds.filter((id) => routeIds.has(id)) })).filter((group) => group.incomingRouteIds.length || group.outgoingRouteIds.length)
  }));
  const lightingControls = project.lightingControls.filter((control) => !deletedDevices.has(control.switchDeviceId)).map((control) => ({ ...control, lightDeviceIds: control.lightDeviceIds.filter((id) => !deletedDevices.has(id)) }));
  return { ...project, devices, routes, lightingControls };
}

export function serializeProject(project: ProjectSnapshot): string {
  return JSON.stringify({ format: 'casa-infrastructure-project', version: 1, project }, null, 2);
}

export function parseProjectBackup(text: string): ProjectSnapshot {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Backup must contain a JSON object.');
  const envelope = parsed as { format?: unknown; version?: unknown; project?: unknown };
  if (envelope.format !== 'casa-infrastructure-project' || envelope.version !== 1) {
    throw new Error('Unsupported project backup format.');
  }
  const project = envelope.project as Partial<ProjectSnapshot> | undefined;
  if (!project || typeof project.id !== 'string' || typeof project.title !== 'string') {
    throw new Error('Backup project metadata is invalid.');
  }
  const arrayKeys: Array<keyof ProjectSnapshot> = ['floors', 'walls', 'rooms', 'devices', 'deviceTypes', 'routes', 'measurements', 'categories', 'exportPresets', 'cameraViews'];
  for (const key of arrayKeys) if (!Array.isArray(project[key])) throw new Error(`Backup field “${key}” must be an array.`);
  if (!project.preferences || typeof project.preferences !== 'object') throw new Error('Backup preferences are invalid.');
  return project as ProjectSnapshot;
}

export interface HistoryState<T> { past: T[]; present: T; future: T[] }

export function createHistory<T>(present: T): HistoryState<T> { return { past: [], present, future: [] }; }
export function commitHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  if (next === state.present) return state;
  return { past: [...state.past.slice(-49), state.present], present: next, future: [] };
}
export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1];
  return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
}
export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (!state.future.length) return state;
  const next = state.future[0];
  return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
}
