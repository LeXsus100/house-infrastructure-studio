import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectSnapshot } from '../shared/types';

const serverDir = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = process.env.HOUSE_INFRASTRUCTURE_DB_PATH || process.env.CASA_DB_PATH || join(serverDir, '..', '.data', 'casa.sqlite');
const migrationsDir = process.env.HOUSE_INFRASTRUCTURE_MIGRATIONS_DIR || join(serverDir, 'migrations');
const migrations = [
  { version: 1, name: 'initial', path: join(migrationsDir, '001_initial.sql') },
  { version: 2, name: 'room categories', path: join(migrationsDir, '002_room_categories.sql') },
  { version: 3, name: 'object locking', path: join(migrationsDir, '003_object_locking.sql') },
  { version: 4, name: 'visual metadata', path: join(migrationsDir, '004_visual_metadata.sql') },
  { version: 5, name: 'level blueprints and device mounting', path: join(migrationsDir, '005_level_blueprints_and_device_mounting.sql') },
  { version: 6, name: 'floor order', path: join(migrationsDir, '006_floor_order.sql') },
  { version: 7, name: 'lighting controls and project photos', path: join(migrationsDir, '007_lighting_and_photos.sql') },
  { version: 8, name: 'layered walls and route planning', path: join(migrationsDir, '008_wall_layers_and_route_planning.sql') },
  { version: 9, name: 'expandable device ports', path: join(migrationsDir, '009_expandable_device_ports.sql') },
  { version: 10, name: 'global device type defaults', path: join(migrationsDir, '010_global_device_type_defaults.sql') },
  { version: 11, name: 'route installation date', path: join(migrationsDir, '011_route_installation_date.sql') }
];

const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const bool = (value: unknown) => Number(value) === 1;

