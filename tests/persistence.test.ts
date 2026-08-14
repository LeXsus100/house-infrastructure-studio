import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Device, Room, Route, Wall } from '../shared/types';
import { createApp } from '../server/index';
import { openDatabase, ProjectRepository } from '../server/db';
import { createDefaultProject } from '../src/lib/project';
import { createDefaultRackConfiguration } from '../src/lib/rack';

const folders: string[] = [];
afterEach(() => { while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true }); });

function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'house-infrastructure-')); folders.push(folder);
  const db = openDatabase(join(folder, 'test.sqlite'));
  return { db, folder, repository: new ProjectRepository(db) };
}

describe('SQLite project persistence', () => {
  it('persists normalized walls, device ports and route endpoints', () => {
    const { db, repository } = setup(); const project = createDefaultProject(); const floorId = project.floors[0].id; project.floors[0].blueprint = { dataUrl: 'data:image/png;base64,AA==', fileName: 'plan.png', naturalWidth: 1000, naturalHeight: 800, scaleMmPerPixel: 5, offsetXmm: 120, offsetZmm: -80, rotationDeg: 2, opacity: .4, visible: true, alignmentPointPx: { x: 240, z: 360 }, northArrowPx: [{ x: 500, z: 700 }, { x: 500, z: 100 }] };
    const wall: Wall = { id: crypto.randomUUID(), floorId, name: 'Wall-01', start: { x: 0, z: 0 }, end: { x: 5000, z: 0 }, heightMm: 2700, thicknessMm: 500, structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100, locked: false, hidden: false };
    const roomCategory = { id: crypto.randomUUID(), name: 'Parents Apartment', description: 'Parent rooms', color: '#4f8cff' };
    const room: Room = { id: crypto.randomUUID(), floorId, categoryId: roomCategory.id, name: 'Room 01', description: '', boundary: [{ x: 0, z: 0 }, { x: 5000, z: 0 }, { x: 5000, z: 4000 }, { x: 0, z: 4000 }], wallIds: [wall.id], areaMm2: 20_000_000, ceilingHeightMm: 2700, locked: true, hidden: false };
    const deviceId = crypto.randomUUID(); const portId = crypto.randomUUID(); const routeId = crypto.randomUUID();
    const device: Device = { id: deviceId, typeId: 'ethernet-outlet', name: 'Data outlet 01', categoryId: 'networking', serviceCategory: 'data', manufacturer: '', model: '', description: '', floorId, wallId: wall.id, associationType: 'wall', position: { x: 1000, y: 300, z: 0 }, heightFromFloorMm: 300, rotationDeg: { x: 0, y: 0, z: 0 }, dimensions: { width: 86, height: 86, depth: 35 }, distanceAlongWallMm: 1000, depthInsideWallMm: 0, wallSide: 'center', mounting: 'recessed', backFace: 'back', powerRequirements: 'PoE', networkRequirements: '1 Gbit/s', notes: '', installationStatus: 'planned', ports: [{ id: portId, deviceId, name: 'LAN', portType: 'network', direction: 'bidirectional', serviceCategory: 'data', connectorType: 'RJ45', networkSpeed: '1 Gbit/s', notes: '', position: { x: 0, y: 0, z: -18 }, face: 'back', required: true, spaceRequiredMm: 35 }], rackConfiguration: createDefaultRackConfiguration(), junctionRouteGroups: [{ id: 'group', name: 'Circuit 1', incomingRouteIds: [routeId], outgoingRouteIds: [] }], customProperties: [], physicalColor: 'blue jacket', displayColor: '#246fbe', colorSource: 'userDefined', showLabel: true, locked: false, hidden: false };
    const route: Route = { id: routeId, kind: 'cable', name: 'Cable-01', serviceCategory: 'data', subtype: 'CAT6A', standard: 'ISO/IEC 11801', manufacturer: '', productCode: '', floorId, roomIds: [], wallIds: [wall.id], sourceDeviceId: deviceId, sourcePortId: portId, points: [{ id: crypto.randomUUID(), order: 0, x: 1000, y: 300, z: 0 }, { id: crypto.randomUUID(), order: 1, x: 4500, y: 300, z: 0 }], installationMethod: 'inside wall', maximumDataRate: '10 Gbit/s', physicalIdentification: 'Blue / DATA-01', labelAtSource: 'D01', labelAtDestination: 'PP-01', installationStatus: 'planned', installationDate: '2026-08-11', testStatus: 'not tested', ethernetTerminationStandard: 'T568B', ethernetPairColors: [{ pin: 1, color: 'White-orange' }], displayColor: '#2775c9', colorSource: 'projectConvention', notes: '', customProperties: [], locked: false, hidden: false };
    const lightSwitch = { ...structuredClone(device), id: crypto.randomUUID(), typeId: 'switch', name: 'Light switch 01', ports: [] }; const lightPoint = { ...structuredClone(device), id: crypto.randomUUID(), typeId: 'light-point', name: 'Light point 01', associationType: 'ceiling' as const, ports: [] };
    const lightingControl = { id: crypto.randomUUID(), name: 'Kitchen lighting', switchDeviceId: lightSwitch.id, lightDeviceIds: [lightPoint.id], state: 'off' as const, notes: 'Two-way circuit' };
    const markerId = crypto.randomUUID(); const photoId = crypto.randomUUID(); const photoMarker = { id: markerId, projectId: project.id, floorId, title: 'Cable wall before plaster', description: '', category: 'cable-systems' as const, position: { x: 1200, y: 1400, z: 0 }, createdAt: new Date().toISOString(), photos: [{ id: photoId, markerId, originalFileName: 'wall.jpg', storedFileName: `${photoId}.jpg`, mimeType: 'image/jpeg' as const, caption: '', createdAt: new Date().toISOString() }] };
    repository.save({ ...project, walls: [wall], roomCategories: [roomCategory], rooms: [room], devices: [device, lightSwitch, lightPoint], routes: [route], lightingControls: [lightingControl], photoMarkers: [photoMarker] });
    const loaded = repository.get(project.id)!;
    expect(loaded.walls[0]).toMatchObject({ name: 'Wall-01', thicknessMm: 500, structuralThicknessMm: 300, liningLeftMm: 100, liningRightMm: 100 }); expect(loaded.devices[0].ports[0].connectorType).toBe('RJ45'); expect(loaded.devices[0]).toMatchObject({ showLabel: true, physicalColor: 'blue jacket', displayColor: '#246fbe', colorSource: 'userDefined' }); expect(loaded.routes[0].sourcePortId).toBe(portId); expect(loaded.routes[0].points).toHaveLength(2); expect(loaded.routes[0]).toMatchObject({ ethernetTerminationStandard: 'T568B', displayColor: '#2775c9', installationDate: '2026-08-11' });
    expect(loaded.roomCategories[0].name).toBe('Parents Apartment'); expect(loaded.rooms[0].categoryId).toBe(roomCategory.id); expect(loaded.rooms[0].locked).toBe(true);
    expect(loaded.floors[0].blueprint).toMatchObject({ fileName: 'plan.png', scaleMmPerPixel: 5, alignmentPointPx: { x: 240, z: 360 }, northArrowPx: [{ x: 500, z: 700 }, { x: 500, z: 100 }] }); expect(loaded.deviceTypes.find((type) => type.id === 'access-point')).toMatchObject({ defaultBackFace: 'back', defaultAssociation: 'ceiling', defaultDimensions: { width: 103, height: 150, depth: 36 } }); expect(loaded.deviceTypes.find((type) => type.id === 'electrical-panel')).toMatchObject({ unlimitedPorts: true, defaultPortSpaceMm: 45 }); expect(loaded.devices[0].ports[0]).toMatchObject({ face: 'back', position: { z: -18 }, required: true, spaceRequiredMm: 35 }); expect(loaded.devices[0].junctionRouteGroups).toEqual([{ id: 'group', name: 'Circuit 1', incomingRouteIds: [routeId], outgoingRouteIds: [] }]); expect(loaded.devices[0].rackConfiguration?.modules.some((module) => module.name === '48-port switch')).toBe(true);
    expect(loaded.lightingControls[0]).toMatchObject({ name: 'Kitchen lighting', switchDeviceId: lightSwitch.id, lightDeviceIds: [lightPoint.id] }); expect(loaded.photoMarkers[0]).toMatchObject({ title: 'Cable wall before plaster', photos: [{ storedFileName: `${photoId}.jpg` }] });
    expect(db.prepare('SELECT COUNT(*) AS count FROM route_points').get()).toEqual({ count: 2 });
    expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 11 });
    db.close();
  });

  it('shares edited built-in device defaults across projects but keeps custom types local', () => {
    const { db, repository } = setup(); const first = repository.save(createDefaultProject('First')); const second = repository.save(createDefaultProject('Second'));
    const edited = repository.get(first.id)!; const heatPump = edited.deviceTypes.find((type) => type.id === 'heat-pump')!;
    heatPump.defaultDimensions = { width: 1234, height: 987, depth: 456 }; heatPump.defaultPorts[0] = { ...heatPump.defaultPorts[0], name: 'Shared HVAC inlet' };
    edited.deviceTypes.push({ ...structuredClone(heatPump), id: 'first-project-custom', name: 'First project custom', custom: true });
    repository.save(edited);
    const reloadedSecond = repository.get(second.id)!;
    expect(reloadedSecond.deviceTypes.find((type) => type.id === 'heat-pump')).toMatchObject({ defaultDimensions: { width: 1234, height: 987, depth: 456 } });
    expect(reloadedSecond.deviceTypes.find((type) => type.id === 'heat-pump')?.defaultPorts[0].name).toBe('Shared HVAC inlet');
    expect(reloadedSecond.deviceTypes.some((type) => type.id === 'first-project-custom')).toBe(false);
    const third = repository.save(createDefaultProject('Third'));
    expect(third.deviceTypes.find((type) => type.id === 'heat-pump')?.defaultDimensions.width).toBe(1234);
    expect(db.prepare('SELECT COUNT(*) AS count FROM global_device_type_defaults').get()).toEqual({ count: first.deviceTypes.filter((type) => !type.custom).length });
    db.close();
  });

  it('validates API writes and returns meaningful errors', async () => {
    const { db, folder, repository } = setup(); const projectsDir = join(folder, 'projects'); const app = createApp(repository, { projectsDir }); const project = createDefaultProject();
    expect((await request(app).put(`/api/projects/${project.id}`).send(project)).status).toBe(200);
    const workspaceSnapshot = join(projectsDir, project.id, 'project.json');
    expect(existsSync(workspaceSnapshot)).toBe(true);
    expect(JSON.parse(readFileSync(workspaceSnapshot, 'utf8')).project.id).toBe(project.id);
    const markerId = crypto.randomUUID(); const photoUpload = await request(app).post(`/api/projects/${project.id}/photo-assets`).send({ markerId, fileName: 'before plaster.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(photoUpload.status).toBe(201); expect(photoUpload.body).toMatchObject({ markerId, originalFileName: 'before plaster.png', mimeType: 'image/png' }); expect(existsSync(join(projectsDir, project.id, 'assets', 'photos', photoUpload.body.storedFileName))).toBe(true);
    const invalid = structuredClone(project); invalid.walls = [{ id: 'bad', floorId: project.floors[0].id, name: 'Bad', start: { x: 0, z: 0 }, end: { x: 0, z: 0 }, heightMm: 0, thicknessMm: 0, structuralThicknessMm: 0, liningLeftMm: 0, liningRightMm: 0, locked: false, hidden: false }];
    const response = await request(app).put(`/api/projects/${project.id}`).send(invalid);
    expect(response.status).toBe(400); expect(response.body.error).toMatch(/validation/i); db.close();
  });

  it('rejects DNS-rebinding hosts and cross-site mutations while allowing the desktop origin', async () => {
    const { db, folder, repository } = setup(); const app = createApp(repository, { projectsDir: join(folder, 'projects') });
    expect((await request(app).get('/api/health').set('Host', 'attacker.example')).status).toBe(403);
    expect((await request(app).get('/api/health').set('Origin', 'https://attacker.example')).status).toBe(403);
    expect((await request(app).post('/api/projects/import').set('Sec-Fetch-Site', 'cross-site').send({})).status).toBe(403);
    const desktopPreflight = await request(app).options('/api/projects').set('Origin', 'http://tauri.localhost');
    expect(desktopPreflight.status).toBe(204);
    expect(desktopPreflight.headers['access-control-allow-origin']).toBe('http://tauri.localhost');
    const desktopWrite = await request(app).post('/api/projects/import').set('Origin', 'http://tauri.localhost').set('Sec-Fetch-Site', 'cross-site').send({});
    expect(desktopWrite.status).toBe(400);
    db.close();
  });

  it('serves the built client in production mode', async () => {
    const { db, folder, repository } = setup();
    const staticFolder = mkdtempSync(join(tmpdir(), 'house-static-')); folders.push(staticFolder);
    writeFileSync(join(staticFolder, 'index.html'), '<!doctype html><title>House Infrastructure Studio</title>');
    const response = await request(createApp(repository, { serveStatic: true, staticDir: staticFolder, projectsDir: join(folder, 'projects') })).get('/');
    expect(response.status).toBe(200); expect(response.text).toContain('House Infrastructure Studio'); db.close();
  });
});
