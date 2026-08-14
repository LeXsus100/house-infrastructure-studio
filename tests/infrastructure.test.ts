import { describe, expect, it } from 'vitest';
import type { Device, Floor, FloorBlueprint, ProjectSnapshot, Route, Wall } from '../shared/types';
import { alignBlueprintToReference, blueprintPixelToWorld, setBlueprintNorthArrow, updateBlueprintTransformPreservingAlignment, worldToBlueprintPixel } from '../src/lib/blueprint';
import { nearestWallPoint, preferredOrthogonalPlaneRoute, routePointsKeepDeviceClearance, routeSegmentDetourDevices, routeTurnCount, wallRenderEndExtensions, wallRenderIntersectionCuts } from '../src/lib/geometry';
import { createDefaultRackConfiguration, createDefaultRackSystem, normalizeRackModules, rackUsedUnits, upgradeLegacyPreparedRack } from '../src/lib/rack';
import { effectiveRiserDiameterMm, riserRouteGroups, riserRouteSlots, transitionContinuityAudit, transitionFlowAudit } from '../src/lib/riser';
import { findJunctionDiagnostics, findOverlengthCables, findRiserDiagnostics, findUnconnectedDevices } from '../src/lib/diagnostics';
import { portDirectionFits, reassignRouteDevicePort, replacementPorts, routeCreationPortFits, routeEndpointDirectionsCoherent, routeFlowFromEndpointPorts, routesUsingDevicePort } from '../src/lib/ports';
import { numberedFloors } from '../src/lib/floors';
import { clipRouteToRoom } from '../src/lib/roomIsolation';
import { automaticEnclosurePort, dimensionsForDevicePorts, supportsAutomaticCablePorts } from '../src/lib/devicePorts';
import { DEFAULT_DEVICE_TYPES } from '../src/catalog';
import { analyzeLightingNetwork } from '../src/lib/lightingNetwork';
import { createDefaultProject } from '../src/lib/project';
import { findRouteLayoutIssues } from '../src/lib/routeLayout';

const blueprint = (patch: Partial<FloorBlueprint> = {}): FloorBlueprint => ({ dataUrl: 'data:image/png;base64,AA==', fileName: 'plan.png', naturalWidth: 1000, naturalHeight: 800, scaleMmPerPixel: 10, offsetXmm: 0, offsetZmm: 0, rotationDeg: 0, opacity: .4, visible: true, ...patch });
const equipment = (patch: Partial<Device> = {}) => ({ id: 'device', typeId: 'rack', name: 'Rack', categoryId: 'networking', serviceCategory: 'data', manufacturer: '', model: '', description: '', floorId: 'floor', associationType: 'floor', position: { x: 1000, y: 100, z: 0 }, heightFromFloorMm: 100, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 200, height: 200, depth: 200 }, mounting: 'surface', backFace: 'bottom', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false, ...patch }) as Device;