export function openDatabase(path = defaultDatabasePath): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const hasMigrations = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!hasMigrations) {
    db.exec(readFileSync(migrations[0].path, 'utf8'));
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(1, 'initial', new Date().toISOString());
  }
  for (const migration of migrations.slice(1)) {
    const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(migration.version);
    if (applied) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(migration.path, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

export class ProjectRepository {
  constructor(readonly db: DatabaseSync) {}

  private globalDeviceTypes() {
    const rows = this.db.prepare('SELECT id, definition_json FROM global_device_type_defaults').all() as Array<{ id: string; definition_json: string }>;
    return new Map(rows.flatMap((row) => {
      const definition = parse<ProjectSnapshot['deviceTypes'][number] | null>(row.definition_json, null);
      return definition && definition.id === row.id && !definition.custom ? [[row.id, definition] as const] : [];
    }));
  }

  private applyGlobalDeviceTypes(project: ProjectSnapshot): ProjectSnapshot {
    const globalTypes = this.globalDeviceTypes();
    if (!globalTypes.size) return project;
    const localIds = new Set(project.deviceTypes.map((item) => item.id));
    const deviceTypes = project.deviceTypes.map((item) => item.custom || !globalTypes.has(item.id)
      ? item
      : { ...structuredClone(globalTypes.get(item.id)!), id: item.id, custom: false });
    globalTypes.forEach((item, id) => { if (!localIds.has(id)) deviceTypes.push(structuredClone(item)); });
    return { ...project, deviceTypes };
  }

  private saveGlobalDeviceTypes(deviceTypes: ProjectSnapshot['deviceTypes'], now: string, onlyMissing: boolean) {
    const statement = this.db.prepare(onlyMissing
      ? 'INSERT OR IGNORE INTO global_device_type_defaults (id,definition_json,updated_at) VALUES (?,?,?)'
      : 'INSERT INTO global_device_type_defaults (id,definition_json,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET definition_json=excluded.definition_json, updated_at=excluded.updated_at');
    deviceTypes.filter((item) => !item.custom).forEach((item) => statement.run(item.id, json({ ...item, custom: false }), now));
  }

  list() {
    return this.db.prepare('SELECT id, title, description, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC').all();
  }

  get(id: string): ProjectSnapshot | null {
    const project = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!project) return null;
    const floors = this.db.prepare('SELECT * FROM floors WHERE project_id = ? ORDER BY sort_order, elevation_mm').all(id) as Record<string, unknown>[];
    const walls = this.db.prepare('SELECT * FROM walls WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const rooms = this.db.prepare('SELECT * FROM rooms WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const roomCategories = this.db.prepare('SELECT * FROM room_categories WHERE project_id = ? ORDER BY name').all(id) as Record<string, unknown>[];
    const roomWalls = this.db.prepare('SELECT room_id, wall_id FROM room_walls WHERE room_id IN (SELECT id FROM rooms WHERE project_id = ?) ORDER BY sort_order').all(id) as Record<string, unknown>[];
    const devices = this.db.prepare('SELECT * FROM devices WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const ports = this.db.prepare('SELECT * FROM device_ports WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').all(id) as Record<string, unknown>[];
    const routes = this.db.prepare('SELECT * FROM routes WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const routePoints = this.db.prepare('SELECT * FROM route_points WHERE route_id IN (SELECT id FROM routes WHERE project_id = ?) ORDER BY route_id, sort_order').all(id) as Record<string, unknown>[];
    const measurements = this.db.prepare('SELECT * FROM measurements WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const categories = this.db.prepare('SELECT * FROM categories WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const deviceTypes = this.db.prepare('SELECT * FROM device_types WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const exportPresets = this.db.prepare('SELECT * FROM export_presets WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const cameraViews = this.db.prepare('SELECT * FROM camera_views WHERE project_id = ?').all(id) as Record<string, unknown>[];
    const lightingControls = this.db.prepare('SELECT * FROM lighting_controls WHERE project_id = ? ORDER BY name').all(id) as Record<string, unknown>[];
    const lightingControlLights = this.db.prepare('SELECT control_id, light_device_id FROM lighting_control_lights WHERE control_id IN (SELECT id FROM lighting_controls WHERE project_id = ?) ORDER BY sort_order').all(id) as Record<string, unknown>[];
    const photoMarkers = this.db.prepare('SELECT * FROM photo_markers WHERE project_id = ? ORDER BY created_at').all(id) as Record<string, unknown>[];
    const projectPhotos = this.db.prepare('SELECT * FROM project_photos WHERE marker_id IN (SELECT id FROM photo_markers WHERE project_id = ?) ORDER BY marker_id, sort_order').all(id) as Record<string, unknown>[];

    const snapshot: ProjectSnapshot = {
      id: String(project.id), title: String(project.title), description: String(project.description),
      createdAt: String(project.created_at), updatedAt: String(project.updated_at),
      preferences: { ...parse<Record<string, unknown>>(project.preferences_json, {}), theme: project.theme } as ProjectSnapshot['preferences'],
      floors: floors.map((row) => { const blueprint = parse<ProjectSnapshot['floors'][number]['blueprint']>(row.blueprint_json, undefined); return { id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order), elevationMm: Number(row.elevation_mm), ceilingHeightMm: Number(row.ceiling_height_mm), blueprint: blueprint?.dataUrl ? blueprint : undefined }; }),
      walls: walls.map((row) => ({
        id: String(row.id), floorId: String(row.floor_id), name: String(row.name),
        start: { x: Number(row.start_x_mm), z: Number(row.start_z_mm) }, end: { x: Number(row.end_x_mm), z: Number(row.end_z_mm) },
        heightMm: Number(row.height_mm), thicknessMm: Number(row.thickness_mm),
        structuralThicknessMm: Number(row.structural_thickness_mm ?? row.thickness_mm), liningLeftMm: Number(row.lining_left_mm ?? 0), liningRightMm: Number(row.lining_right_mm ?? 0),
        locked: bool(row.locked), hidden: bool(row.hidden)
      })),
      rooms: rooms.map((row) => ({
        id: String(row.id), floorId: String(row.floor_id), name: String(row.name), description: String(row.description),
        boundary: parse(row.boundary_json, []), areaMm2: Number(row.area_mm2), ceilingHeightMm: Number(row.ceiling_height_mm), locked: bool(row.locked), hidden: bool(row.hidden),
        categoryId: row.category_id ? String(row.category_id) : undefined,
        wallIds: roomWalls.filter((link) => link.room_id === row.id).map((link) => String(link.wall_id))
      })),
      roomCategories: roomCategories.map((row) => ({
        id: String(row.id), name: String(row.name), description: String(row.description), color: String(row.color)
      })),
      deviceTypes: deviceTypes.map((row) => {
        const mounting = parse<Partial<ProjectSnapshot['deviceTypes'][number]>>(row.mounting_json, {});
        return { id: String(row.id), categoryId: String(row.category_id), name: String(row.name), serviceCategory: String(row.service_category) as never,
          shape: String(row.shape) as never, defaultDimensions: parse(row.default_dimensions_json, { width: 100, height: 100, depth: 100 }), defaultDisplayColor: row.default_display_color ? String(row.default_display_color) : undefined,
          builtInRevision: mounting.builtInRevision, family: mounting.family ?? 'device', defaultBackFace: mounting.defaultBackFace ?? 'back', defaultAssociation: mounting.defaultAssociation ?? 'wall', defaultPorts: mounting.defaultPorts ?? [], unlimitedPorts: mounting.unlimitedPorts ?? false, defaultPortSpaceMm: mounting.defaultPortSpaceMm, custom: bool(row.custom) };
      }),
      devices: devices.map((row) => {
        const electrical = parse<Record<string, unknown>>(row.electrical_json, {});
        const visual = parse<Record<string, unknown>>(row.visual_json, {});
        return {
          id: String(row.id), typeId: String(row.type_id), name: String(row.name), categoryId: String(row.category_id), serviceCategory: String(row.service_category) as never,
          manufacturer: String(row.manufacturer), model: String(row.model), description: String(row.description),
          floorId: String(row.floor_id), roomId: row.room_id ? String(row.room_id) : undefined, wallId: row.wall_id ? String(row.wall_id) : undefined,
          associationType: String(row.association_type) as never,
          position: { x: Number(row.position_x_mm), y: Number(row.position_y_mm), z: Number(row.position_z_mm) },
          heightFromFloorMm: Number(row.height_from_floor_mm), rotationDeg: parse(row.rotation_json, { x: 0, y: 0, z: 0 }),
          dimensions: parse(row.dimensions_json, { width: 100, height: 100, depth: 100 }),
          distanceAlongWallMm: row.distance_along_wall_mm == null ? undefined : Number(row.distance_along_wall_mm),
          depthInsideWallMm: row.depth_inside_wall_mm == null ? undefined : Number(row.depth_inside_wall_mm),
          wallSide: row.wall_side ? String(row.wall_side) as never : undefined, mounting: String(row.mounting) as never,
          powerRequirements: String(electrical.powerRequirements ?? ''), voltage: electrical.voltage as number | undefined,
          current: electrical.current as number | undefined, wattage: electrical.wattage as number | undefined,
          networkRequirements: String(row.network_requirements), notes: String(row.notes), installationStatus: String(row.installation_status) as never,
          installationDate: row.installation_date ? String(row.installation_date) : undefined,
          functionalColor: visual.functionalColor as string | undefined, physicalColor: visual.physicalColor as string | undefined,
          displayColor: visual.displayColor as string | undefined, colorSource: visual.colorSource as never, showLabel: Boolean(visual.showLabel),
          backFace: (visual.backFace as never) ?? 'back', accessibleFloorIds: visual.accessibleFloorIds as string[] | undefined, transitionToFloorId: visual.transitionToFloorId as string | undefined,
          rackConfiguration: visual.rackConfiguration as ProjectSnapshot['devices'][number]['rackConfiguration'],
          riserRouteLinks: visual.riserRouteLinks as ProjectSnapshot['devices'][number]['riserRouteLinks'],
          junctionRouteGroups: visual.junctionRouteGroups as ProjectSnapshot['devices'][number]['junctionRouteGroups'],
          ports: ports.filter((port) => port.device_id === row.id).map((port) => ({
            id: String(port.id), deviceId: String(port.device_id), name: String(port.name), portType: String(port.port_type), direction: String(port.direction) as never,
            serviceCategory: String(port.service_category) as never, connectorType: String(port.connector_type),
            maximumVoltage: port.maximum_voltage == null ? undefined : Number(port.maximum_voltage), maximumCurrent: port.maximum_current == null ? undefined : Number(port.maximum_current),
            networkSpeed: port.network_speed ? String(port.network_speed) : undefined, mediaType: port.media_type ? String(port.media_type) : undefined, notes: String(port.notes),
            position: parse(port.position_json, { x: 0, y: 0, z: 0 }), face: String(port.face) as never, required: bool(port.required), spaceRequiredMm: port.space_required_mm == null ? undefined : Number(port.space_required_mm)
          })),
          customProperties: parse(row.custom_properties_json, []), locked: bool(row.locked), hidden: bool(row.hidden)
        };
      }),
      routes: routes.map((row) => {
        const technical = parse<Record<string, unknown>>(row.technical_properties_json, {});
        return {
          id: String(row.id), kind: String(row.kind) as never, name: String(row.name), serviceCategory: String(row.service_category) as never,
          subtype: String(row.subtype), standard: String(row.standard), manufacturer: String(row.manufacturer), productCode: String(row.product_code), floorId: String(row.floor_id),
          roomIds: parse(row.room_ids_json, []), wallIds: parse(row.wall_ids_json, []), sourceDeviceId: row.source_device_id ? String(row.source_device_id) : undefined,
          destinationDeviceId: row.destination_device_id ? String(row.destination_device_id) : undefined, sourcePortId: row.source_port_id ? String(row.source_port_id) : undefined,
          destinationPortId: row.destination_port_id ? String(row.destination_port_id) : undefined,
          points: routePoints.filter((point) => point.route_id === row.id).map((point) => ({ id: String(point.id), order: Number(point.sort_order), x: Number(point.x_mm), y: Number(point.y_mm), z: Number(point.z_mm) })),
          installedLengthMm: row.installed_length_mm == null ? undefined : Number(row.installed_length_mm), spareLengthMm: row.spare_length_mm == null ? undefined : Number(row.spare_length_mm),
          ...technical,
          installationStatus: String(row.installation_status) as never, installationDate: row.installation_date ? String(row.installation_date) : undefined, testStatus: String(row.test_status), testDate: row.test_date ? String(row.test_date) : undefined,
          notes: String(row.notes), customProperties: parse(row.custom_properties_json, []), locked: bool(row.locked), hidden: bool(row.hidden)
        } as unknown as ProjectSnapshot['routes'][number];
      }),
      measurements: measurements.map((row) => ({
        id: String(row.id), projectId: id, type: String(row.type) as never, name: String(row.name), start: parse(row.start_json, { x: 0, y: 0, z: 0 }),
        end: parse(row.end_json, { x: 0, y: 0, z: 0 }), wallId: row.wall_id ? String(row.wall_id) : undefined, roomId: row.room_id ? String(row.room_id) : undefined,
        referencedObjectIds: parse(row.referenced_object_ids_json, []), text: String(row.text), visible: bool(row.visible), locked: bool(row.locked)
      })),
      categories: categories.map((row) => ({ id: String(row.id), name: String(row.name), serviceCategory: String(row.service_category) as never, pattern: String(row.pattern), color: String(row.color) })),
      exportPresets: exportPresets.map((row) => ({ id: String(row.id), name: String(row.name), ...parse<Record<string, unknown>>(row.options_json, {}) })) as ProjectSnapshot['exportPresets'],
      cameraViews: cameraViews.map((row) => ({ id: String(row.id), name: String(row.name), projection: String(row.projection) as never, position: parse(row.position_json, { x: 0, y: 0, z: 0 }), target: parse(row.target_json, { x: 0, y: 0, z: 0 }) })),
      lightingControls: lightingControls.map((row) => ({ id: String(row.id), name: String(row.name), switchDeviceId: String(row.switch_device_id), state: String(row.state) as 'on' | 'off', notes: String(row.notes), lightDeviceIds: lightingControlLights.filter((link) => link.control_id === row.id).map((link) => String(link.light_device_id)) })),
      photoMarkers: photoMarkers.map((row) => ({
        id: String(row.id), projectId: id, floorId: String(row.floor_id), title: String(row.title), description: String(row.description), category: String(row.category) as never,
        position: { x: Number(row.position_x_mm), y: Number(row.position_y_mm), z: Number(row.position_z_mm) }, createdAt: String(row.created_at),
        photos: projectPhotos.filter((photo) => photo.marker_id === row.id).map((photo) => ({ id: String(photo.id), markerId: String(photo.marker_id), originalFileName: String(photo.original_file_name), storedFileName: String(photo.stored_file_name), mimeType: String(photo.mime_type) as never, caption: String(photo.caption), createdAt: String(photo.created_at) }))
      }))
    };
    return this.applyGlobalDeviceTypes(snapshot);
  }

  save(project: ProjectSnapshot): ProjectSnapshot {
    const now = new Date().toISOString();
    const exists = !!this.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(project.id);
    const incoming = { ...project, updatedAt: now };
    const snapshot = exists ? incoming : this.applyGlobalDeviceTypes(incoming);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.saveGlobalDeviceTypes(snapshot.deviceTypes, now, !exists);
      this.db.prepare(`INSERT INTO projects (id,title,description,created_at,updated_at,theme,preferences_json) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, updated_at=excluded.updated_at, theme=excluded.theme, preferences_json=excluded.preferences_json`)
        .run(snapshot.id, snapshot.title, snapshot.description, snapshot.createdAt, now, snapshot.preferences.theme, json({ ...snapshot.preferences, theme: undefined }));
      this.db.prepare('DELETE FROM project_photos WHERE marker_id IN (SELECT id FROM photo_markers WHERE project_id = ?)').run(snapshot.id);
      this.db.prepare('DELETE FROM photo_markers WHERE project_id = ?').run(snapshot.id);
      this.db.prepare('DELETE FROM lighting_control_lights WHERE control_id IN (SELECT id FROM lighting_controls WHERE project_id = ?)').run(snapshot.id);
      this.db.prepare('DELETE FROM lighting_controls WHERE project_id = ?').run(snapshot.id);
      this.db.prepare('DELETE FROM room_walls WHERE room_id IN (SELECT id FROM rooms WHERE project_id = ?)').run(snapshot.id);
      for (const table of ['export_presets', 'camera_views', 'measurements', 'routes', 'devices', 'rooms', 'room_categories', 'walls', 'device_types', 'categories', 'floors']) this.db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(snapshot.id);
      const insertFloor = this.db.prepare('INSERT INTO floors (id,project_id,name,elevation_mm,ceiling_height_mm,blueprint_json,sort_order) VALUES (?,?,?,?,?,?,?)');
      snapshot.floors.forEach((item, index) => insertFloor.run(item.id, snapshot.id, item.name, item.elevationMm, item.ceilingHeightMm, json(item.blueprint ?? {}), item.sortOrder ?? index));
      const insertWall = this.db.prepare('INSERT INTO walls (id,project_id,floor_id,name,start_x_mm,start_z_mm,end_x_mm,end_z_mm,height_mm,thickness_mm,locked,hidden,structural_thickness_mm,lining_left_mm,lining_right_mm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      snapshot.walls.forEach((item) => insertWall.run(item.id, snapshot.id, item.floorId, item.name, item.start.x, item.start.z, item.end.x, item.end.z, item.heightMm, item.thicknessMm, Number(item.locked), Number(item.hidden), item.structuralThicknessMm, item.liningLeftMm, item.liningRightMm));
      const insertRoomCategory = this.db.prepare('INSERT INTO room_categories (id,project_id,name,description,color) VALUES (?,?,?,?,?)');
      snapshot.roomCategories.forEach((item) => insertRoomCategory.run(item.id, snapshot.id, item.name, item.description, item.color));
      const insertRoom = this.db.prepare('INSERT INTO rooms (id,project_id,floor_id,name,description,boundary_json,area_mm2,ceiling_height_mm,hidden,category_id,locked) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      const insertRoomWall = this.db.prepare('INSERT INTO room_walls VALUES (?,?,?)');
      snapshot.rooms.forEach((item) => {
        insertRoom.run(item.id, snapshot.id, item.floorId, item.name, item.description, json(item.boundary), item.areaMm2, item.ceilingHeightMm, Number(item.hidden), item.categoryId ?? null, Number(item.locked));
        item.wallIds.forEach((wallId, order) => insertRoomWall.run(item.id, wallId, order));
      });
      const insertCategory = this.db.prepare('INSERT INTO categories VALUES (?,?,?,?,?,?)');
      snapshot.categories.forEach((item) => insertCategory.run(item.id, snapshot.id, item.name, item.serviceCategory, item.pattern, item.color));
      const insertType = this.db.prepare('INSERT INTO device_types (id,project_id,category_id,name,service_category,shape,default_dimensions_json,custom,default_display_color,mounting_json) VALUES (?,?,?,?,?,?,?,?,?,?)');
      snapshot.deviceTypes.forEach((item) => insertType.run(item.id, snapshot.id, item.categoryId, item.name, item.serviceCategory, item.shape, json(item.defaultDimensions), Number(item.custom), item.defaultDisplayColor ?? null, json({ builtInRevision: item.builtInRevision, family: item.family, defaultBackFace: item.defaultBackFace, defaultAssociation: item.defaultAssociation, defaultPorts: item.defaultPorts, unlimitedPorts: item.unlimitedPorts, defaultPortSpaceMm: item.defaultPortSpaceMm })));
      const insertDevice = this.db.prepare('INSERT INTO devices (id,project_id,type_id,name,category_id,service_category,floor_id,room_id,wall_id,association_type,position_x_mm,position_y_mm,position_z_mm,height_from_floor_mm,distance_along_wall_mm,depth_inside_wall_mm,wall_side,mounting,manufacturer,model,description,rotation_json,dimensions_json,electrical_json,network_requirements,notes,installation_status,installation_date,custom_properties_json,locked,hidden,visual_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const insertPort = this.db.prepare('INSERT INTO device_ports (id,device_id,name,port_type,direction,service_category,connector_type,maximum_voltage,maximum_current,network_speed,media_type,notes,position_json,face,required,space_required_mm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      snapshot.devices.forEach((item) => {
        insertDevice.run(item.id, snapshot.id, item.typeId, item.name, item.categoryId, item.serviceCategory, item.floorId, item.roomId ?? null, item.wallId ?? null,
          item.associationType, item.position.x, item.position.y, item.position.z, item.heightFromFloorMm, item.distanceAlongWallMm ?? null, item.depthInsideWallMm ?? null,
          item.wallSide ?? null, item.mounting, item.manufacturer, item.model, item.description, json(item.rotationDeg), json(item.dimensions),
          json({ powerRequirements: item.powerRequirements, voltage: item.voltage, current: item.current, wattage: item.wattage }), item.networkRequirements,
          item.notes, item.installationStatus, item.installationDate ?? null, json(item.customProperties), Number(item.locked), Number(item.hidden),
          json({ functionalColor: item.functionalColor, physicalColor: item.physicalColor, displayColor: item.displayColor, colorSource: item.colorSource, showLabel: item.showLabel, backFace: item.backFace, accessibleFloorIds: item.accessibleFloorIds, transitionToFloorId: item.transitionToFloorId, rackConfiguration: item.rackConfiguration, riserRouteLinks: item.riserRouteLinks, junctionRouteGroups: item.junctionRouteGroups }));
        item.ports.forEach((port) => insertPort.run(port.id, item.id, port.name, port.portType, port.direction, port.serviceCategory, port.connectorType,
          port.maximumVoltage ?? null, port.maximumCurrent ?? null, port.networkSpeed ?? null, port.mediaType ?? null, port.notes, json(port.position), port.face, Number(port.required), port.spaceRequiredMm ?? null));
      });
      const insertRoute = this.db.prepare('INSERT INTO routes (id,project_id,floor_id,kind,name,service_category,subtype,standard,manufacturer,product_code,source_device_id,destination_device_id,source_port_id,destination_port_id,room_ids_json,wall_ids_json,installed_length_mm,spare_length_mm,technical_properties_json,installation_status,test_status,test_date,notes,custom_properties_json,locked,hidden,installation_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const insertPoint = this.db.prepare('INSERT INTO route_points VALUES (?,?,?,?,?,?)');
      snapshot.routes.forEach((item) => {
        const { voltage, current, power, conductors, conductorCrossSectionMm2, wireGauge, shielding, jacketType, fireRating, installationMethod,
          maximumDataRate, poeClass, frequencyRating, physicalIdentification, labelAtSource, labelAtDestination, conduitAssociation, pipe, duct, flowDirection,
          functionalColor, physicalColor, displayColor, colorSource, conductorConfiguration, conductorColors, ethernetTerminationStandard, ethernetPairColors, conduit } = item;
        insertRoute.run(item.id, snapshot.id, item.floorId, item.kind, item.name, item.serviceCategory, item.subtype, item.standard, item.manufacturer, item.productCode,
          item.sourceDeviceId ?? null, item.destinationDeviceId ?? null, item.sourcePortId ?? null, item.destinationPortId ?? null, json(item.roomIds), json(item.wallIds),
          item.installedLengthMm ?? null, item.spareLengthMm ?? null, json({ voltage, current, power, conductors, conductorCrossSectionMm2, wireGauge, shielding, jacketType,
            fireRating, installationMethod, maximumDataRate, poeClass, frequencyRating, physicalIdentification, labelAtSource, labelAtDestination, conduitAssociation, pipe, duct, flowDirection,
            functionalColor, physicalColor, displayColor, colorSource, conductorConfiguration, conductorColors, ethernetTerminationStandard, ethernetPairColors, conduit }),
          item.installationStatus, item.testStatus, item.testDate ?? null, item.notes, json(item.customProperties), Number(item.locked), Number(item.hidden), item.installationDate ?? null);
        item.points.forEach((point, order) => insertPoint.run(point.id, item.id, order, point.x, point.y, point.z));
      });
      const insertMeasurement = this.db.prepare('INSERT INTO measurements (id,project_id,type,name,start_json,end_json,wall_id,room_id,referenced_object_ids_json,text,visible,locked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      snapshot.measurements.forEach((item) => insertMeasurement.run(item.id, snapshot.id, item.type, item.name, json(item.start), json(item.end), item.wallId ?? null, item.roomId ?? null, json(item.referencedObjectIds), item.text, Number(item.visible), Number(item.locked)));
      const insertPreset = this.db.prepare('INSERT INTO export_presets VALUES (?,?,?,?)');
      snapshot.exportPresets.forEach(({ id, name, ...options }) => insertPreset.run(id, snapshot.id, name, json(options)));
      const insertCamera = this.db.prepare('INSERT INTO camera_views VALUES (?,?,?,?,?,?)');
      snapshot.cameraViews.forEach((item) => insertCamera.run(item.id, snapshot.id, item.name, item.projection, json(item.position), json(item.target)));
      const insertLightingControl = this.db.prepare('INSERT INTO lighting_controls (id,project_id,name,switch_device_id,state,notes) VALUES (?,?,?,?,?,?)');
      const insertLightingLight = this.db.prepare('INSERT INTO lighting_control_lights (control_id,light_device_id,sort_order) VALUES (?,?,?)');
      snapshot.lightingControls.forEach((item) => { insertLightingControl.run(item.id, snapshot.id, item.name, item.switchDeviceId, item.state, item.notes); item.lightDeviceIds.forEach((deviceId, order) => insertLightingLight.run(item.id, deviceId, order)); });
      const insertPhotoMarker = this.db.prepare('INSERT INTO photo_markers (id,project_id,floor_id,title,description,category,position_x_mm,position_y_mm,position_z_mm,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
      const insertProjectPhoto = this.db.prepare('INSERT INTO project_photos (id,marker_id,original_file_name,stored_file_name,mime_type,caption,created_at,sort_order) VALUES (?,?,?,?,?,?,?,?)');
      snapshot.photoMarkers.forEach((marker) => { insertPhotoMarker.run(marker.id, snapshot.id, marker.floorId, marker.title, marker.description, marker.category, marker.position.x, marker.position.y, marker.position.z, marker.createdAt); marker.photos.forEach((photo, order) => insertProjectPhoto.run(photo.id, marker.id, photo.originalFileName, photo.storedFileName, photo.mimeType, photo.caption, photo.createdAt, order)); });
      this.db.exec('COMMIT');
      return snapshot;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  delete(id: string) { return this.db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0; }

  getPhotoAsset(projectId: string, photoId: string): { storedFileName: string; mimeType: string } | null {
    const row = this.db.prepare('SELECT p.stored_file_name AS storedFileName, p.mime_type AS mimeType FROM project_photos p JOIN photo_markers m ON m.id = p.marker_id WHERE m.project_id = ? AND p.id = ?').get(projectId, photoId) as { storedFileName: string; mimeType: string } | undefined;
    return row ?? null;
  }

  duplicate(id: string): ProjectSnapshot | null {
    const source = this.get(id);
    if (!source) return null;
    const copy = structuredClone(source);
    copy.id = crypto.randomUUID();
    copy.title = `${source.title} copy`;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    return this.save(copy);
  }
}

export function resetDatabase(path = defaultDatabasePath) {
  const databasePath = resolve(path); const dataFolder = dirname(databasePath); const projectsFolder = resolve(dataFolder, 'projects');
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  if (dirname(projectsFolder) === dataFolder) rmSync(projectsFolder, { recursive: true, force: true });
}
