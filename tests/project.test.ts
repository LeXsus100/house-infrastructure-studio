import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '../shared/types';
import { alignFloorBlueprints, commitHistory, createDefaultProject, createHistory, normalizeConcealedRouteSurfaces, parseProjectBackup, redoHistory, removeDevicesAndConnectedRoutes, serializeProject, startingFloorId, undoHistory, upgradeProject } from '../src/lib/project';
import { formatRouteName } from '../src/lib/routeNaming';
import { blueprintPixelToWorld } from '../src/lib/blueprint';
import { distance3, resolveRouteConflicts, routeSegmentsOnWall } from '../src/lib/geometry';

describe('project serialization and history', () => {
  it('round-trips a validated project backup', () => {
    const project = createDefaultProject();
    const restored = parseProjectBackup(serializeProject(project));
    expect(restored.id).toBe(project.id);
    expect(restored.title).toBe('Untitled house project');
    expect(restored.deviceTypes.length).toBeGreaterThan(40);
    expect(restored.preferences.ceilingRouteOffsetMm).toBe(-50);
    expect(restored.preferences.floorRouteOffsetMm).toBe(-150);
    expect(restored.preferences.routeVerticalOrder).toEqual(['pipe', 'cable', 'duct']);
    expect(restored.preferences.motionMode).toBe('animated');
    expect(restored.preferences.preferSharedCorridors).toBe(true);
    expect(restored.preferences.routeDiameterMm).toMatchObject({ electrical: 16, data: 8, hvac: 160, plumbing: 25 });
    expect(restored.categories.find((item) => item.serviceCategory === 'electrical')?.color).toBe('#e97824');
    expect(restored.deviceTypes.every((type) => Boolean(type.defaultDisplayColor))).toBe(true);
  });

  it('rejects malformed imports before persistence', () => {
    expect(() => parseProjectBackup(JSON.stringify({ format: 'wrong', version: 1, project: {} }))).toThrow(/Unsupported/);
  });

  it('allows a separate local project to keep its own title', () => {
    const project = createDefaultProject('Casa laboratorio');
    expect(upgradeProject(project).title).toBe('Casa laboratorio');
  });

  it('upgrades incomplete built-in mechanical ports once and keeps later user edits', () => {
    const project = createDefaultProject(); const connection = (name: string, serviceCategory: 'hvac' | 'electrical') => ({ name, portType: serviceCategory, direction: 'input' as const, serviceCategory, connectorType: '', notes: '', position: { x: 0, y: 0, z: 0 }, face: 'back' as const, required: true });
    const heatPump = project.deviceTypes.find((type) => type.id === 'heat-pump')!; heatPump.builtInRevision = undefined; heatPump.defaultPorts = Array.from({ length: 5 }, () => connection('hvac connection', 'hvac'));
    const indoor = project.deviceTypes.find((type) => type.id === 'indoor-unit')!; indoor.builtInRevision = undefined; indoor.defaultPorts = [connection('electrical connection', 'electrical'), connection('hvac connection', 'hvac')];
    const outdoor = project.deviceTypes.find((type) => type.id === 'outdoor-unit')!; outdoor.builtInRevision = undefined; outdoor.defaultPorts = [connection('Electrical supply', 'electrical'), connection('Refrigerant / flow', 'hvac')];
    const rack = project.deviceTypes.find((type) => type.id === 'rack')!; rack.builtInRevision = undefined; rack.defaultAssociation = 'wall'; rack.defaultBackFace = 'back';
    const upgraded = upgradeProject(project); const upgradedHeatPump = upgraded.deviceTypes.find((type) => type.id === 'heat-pump')!;
    expect(upgradedHeatPump.defaultPorts.filter((port) => port.serviceCategory === 'hvac')).toHaveLength(10); expect(upgradedHeatPump.defaultPorts.filter((port) => port.serviceCategory === 'electrical')).toHaveLength(2);
    expect(upgraded.deviceTypes.find((type) => type.id === 'indoor-unit')?.defaultPorts).toHaveLength(4); expect(upgraded.deviceTypes.find((type) => type.id === 'outdoor-unit')?.defaultPorts).toHaveLength(4);
    expect(upgraded.deviceTypes.find((type) => type.id === 'rack')).toMatchObject({ defaultAssociation: 'floor', defaultBackFace: 'bottom', builtInRevision: 1 });
    upgradedHeatPump.defaultPorts[0] = { ...upgradedHeatPump.defaultPorts[0], name: 'User edited inlet' }; expect(upgradeProject(upgraded).deviceTypes.find((type) => type.id === 'heat-pump')?.defaultPorts[0].name).toBe('User edited inlet');
  });

  it('migrates the redundant custom electrical catalogue type to appliance connection', () => {
    const project = createDefaultProject(); const appliance = project.deviceTypes.find((type) => type.id === 'appliance-connection')!;
    project.deviceTypes.push({ ...structuredClone(appliance), id: 'custom-electrical', name: 'Custom electrical device' });
    project.devices.push({ id: 'legacy-electrical', typeId: 'custom-electrical', name: 'Legacy electrical device', categoryId: 'electrical', serviceCategory: 'electrical', manufacturer: '', model: '', description: '', floorId: project.floors[0].id, associationType: 'floor', position: { x: 0, y: 50, z: 0 }, heightFromFloorMm: 50, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 100, height: 100, depth: 40 }, mounting: 'surface', backFace: 'bottom', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false });
    const upgraded = upgradeProject(project);
    expect(upgraded.deviceTypes.some((type) => type.id === 'custom-electrical')).toBe(false);
    expect(upgraded.devices.find((device) => device.id === 'legacy-electrical')?.typeId).toBe('appliance-connection');
  });

  it('opens projects on the floor nearest elevation zero', () => {
    const project = createDefaultProject();
    project.floors = [
      { ...project.floors[0], id: 'basement', elevationMm: -2800, sortOrder: 0 },
      { ...project.floors[0], id: 'upper', elevationMm: 3000, sortOrder: 2 },
      { ...project.floors[0], id: 'zero', elevationMm: 0, sortOrder: 1 }
    ];
    expect(startingFloorId(project)).toBe('zero');
  });

  it('repairs floor blueprint registration around the elevation-zero reference', () => {
    const project = createDefaultProject();
    const baseBlueprint = { dataUrl: 'data:image/png;base64,AA==', fileName: 'ground.png', naturalWidth: 448, naturalHeight: 1090, scaleMmPerPixel: 18.018, offsetXmm: 0, offsetZmm: 0, rotationDeg: 0, opacity: .4, visible: true, alignmentPointPx: { x: 14, z: 1013 } };
    project.floors[0].blueprint = baseBlueprint;
    project.floors.push({ ...project.floors[0], id: 'upper', name: 'Upper', elevationMm: 3000, sortOrder: 1, blueprint: { ...baseBlueprint, fileName: 'upper.png', naturalHeight: 629, scaleMmPerPixel: 21.489, alignmentPointPx: { x: 15, z: 616 } } });
    const aligned = alignFloorBlueprints(project.floors);
    const ground = aligned[0].blueprint!; const upper = aligned[1].blueprint!;
    expect(blueprintPixelToWorld(upper, upper.alignmentPointPx!)).toEqual(blueprintPixelToWorld(ground, ground.alignmentPointPx!));
    const upgraded = upgradeProject(project);
    expect(blueprintPixelToWorld(upgraded.floors[1].blueprint!, upgraded.floors[1].blueprint!.alignmentPointPx!)).toEqual(blueprintPixelToWorld(upgraded.floors[0].blueprint!, upgraded.floors[0].blueprint!.alignmentPointPx!));
  });

  it('adds new structural and floor-transition catalogue entries to existing projects', () => {
    const project = createDefaultProject(); project.categories = project.categories.filter((item) => !['structural', 'transitions'].includes(item.id)); project.deviceTypes = project.deviceTypes.filter((item) => !['door-opening', 'floor-transition', 'furniture-washer'].includes(item.id));
    project.categories.push({ id: 'wifi', name: 'Wi-Fi', serviceCategory: 'wifi', pattern: 'wave', color: '#8b5cf6' });
    const accessPoint = project.deviceTypes.find((item) => item.id === 'access-point')!; accessPoint.categoryId = 'wifi'; accessPoint.serviceCategory = 'wifi';
    const camera = project.deviceTypes.find((item) => item.id === 'security-camera')!; camera.categoryId = 'cctv'; camera.serviceCategory = 'cctv';
    const light = project.deviceTypes.find((item) => item.id === 'light-point')!; light.categoryId = 'lighting'; light.serviceCategory = 'lighting';
    const column = project.deviceTypes.find((item) => item.id === 'column')!; column.family = 'device';
    const upgraded = upgradeProject(project);
    expect(upgraded.categories.some((item) => item.id === 'structural')).toBe(true); expect(upgraded.categories.some((item) => item.id === 'transitions')).toBe(true);
    expect(upgraded.deviceTypes.some((item) => item.id === 'door-opening')).toBe(true); expect(upgraded.deviceTypes.some((item) => item.id === 'floor-transition')).toBe(true);
    expect(upgraded.deviceTypes.some((item) => item.id === 'furniture-washer')).toBe(true);
    expect(upgraded.deviceTypes.find((item) => item.id === 'column')?.family).toBe('structure');
    expect(upgraded.deviceTypes.find((item) => item.id === 'solar-panel')).toMatchObject({ shape: 'solar-panel', defaultBackFace: 'bottom', defaultDimensions: { height: 900 } });
    expect(upgraded.categories.some((item) => ['lighting', 'wifi', 'cctv'].includes(item.id))).toBe(false);
    expect(upgraded.deviceTypes.find((item) => item.id === 'access-point')).toMatchObject({ categoryId: 'networking', serviceCategory: 'data' });
    expect(upgraded.deviceTypes.find((item) => item.id === 'security-camera')).toMatchObject({ categoryId: 'security', serviceCategory: 'security' });
    expect(upgraded.deviceTypes.find((item) => item.id === 'light-point')).toMatchObject({ categoryId: 'electrical', serviceCategory: 'electrical' });
    expect(upgraded.preferences.newWallThicknessMm).toBe(120);
  });

  it('moves only legacy junction-box terminations inside the enclosure', () => {
    const project = createDefaultProject();
    const junctionType = project.deviceTypes.find((item) => item.id === 'junction-box')!;
    junctionType.defaultPorts = junctionType.defaultPorts.map((port, index) => ({ ...port, face: index ? 'right' : 'left', position: { x: index ? 60 : -60, y: 0, z: 0 } }));
    const customPort = { ...junctionType.defaultPorts[0], name: 'Custom terminal', face: 'front' as const, position: { x: 10, y: 12, z: 35 } };
    junctionType.defaultPorts.push(customPort);
    const upgraded = upgradeProject(project).deviceTypes.find((item) => item.id === 'junction-box')!;
    expect(upgraded.defaultPorts.slice(0, 2).map((port) => ({ face: port.face, position: port.position }))).toEqual([
      { face: 'back', position: { x: -25, y: 0, z: -25 } },
      { face: 'back', position: { x: 25, y: 0, z: -25 } }
    ]);
    expect(upgraded.defaultPorts[2]).toMatchObject(customPort);
  });

  it('generates configurable floor-aware route identifiers', () => {
    const project = createDefaultProject(); const upperId = crypto.randomUUID(); project.floors.push({ id: upperId, name: 'First floor', sortOrder: 1, elevationMm: 3000, ceilingHeightMm: 2700 });
    expect(formatRouteName(project, 'security', 'cable', project.floors[0].id, 9)).toBe('S-GF-009');
    project.preferences.routeNamingPattern = '{KIND}-{PREFIX}-{FLOOR}-{SEQ:03}'; project.preferences.routeNamingPrefixes.security = 'SEC';
    expect(formatRouteName(project, 'security', 'cable', upperId, 12)).toBe('CABLE-SEC-F1-012');
  });

  it('repairs a wall-mounted device that was saved against the wrong floor', () => {
    const project = createDefaultProject(); const upperFloorId = crypto.randomUUID(); project.floors.push({ id: upperFloorId, name: 'First floor', sortOrder: 1, elevationMm: 3000, ceilingHeightMm: 2700 });
    project.walls.push({ id: 'upper-wall', floorId: upperFloorId, name: 'Upper wall', start: { x: 0, z: 0 }, end: { x: 4000, z: 0 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false });
    project.devices.push({ id: 'device', typeId: 'power-outlet', name: 'Upper outlet', categoryId: 'electrical', serviceCategory: 'electrical', manufacturer: '', model: '', description: '', floorId: project.floors[0].id, wallId: 'upper-wall', associationType: 'wall', position: { x: 1000, y: 300, z: 0 }, heightFromFloorMm: 300, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 80, height: 80, depth: 40 }, mounting: 'recessed', backFace: 'back', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false });
    expect(upgradeProject(project).devices[0].floorId).toBe(upperFloorId);
  });

  it('normalizes existing floor transitions into the inter-level gap', () => {
    const project = createDefaultProject(); const ground = project.floors[0]; const upperId = crypto.randomUUID(); project.floors.push({ id: upperId, name: 'First floor', sortOrder: 1, elevationMm: 3000, ceilingHeightMm: 2700 });
    project.devices.push({ id: 'transition', typeId: 'floor-transition', name: 'Riser', categoryId: 'transitions', serviceCategory: 'transitions', manufacturer: '', model: '', description: '', floorId: ground.id, associationType: 'floor', position: { x: 1000, y: 1500, z: 1000 }, heightFromFloorMm: 1500, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 180, height: 3000, depth: 180 }, mounting: 'surface', backFace: 'bottom', accessibleFloorIds: [ground.id, upperId], transitionToFloorId: upperId, powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [{ id: 'lower', deviceId: 'transition', name: ground.name, portType: 'vertical transition', direction: 'bidirectional', serviceCategory: 'custom', connectorType: 'sleeve', notes: '', position: { x: 0, y: -1500, z: 0 }, face: 'bottom', required: false }, { id: 'upper', deviceId: 'transition', name: 'First floor', portType: 'vertical transition', direction: 'bidirectional', serviceCategory: 'custom', connectorType: 'sleeve', notes: '', position: { x: 0, y: 1500, z: 0 }, face: 'top', required: false }], customProperties: [], showLabel: false, locked: false, hidden: false } as ProjectSnapshot['devices'][number]);
    const transition = upgradeProject(project).devices[0];
    expect(transition.position.y).toBe(2850); expect(transition.dimensions.height).toBe(200); expect(transition.ports.map((port) => port.position.y)).toEqual([-100, 100]);
  });

  it('extends staircases to the next floor and exposes their landing there', () => {
    const project = createDefaultProject(); const ground = project.floors[0]; const upperId = crypto.randomUUID(); project.floors.push({ id: upperId, name: 'First floor', sortOrder: 1, elevationMm: 3150, ceilingHeightMm: 2700 });
    project.devices.push({ id: 'stairs', typeId: 'staircase', name: 'Staircase 1', categoryId: 'structural', serviceCategory: 'structural', manufacturer: '', model: '', description: '', floorId: ground.id, associationType: 'floor', position: { x: 1500, y: 1350, z: 500 }, heightFromFloorMm: 1350, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 1000, height: 2700, depth: 3000 }, mounting: 'surface', backFace: 'bottom', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [{ key: 'Step count', value: '10' }, { key: 'Path', value: '[{"x":0,"z":0},{"x":3000,"z":0}]' }], showLabel: false, locked: false, hidden: false });
    const staircase = upgradeProject(project).devices.find((device) => device.id === 'stairs')!;
    expect(staircase.dimensions.height).toBe(3150); expect(staircase.position.y).toBe(1575); expect(staircase.accessibleFloorIds).toEqual([ground.id, upperId]);
    expect(Number(staircase.customProperties.find((item) => item.key === 'Step count')?.value)).toBeGreaterThanOrEqual(18);
  });

  it('repairs legacy riser routes that projected diagonally through open room volume', () => {
    const project = createDefaultProject(); const floor = project.floors[0];
    project.walls.push(
      { id: 'source-wall', floorId: floor.id, name: 'Source', start: { x: 0, z: 0 }, end: { x: 2000, z: 0 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false },
      { id: 'destination-wall', floorId: floor.id, name: 'Destination', start: { x: 2000, z: 0 }, end: { x: 2000, z: 2000 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false }
    );
    project.devices.push(...([
      { id: 'transition', typeId: 'floor-transition', name: 'Riser', floorId: floor.id, associationType: 'floor', position: { x: 0, y: 2750, z: 0 } },
      { id: 'rack', typeId: 'rack', name: 'Rack', floorId: floor.id, associationType: 'floor', position: { x: 1900, y: 600, z: 1900 } }
    ] as unknown as ProjectSnapshot['devices']));
    project.routes.push({ id: 'legacy-route', kind: 'cable', name: 'EL-GF-038', serviceCategory: 'electrical', floorId: floor.id, sourceDeviceId: 'transition', destinationDeviceId: 'rack', wallIds: [], points: [{ id: 'p1', order: 0, x: 0, y: 2750, z: 0 }, { id: 'p2', order: 1, x: 1900, y: 2750, z: 1900 }, { id: 'p3', order: 2, x: 1900, y: 600, z: 1900 }] } as unknown as ProjectSnapshot['routes'][number]);
    const repaired = upgradeProject(project).routes[0];
    expect(repaired.wallIds).toEqual([]);
    expect(repaired.points.slice(1).every((point, index) => Math.abs(point.x - repaired.points[index].x) <= 2 || Math.abs(point.z - repaired.points[index].z) <= 2)).toBe(true);
    expect(repaired.points).toEqual(expect.arrayContaining([expect.objectContaining({ x: 0, y: -150, z: 0 }), expect.objectContaining({ x: 1900, y: -150, z: 1900 })]));
    expect(repaired.points[0]).toMatchObject({ x: 0, y: 2750, z: 0 }); expect(repaired.points.at(-1)).toMatchObject({ x: 1900, y: 600, z: 1900 });
  });

  it('repairs concealed Ethernet spans that escaped into the room volume', () => {
    const project = createDefaultProject(); const floor = project.floors[0];
    project.walls.push(
      { id: 'source-wall', floorId: floor.id, name: 'Source', start: { x: 0, z: 0 }, end: { x: 0, z: 3000 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false },
      { id: 'destination-wall', floorId: floor.id, name: 'Destination', start: { x: 4000, z: 0 }, end: { x: 4000, z: 3000 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false }
    );
    project.devices.push(...([
      { id: 'access-point', typeId: 'access-point', name: 'Access point', categoryId: 'networking', serviceCategory: 'data', manufacturer: '', model: '', description: '', floorId: floor.id, wallId: 'source-wall', associationType: 'wall', position: { x: 60, y: 2400, z: 900 }, heightFromFloorMm: 2400, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 150, height: 103, depth: 36 }, mounting: 'surface', backFace: 'back', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false },
      { id: 'junction', typeId: 'junction-box', name: 'Junction box', categoryId: 'electrical', serviceCategory: 'electrical', manufacturer: '', model: '', description: '', floorId: floor.id, wallId: 'destination-wall', associationType: 'wall', position: { x: 3940, y: 400, z: 2100 }, heightFromFloorMm: 400, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 120, height: 120, depth: 70 }, mounting: 'recessed', backFace: 'back', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false }
    ] as unknown as ProjectSnapshot['devices']));
    project.routes.push({
      id: 'escaped-data', kind: 'cable', name: 'DA-GF-001', serviceCategory: 'data', floorId: floor.id,
      sourceDeviceId: 'access-point', destinationDeviceId: 'junction', wallIds: ['source-wall', 'destination-wall'], installationMethod: 'concealed',
      points: [
        { id: 'p1', order: 0, x: 60, y: 2400, z: 900 },
        { id: 'p2', order: 1, x: 80, y: 1200, z: 900 },
        { id: 'p3', order: 2, x: 3920, y: 1200, z: 2100 },
        { id: 'p4', order: 3, x: 3940, y: 400, z: 2100 }
      ]
    } as unknown as ProjectSnapshot['routes'][number]);

    const repaired = upgradeProject(project).routes.find((route) => route.id === 'escaped-data')!;
    expect(repaired.points[0]).toMatchObject({ x: 60, y: 2400, z: 900 });
    expect(repaired.points.at(-1)).toMatchObject({ x: 3940, y: 400, z: 2100 });
    expect(repaired.points.some((point) => point.y === 1200)).toBe(false);
    expect(repaired.points.filter((point) => point.y === 2750).length).toBeGreaterThanOrEqual(2);
    const ceilingRuns = repaired.points.slice(1).filter((point, index) => point.y === 2750 && repaired.points[index].y === 2750);
    expect(ceilingRuns.length).toBeGreaterThan(0);
    expect(repaired.points.slice(1).every((point, index) => point.x === repaired.points[index].x || point.y === repaired.points[index].y || point.z === repaired.points[index].z)).toBe(true);
  });

  it('applies ceiling containment to every concealed cable service', () => {
    for (const serviceCategory of ['electrical', 'data', 'security', 'sensors', 'automation'] as const) {
      const project = createDefaultProject(); const floor = project.floors[0];
      project.walls.push({ id: 'destination-wall', floorId: floor.id, name: 'Destination', start: { x: 4000, z: 0 }, end: { x: 4000, z: 3000 }, heightMm: 2700, thicknessMm: 120, structuralThicknessMm: 120, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false });
      project.devices.push(...([
        { id: 'ceiling-device', typeId: 'multi-detector', name: 'Ceiling endpoint', categoryId: 'sensors', serviceCategory, manufacturer: '', model: '', description: '', floorId: floor.id, associationType: 'ceiling', position: { x: 500, y: 2678, z: 700 }, heightFromFloorMm: 2678, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 120, height: 45, depth: 120 }, mounting: 'surface', backFace: 'top', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false },
        { id: 'wall-device', typeId: 'junction-box', name: 'Wall endpoint', categoryId: 'electrical', serviceCategory, manufacturer: '', model: '', description: '', floorId: floor.id, wallId: 'destination-wall', associationType: 'wall', position: { x: 3940, y: 400, z: 2100 }, heightFromFloorMm: 400, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 120, height: 120, depth: 70 }, mounting: 'recessed', backFace: 'back', powerRequirements: '', networkRequirements: '', notes: '', installationStatus: 'planned', ports: [], customProperties: [], showLabel: false, locked: false, hidden: false }
      ] as unknown as ProjectSnapshot['devices']));
      project.routes.push({
        id: `escaped-${serviceCategory}`, kind: 'cable', name: `${serviceCategory}-route`, serviceCategory, floorId: floor.id,
        sourceDeviceId: 'ceiling-device', destinationDeviceId: 'wall-device', wallIds: ['destination-wall'], installationMethod: 'concealed',
        points: [
          { id: 'p1', order: 0, x: 500, y: 2701, z: 700 },
          { id: 'p2', order: 1, x: 500, y: 350, z: 700 },
          { id: 'p3', order: 2, x: 3940, y: 350, z: 2100 },
          { id: 'p4', order: 3, x: 3940, y: 400, z: 2100 }
        ]
      } as unknown as ProjectSnapshot['routes'][number]);

      const upgraded = upgradeProject(project); const repaired = upgraded.routes.find((route) => route.id === `escaped-${serviceCategory}`)!;
      expect(repaired.points[0]).toMatchObject({ x: 500, y: 2701, z: 700 }); expect(repaired.points.at(-1)).toMatchObject({ x: 3940, y: 400, z: 2100 });
      expect(repaired.points.some((point) => point.y === 350)).toBe(false);
      expect(repaired.points.filter((point) => point.y === 2750).length, serviceCategory).toBeGreaterThanOrEqual(2);

      const obstacle = { id: 'ceiling-crossing', kind: 'cable', name: 'Crossing', serviceCategory: 'data', floorId: floor.id, wallIds: [], points: [{ id: 'o1', order: 0, x: 2000, y: 2750, z: 0 }, { id: 'o2', order: 1, x: 2000, y: 2750, z: 1400 }] } as unknown as ProjectSnapshot['routes'][number];
      const conflictResolved = resolveRouteConflicts(repaired, [obstacle], upgraded.preferences.routeOverlapPriorities, upgraded.preferences.routeSeparationMm, upgraded.preferences.routeDiameterMm, 10, upgraded.walls).route;
      const finalized = normalizeConcealedRouteSurfaces({ ...upgraded, routes: [conflictResolved] }, [conflictResolved])[0];
      const escapedSegments = finalized.points.slice(1).filter((end, index) => {
        const start = finalized.points[index]; if (distance3(start, end) <= 300) return false;
        const ceiling = Math.abs(start.y - 2750) <= 5 && Math.abs(end.y - 2750) <= 5;
        const insideWall = upgraded.walls.some((wall) => routeSegmentsOnWall({ points: [start, end] }, wall).length > 0);
        return !ceiling && !insideWall;
      });
      expect(escapedSegments, `${serviceCategory} collision resolution escaped its surfaces`).toEqual([]);
    }
  });

  it('undoes and redoes editor state changes', () => {
    const project = createDefaultProject();
    const changed = { ...project, description: 'Technical survey' };
    const history = commitHistory(createHistory(project), changed);
    expect(undoHistory(history).present.description).toBe('');
    expect(redoHistory(undoHistory(history)).present.description).toBe('Technical survey');
  });

  it('deletes every route connected to a deleted device and cleans remaining references', () => {
    const project = createDefaultProject(); const floorId = project.floors[0].id;
    project.devices = [{ id: 'source', typeId: 'power-outlet', floorId, ports: [] }, { id: 'destination', typeId: 'power-outlet', floorId, ports: [], junctionRouteGroups: [{ id: 'group', name: 'Circuit', incomingRouteIds: ['connected'], outgoingRouteIds: ['unrelated'] }] }] as unknown as ProjectSnapshot['devices'];
    project.routes = [{ id: 'connected', sourceDeviceId: 'source', destinationDeviceId: 'destination', floorId }, { id: 'unrelated', sourceDeviceId: 'destination', floorId }] as unknown as ProjectSnapshot['routes'];
    const result = removeDevicesAndConnectedRoutes(project, ['source']);
    expect(result.devices.map((device) => device.id)).toEqual(['destination']); expect(result.routes.map((route) => route.id)).toEqual(['unrelated']);
    expect(result.devices[0].junctionRouteGroups?.[0]).toMatchObject({ incomingRouteIds: [], outgoingRouteIds: ['unrelated'] });
  });
});