describe('infrastructure planning extensions', () => {
  it('proposes one coordinated reroute when one run makes several neighbours detour', () => {
    const project = createDefaultProject('Route layout test'); const floor = project.floors[0]; project.preferences.avoidRouteOverlaps = false;
    const device = (id: string, x: number, z: number) => equipment({ id, typeId: 'light-point', name: id, categoryId: 'electrical', serviceCategory: 'electrical', floorId: floor.id, associationType: 'ceiling', position: { x, y: 2600, z } });
    project.devices = [device('block-a', 0, 0), device('block-b', 3000, 0), device('north-a', 900, -1200), device('north-b', 900, 1200), device('south-a', 2100, -1200), device('south-b', 2100, 1200)];
    const route = (id: string, sourceDeviceId: string, destinationDeviceId: string, points: Array<[number, number, number]>): Route => ({
      id, kind: 'cable', name: id, serviceCategory: 'electrical', subtype: 'cable', standard: '', manufacturer: '', productCode: '', floorId: floor.id, roomIds: [], wallIds: [], sourceDeviceId, destinationDeviceId,
      points: points.map(([x,y,z], order) => ({ id: `${id}-${order}`, order, x, y, z })), installationMethod: 'concealed', physicalIdentification: '', labelAtSource: '', labelAtDestination: '', installationStatus: 'planned', testStatus: 'not tested', flowDirection: 'source-to-destination', notes: '', customProperties: [], locked: false, hidden: false
    });
    project.routes = [
      route('blocking-route', 'block-a', 'block-b', [[0,2600,0],[3000,2600,0]]),
      route('detour-one', 'north-a', 'north-b', [[900,2600,-1200],[900,2600,-180],[1080,2600,-180],[1080,2600,180],[900,2600,180],[900,2600,1200]]),
      route('detour-two', 'south-a', 'south-b', [[2100,2600,-1200],[2100,2600,-180],[2280,2600,-180],[2280,2600,180],[2100,2600,180],[2100,2600,1200]])
    ];
    const currentTurns = project.routes.reduce((total, item) => total + routeTurnCount(item), 0); const issues = findRouteLayoutIssues(project);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].affectedRouteIds.length).toBeGreaterThanOrEqual(2);
    expect(issues[0].proposed.turns).toBeLessThan(currentTurns);
    expect(issues[0].proposed.conflicts).toBeLessThanOrEqual(issues[0].current.conflicts);
  });
  it('gives every technical device type at least one configurable connection point', () => {
    const missing = DEFAULT_DEVICE_TYPES.filter((type) => type.family === 'device' && type.defaultPorts.length === 0).map((type) => type.id);
    expect(missing).toEqual([]);
    const junction = DEFAULT_DEVICE_TYPES.find((type) => type.id === 'junction-box')!;
    expect(junction.defaultPorts.every((port) => Math.abs(port.position.x) < junction.defaultDimensions.width / 2 && Math.abs(port.position.y) < junction.defaultDimensions.height / 2 && Math.abs(port.position.z) < junction.defaultDimensions.depth / 2)).toBe(true);
    expect(DEFAULT_DEVICE_TYPES.some((type) => type.id === 'appliance-connection')).toBe(true);
    expect(DEFAULT_DEVICE_TYPES.some((type) => type.id === 'custom-electrical')).toBe(false);
    const heatPump = DEFAULT_DEVICE_TYPES.find((type) => type.id === 'heat-pump')!; const indoorUnit = DEFAULT_DEVICE_TYPES.find((type) => type.id === 'indoor-unit')!;
    expect(heatPump.defaultPorts.filter((port) => port.serviceCategory === 'hvac')).toHaveLength(10);
    expect(heatPump.defaultPorts.filter((port) => port.serviceCategory === 'electrical')).toHaveLength(2);
    expect(heatPump.defaultPorts.find((port) => port.name === 'Control / communication')?.required).toBe(false);
    expect(indoorUnit.defaultPorts.filter((port) => port.serviceCategory === 'hvac')).toHaveLength(2);
    expect(indoorUnit.defaultPorts.filter((port) => port.serviceCategory === 'electrical')).toHaveLength(2);
  });
  it('keeps blueprint origin and cross-floor registration mathematically consistent', () => {
    expect(blueprintPixelToWorld(blueprint(), { x: 0, z: 0 })).toEqual({ x: -5000, z: -4000 });
    expect(blueprintPixelToWorld(blueprint(), { x: 1000, z: 800 })).toEqual({ x: 5000, z: 4000 });
    const plan = blueprint({ offsetXmm: 1500, offsetZmm: -700, rotationDeg: 20 }); const pixel = { x: 320, z: 610 }; const world = blueprintPixelToWorld(plan, pixel); const restored = worldToBlueprintPixel(plan, world);
    expect(restored.x).toBeCloseTo(pixel.x, 1); expect(restored.z).toBeCloseTo(pixel.z, 1);
    const reference = blueprint({ offsetXmm: 3000, offsetZmm: 1200, alignmentPointPx: { x: 400, z: 300 } }); const aligned = alignBlueprintToReference({ ...plan, alignmentPointPx: pixel }, reference);
    expect(blueprintPixelToWorld(aligned, pixel)).toEqual(blueprintPixelToWorld(reference, reference.alignmentPointPx!));
    const anchorBefore = blueprintPixelToWorld(plan, pixel); const northSet = setBlueprintNorthArrow({ ...plan, alignmentPointPx: pixel }, [{ x: 500, z: 700 }, { x: 500, z: 100 }]);
    expect(northSet.rotationDeg).toBeCloseTo(0, 5); expect(blueprintPixelToWorld(northSet, pixel)).toEqual(anchorBefore);
    const rescaled = updateBlueprintTransformPreservingAlignment({ ...plan, alignmentPointPx: pixel }, { scaleMmPerPixel: 6.25 });
    const rotated = updateBlueprintTransformPreservingAlignment(rescaled, { rotationDeg: -37.5 });
    expect(blueprintPixelToWorld(rescaled, pixel)).toEqual(anchorBefore);
    expect(blueprintPixelToWorld(rotated, pixel)).toEqual(anchorBefore);
  });

  it('limits isolated-room routes to one metre beyond the room boundary', () => {
    const boundary = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 2000 }, { x: 0, z: 2000 }];
    const fragments = clipRouteToRoom([{ x: -2000, y: 300, z: 1000 }, { x: 4000, y: 300, z: 1000 }], boundary, 1000, 0);
    expect(fragments).toHaveLength(1); expect(fragments[0][0]).toMatchObject({ x: -1000, y: 300, z: 1000 }); expect(fragments[0].at(-1)).toMatchObject({ x: 3000, y: 300, z: 1000 });
    expect(clipRouteToRoom([{ x: -2000, y: 300, z: -500 }, { x: 4000, y: 300, z: -500 }], boundary, 1000, 0)).toEqual([]);
  });

  it('detours floor routes and wall routes around the 10 cm device envelope', () => {
    const device = equipment(); const obstacle = { minX: 800, maxX: 1200, minZ: -200, maxZ: 200 };
    const plane = preferredOrthogonalPlaneRoute({ x: 0, y: 100, z: 0 }, { x: 2000, y: 100, z: 0 }, 100, [], [obstacle]);
    expect(plane.length).toBeGreaterThan(2); expect(routePointsKeepDeviceClearance(plane, [device], [], 100)).toBe(true);
    expect(routePointsKeepDeviceClearance([{ x: 0, y: 100, z: 0 }, { x: 2000, y: 100, z: 0 }], [device], [], 100)).toBe(false);
    const wall: Wall = { id: 'wall', floorId: 'floor', name: 'Wall', start: { x: 0, z: 0 }, end: { x: 3000, z: 0 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false };
    const wallDevice = equipment({ wallId: wall.id, associationType: 'wall', distanceAlongWallMm: 1500, position: { x: 1500, y: 500, z: 0 } });
    const wallPath = routeSegmentDetourDevices(wall, { x: 0, y: 500, z: 0 }, { x: 3000, y: 500, z: 0 }, [wallDevice], 100);
    expect(wallPath.length).toBeGreaterThan(2); expect(routePointsKeepDeviceClearance(wallPath, [wallDevice], [], 100)).toBe(true);
  });

  it('allows only the terminal approach when an adjacent device overlaps the destination clearance zone', () => {
    const adjacent = equipment({ id: 'adjacent', position: { x: 2050, y: 100, z: 0 }, dimensions: { width: 100, height: 100, depth: 100 } });
    const terminalApproach = [{ x: 0, y: 100, z: 0 }, { x: 1800, y: 100, z: 250 }, { x: 1950, y: 100, z: 100 }, { x: 2000, y: 100, z: 0 }];
    expect(routePointsKeepDeviceClearance(terminalApproach, [adjacent], [], 100)).toBe(true);
    const middleCrossing = [{ x: 0, y: 100, z: 0 }, { x: 2000, y: 100, z: 0 }, { x: 4000, y: 100, z: 0 }];
    expect(routePointsKeepDeviceClearance(middleCrossing, [equipment({ id: 'middle', position: { x: 2000, y: 100, z: 0 } })], [], 100)).toBe(false);
  });

  it('does not overshoot and reverse around an adjacent device that contains the destination terminal', () => {
    const wall: Wall = { id: 'terminal-wall', floorId: 'floor', name: 'Terminal wall', start: { x: 0, z: 0 }, end: { x: 3000, z: 0 }, heightMm: 2700, thicknessMm: 150, structuralThicknessMm: 150, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false };
    const adjacent = equipment({ id: 'adjacent', wallId: wall.id, associationType: 'wall', distanceAlongWallMm: 2050, position: { x: 2050, y: 1400, z: 0 }, dimensions: { width: 86, height: 86, depth: 30 } });
    const start = { x: 1000, y: 500, z: 0 }; const destination = { x: 2000, y: 1400, z: 0 };
    const path = routeSegmentDetourDevices(wall, start, destination, [adjacent], 100, [], [destination]);
    expect(path).toEqual([start, destination]);
  });

  it('expands a riser as route lanes are added and audits reversed flow immediately', () => {
    expect(riserRouteSlots(5)).toHaveLength(5); expect(effectiveRiserDiameterMm(180, 1)).toBe(180); expect(effectiveRiserDiameterMm(180, 20)).toBeGreaterThan(180);
    const route = (id: string, source: string, destination: string, flowDirection: Route['flowDirection']) => ({ id, serviceCategory: 'electrical', sourceDeviceId: source, destinationDeviceId: destination, flowDirection }) as Route;
    const routes = [route('a', 'source', 'riser', 'source-to-destination'), route('b', 'riser', 'destination', 'source-to-destination')];
    expect(transitionFlowAudit(routes, 'riser')[0]).toMatchObject({ incoming: 1, outgoing: 1, undirected: 0 });
    routes[1] = route('b', 'riser', 'destination', 'destination-to-source');
    expect(transitionFlowAudit(routes, 'riser')[0]).toMatchObject({ incoming: 2, outgoing: 0 });
  });

  it('pairs cross-floor route records into one physical riser lane', () => {
    const route = (id: string, floorId: string, source: string, destination: string) => ({ id, kind: 'cable', floorId, serviceCategory: 'electrical', sourceDeviceId: source, destinationDeviceId: destination, flowDirection: 'source-to-destination' }) as Route;
    const routes = [route('lower', 'ground', 'panel', 'riser'), route('upper', 'first', 'riser', 'outlet'), route('unpaired', 'first', 'riser', 'light')];
    const links = [{ id: 'link', routeAId: 'lower', routeBId: 'upper' }];
    expect(riserRouteGroups(routes, 'riser', links).map((group) => group.map((item) => item.id))).toEqual([['lower','upper'],['unpaired']]);
    expect(transitionContinuityAudit(routes, 'riser', links).unpairedRoutes.map((item) => item.id)).toEqual(['unpaired']);
    expect(effectiveRiserDiameterMm(180, riserRouteGroups(routes, 'riser', links).length)).toBe(180);
  });

  it('reports unpaired risers and technical devices without route attachments', () => {
    const project = { deviceTypes: [{ id: 'floor-transition', family: 'transition' }, { id: 'sensor', family: 'device' }], devices: [equipment({ id: 'riser', typeId: 'floor-transition' }), equipment({ id: 'orphan', typeId: 'sensor' })], routes: [{ id: 'route', kind: 'cable', floorId: 'ground', serviceCategory: 'electrical', sourceDeviceId: 'source', destinationDeviceId: 'riser', flowDirection: 'source-to-destination' }] } as unknown as ProjectSnapshot;
    expect(findRiserDiagnostics(project)[0]).toMatchObject({ device: { id: 'riser' }, unpairedRouteIds: ['route'] });
    expect(findUnconnectedDevices(project).map((item) => item.id)).toEqual(['orphan']);
  });

  it('audits junction correspondence and expands unlimited-port enclosures', () => {
    const panel = equipment({ id: 'panel', typeId: 'electrical-panel', serviceCategory: 'electrical', junctionRouteGroups: [{ id: 'circuit', name: 'Circuit 1', incomingRouteIds: ['in'], outgoingRouteIds: ['out-a','out-b'] }] });
    const route = (id: string, sourceDeviceId: string, destinationDeviceId: string) => ({ id, kind: 'cable', floorId: 'floor', name: id, serviceCategory: 'electrical', sourceDeviceId, destinationDeviceId, flowDirection: 'source-to-destination', points: [] }) as unknown as Route;
    const project = { devices: [panel], routes: [route('in', 'supply', 'panel'), route('out-a', 'panel', 'load-a'), route('out-b', 'panel', 'load-b')] } as unknown as ProjectSnapshot;
    expect(findJunctionDiagnostics(project)).toHaveLength(0);
    expect(findJunctionDiagnostics({ ...project, devices: [{ ...panel, junctionRouteGroups: [] }] })[0].unassignedRouteIds).toEqual(['in','out-a','out-b']);
    const ports = Array.from({ length: 16 }, (_, index) => ({ id: String(index), deviceId: panel.id, spaceRequiredMm: 60 })) as Device['ports'];
    const grown = dimensionsForDevicePorts({ ...panel, dimensions: { width: 120, height: 120, depth: 70 }, ports }, { id: 'electrical-panel', unlimitedPorts: true, defaultPortSpaceMm: 45, defaultDimensions: { width: 120, height: 120, depth: 70 } } as ProjectSnapshot['deviceTypes'][number]);
    expect(grown.width).toBeGreaterThan(120); expect(grown.height).toBeGreaterThan(120);
  });

  it('derives switch-to-light control through explicit junction correspondence', () => {
    const lightSwitch = equipment({ id: 'switch', typeId: 'switch', name: 'Switch 1', serviceCategory: 'electrical' });
    const light = equipment({ id: 'light', typeId: 'light-point', name: 'Light 1', serviceCategory: 'lighting' });
    const junction = equipment({ id: 'junction', typeId: 'junction-box', name: 'Junction 1', serviceCategory: 'electrical', junctionRouteGroups: [{ id: 'group', name: 'Lighting circuit', incomingRouteIds: ['switch-cable'], outgoingRouteIds: ['light-cable'] }] });
    const route = (id: string, sourceDeviceId: string, destinationDeviceId: string) => ({ id, kind: 'cable', floorId: 'floor', name: id, serviceCategory: 'electrical', sourceDeviceId, destinationDeviceId, flowDirection: 'source-to-destination', points: [] }) as unknown as Route;
    const project = { devices: [lightSwitch, light, junction], routes: [route('switch-cable', 'switch', 'junction'), route('light-cable', 'junction', 'light')] } as unknown as ProjectSnapshot;
    const analysis = analyzeLightingNetwork(project);
    expect(analysis.controlsByLight.light).toEqual(['switch']);
    expect(analysis.routeIds.sort()).toEqual(['light-cable', 'switch-cable']);
    expect(analysis.issues).toEqual([]);
    const broken = analyzeLightingNetwork({ ...project, devices: [lightSwitch, light, { ...junction, junctionRouteGroups: [] }] });
    expect(broken.controlsByLight.light).toEqual([]);
    expect(broken.issues.some((item) => item.kind === 'junction')).toBe(true);
  });

  it('automatically adds directional cable ports inside expandable junctions', () => {
    const type = DEFAULT_DEVICE_TYPES.find((item) => item.id === 'junction-box')!;
    const panelType = DEFAULT_DEVICE_TYPES.find((item) => item.id === 'electrical-panel')!;
    const junction = equipment({ id: 'junction', typeId: type.id, serviceCategory: 'electrical', dimensions: { ...type.defaultDimensions }, ports: structuredClone(type.defaultPorts).map((port, index) => ({ ...port, id: `existing-${index}`, deviceId: 'junction' })) });
    expect(supportsAutomaticCablePorts(type, 'cable')).toBe(true);
    expect(supportsAutomaticCablePorts(panelType, 'cable')).toBe(true);
    expect(supportsAutomaticCablePorts(type, 'pipe')).toBe(false);
    const port = automaticEnclosurePort(junction, type, 'security', 'input');
    const grown = dimensionsForDevicePorts(junction, type, [...junction.ports, port]);
    expect(port).toMatchObject({ deviceId: junction.id, serviceCategory: 'security', direction: 'input', face: 'back', connectorType: 'terminal' });
    expect(Math.abs(port.position.x)).toBeLessThan(grown.width / 2);
    expect(Math.abs(port.position.y)).toBeLessThan(grown.height / 2);
    expect(Math.abs(port.position.z)).toBeLessThan(grown.depth / 2);
  });

  it('flags cable runs only after the 10 m target plus 1 m tolerance', () => {
    const cable = (id: string, length: number, kind: Route['kind'] = 'cable') => ({ id, kind, points: [{ x: 0, y: 0, z: 0 }, { x: length, y: 0, z: 0 }] }) as Route;
    const project = { routes: [cable('within', 10_999), cable('long', 11_001), cable('pipe', 20_000, 'pipe')] } as ProjectSnapshot;
    expect(findOverlengthCables(project).map((route) => route.id)).toEqual(['long']);
  });

  it('requires an occupied device port to be reassigned before reuse', () => {
    const first = { id: 'first', deviceId: 'rack', name: 'LAN 1', serviceCategory: 'data', direction: 'bidirectional', connectorType: 'RJ45' } as Device['ports'][number]; const second = { ...first, id: 'second', name: 'LAN 2' };
    const rack = equipment({ id: 'rack', ports: [first, second] }); const route = { id: 'route', serviceCategory: 'data', sourceDeviceId: 'rack', sourcePortId: 'first' } as Route;
    expect(portDirectionFits(first, 'source')).toBe(true); expect(portDirectionFits({ ...first, direction: 'input' }, 'source')).toBe(false); expect(portDirectionFits({ ...first, direction: 'input' }, 'destination')).toBe(true);
    expect(routesUsingDevicePort([route], 'rack', 'first')).toHaveLength(1); expect(replacementPorts(rack, [route], 'first', 'data', 'source').map((port) => port.id)).toEqual(['second']);
    expect(reassignRouteDevicePort(route, 'rack', 'source', 'second').sourcePortId).toBe('second');
  });

  it('accepts any first-port direction and requires a coherent second endpoint', () => {
    const input = { serviceCategory: 'electrical', direction: 'input' } as Device['ports'][number];
    const output = { ...input, direction: 'output' } as Device['ports'][number];
    const bidirectional = { ...input, direction: 'bidirectional' } as Device['ports'][number];
    expect(routeCreationPortFits(input, 'electrical')).toBe(true);
    expect(routeCreationPortFits({ ...input, serviceCategory: 'generic' }, 'electrical')).toBe(true);
    expect(routeCreationPortFits({ ...input, serviceCategory: 'plumbing' }, 'electrical')).toBe(false);
    expect(routeCreationPortFits(input, 'electrical', output)).toBe(true);
    expect(routeCreationPortFits(output, 'electrical', output)).toBe(false);
    expect(routeCreationPortFits(bidirectional, 'electrical', output)).toBe(true);
    expect(routeEndpointDirectionsCoherent(input, output)).toBe(true);
    expect(routeEndpointDirectionsCoherent(input, input)).toBe(false);
    expect(routeFlowFromEndpointPorts(output, input)).toBe('source-to-destination');
    expect(routeFlowFromEndpointPorts(input, output)).toBe('destination-to-source');
    expect(routeFlowFromEndpointPorts(bidirectional, bidirectional)).toBe('bidirectional');
  });

  it('snaps wall drawing to any projected point along a wall', () => {
    const wall = { id: 'wall', floorId: 'floor', name: 'Wall', start: { x: 0, z: 0 }, end: { x: 4000, z: 0 }, heightMm: 2700, thicknessMm: 120 } as Wall;
    expect(nearestWallPoint({ x: 2037, z: 80 }, [wall], 100)).toEqual({ x: 2037, z: 0 });
    expect(nearestWallPoint({ x: 2037, z: 181 }, [wall], 100)).toBeUndefined();
    const branch = { ...wall, id: 'branch', start: { x: 2000, z: 0 }, end: { x: 2000, z: 3000 }, thicknessMm: 200 };
    expect(wallRenderEndExtensions(branch, [wall, branch])).toEqual({ startMm: -60, endMm: 0 });
    expect(wallRenderEndExtensions(wall, [wall, branch])).toEqual({ startMm: 0, endMm: 0 });
    const cornerA = { ...wall, id: 'a', end: { x: 4000, z: 0 }, thicknessMm: 120 };
    const cornerB = { ...wall, id: 'b', start: { x: 4000, z: 0 }, end: { x: 4000, z: 3000 }, thicknessMm: 200 };
    expect(wallRenderEndExtensions(cornerA, [cornerA, cornerB])).toEqual({ startMm: 0, endMm: 100 });
    expect(wallRenderEndExtensions(cornerB, [cornerA, cornerB])).toEqual({ startMm: -60, endMm: 0 });
    const crossingOwner = { ...wall, id: 'a-cross', start: { x: 0, z: 0 }, end: { x: 4000, z: 0 }, thicknessMm: 120 };
    const crossingSplit = { ...wall, id: 'b-cross', start: { x: 2000, z: -1500 }, end: { x: 2000, z: 1500 }, thicknessMm: 200, heightMm: 2500 };
    expect(wallRenderIntersectionCuts(crossingOwner, [crossingOwner, crossingSplit])).toEqual([]);
    expect(wallRenderIntersectionCuts(crossingSplit, [crossingOwner, crossingSplit])).toEqual([{ startMm: 1440, endMm: 1560, heightMm: 2500, otherWallId: 'a-cross' }]);
    const overlapping = { ...wall, id: 'c-overlap', start: { x: 2000, z: 0 }, end: { x: 6000, z: 0 } };
    expect(wallRenderIntersectionCuts(overlapping, [crossingOwner, overlapping])).toEqual([{ startMm: 0, endMm: 2000, heightMm: 2700, otherWallId: 'a-cross' }]);
  });

  it('numbers floors relative to the elevation-zero level', () => {
    const floors = [{ id: 'upper', elevationMm: 3000, sortOrder: 2 }, { id: 'basement', elevationMm: -2800, sortOrder: 0 }, { id: 'ground', elevationMm: 0, sortOrder: 1 }] as Floor[];
    expect(numberedFloors(floors).map(({ floor, number }) => [floor.id, number])).toEqual([['basement', -1], ['ground', 0], ['upper', 1]]);
  });

  it('creates and normalizes the prepared editable rack layout', () => {
    const rack = createDefaultRackConfiguration(); expect(rack.totalUnits).toBe(22); expect(rack.modules.map((module) => module.name)).toEqual(expect.arrayContaining(['UPS','PDU','NVR','48-port switch','24-port switch','48-port patch panel','24-port patch panel','Empty / cable space','NAS','Router','Mini PC'])); expect(rackUsedUnits(rack)).toBe(15);
    const switch48 = rack.modules.find((module) => module.name === '48-port switch')!; expect(switch48.ports).toHaveLength(48); expect(switch48.ports.filter((port) => port.connectorType === 'RJ45')).toHaveLength(48); expect(new Set(switch48.ports.map((port) => port.row))).toEqual(new Set([1,2])); expect(switch48.ports.filter((port) => port.row === 1)).toHaveLength(24); expect(switch48.ports.filter((port) => port.row === 2)).toHaveLength(24);
    const prepared = createDefaultRackSystem('rack-1'); const patches = prepared.configuration.modules.filter((module) => module.kind === 'patch-panel'); expect(patches.map((item) => item.name)).toEqual(['48-port patch panel','24-port patch panel']); expect(patches.map((item) => item.ports.filter((port) => port.face === 'front').length)).toEqual([48,24]); expect(patches.map((item) => item.ports.filter((port) => port.face === 'back').length)).toEqual([48,24]); expect(prepared.externalPorts).toHaveLength(72); expect(patches.every((item) => item.ports.filter((port) => port.face === 'back').every((port) => !!port.externalPortId && !!port.pairedPortId))).toBe(true);
    const shelf = rack.modules.filter((module) => module.shelfGroupId); expect(new Set(shelf.map((module) => module.startUnit))).toEqual(new Set([5])); expect(new Set(shelf.map((module) => module.heightUnits))).toEqual(new Set([5]));
    const reversed = normalizeRackModules({ ...rack, modules: [...rack.modules].reverse() }); expect(reversed.modules[0].startUnit).toBe(1); expect(rackUsedUnits(reversed)).toBe(15); expect(reversed.modules.some((module) => module.ports.some((port) => port.connectorType === 'RJ45'))).toBe(true);
    const legacy = { totalUnits: 18, modules: rack.modules.filter((module) => !['48-port patch panel','24-port patch panel','Empty / cable space'].includes(module.name)).map((module) => ({ ...module, shelfGroupId: undefined, shelfSlot: undefined, shelfSlotCount: undefined, startUnit: module.name === 'NAS' ? 7 : module.name === 'Router' ? 9 : module.name === 'Mini PC' ? 10 : module.startUnit, heightUnits: module.name === 'NAS' ? 2 : 1 })) }; const upgraded = upgradeLegacyPreparedRack(legacy, 'rack-legacy', []); expect(upgraded.configuration.modules.filter((module) => module.kind === 'patch-panel')).toHaveLength(2); expect(upgraded.externalPorts).toHaveLength(72);
  });
});
