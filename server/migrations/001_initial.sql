PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  preferences_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  elevation_mm INTEGER NOT NULL,
  ceiling_height_mm INTEGER NOT NULL CHECK (ceiling_height_mm > 0)
);

CREATE TABLE IF NOT EXISTS walls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_x_mm INTEGER NOT NULL,
  start_z_mm INTEGER NOT NULL,
  end_x_mm INTEGER NOT NULL,
  end_z_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL CHECK (height_mm > 0),
  thickness_mm INTEGER NOT NULL CHECK (thickness_mm > 0),
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  boundary_json TEXT NOT NULL,
  area_mm2 REAL NOT NULL DEFAULT 0,
  ceiling_height_mm INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_walls (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (room_id, wall_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  pattern TEXT NOT NULL,
  color TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS device_types (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  shape TEXT NOT NULL,
  default_dimensions_json TEXT NOT NULL,
  custom INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  service_category TEXT NOT NULL,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  wall_id TEXT REFERENCES walls(id) ON DELETE SET NULL,
  association_type TEXT NOT NULL,
  position_x_mm INTEGER NOT NULL,
  position_y_mm INTEGER NOT NULL,
  position_z_mm INTEGER NOT NULL,
  height_from_floor_mm INTEGER NOT NULL,
  distance_along_wall_mm INTEGER,
  depth_inside_wall_mm INTEGER,
  wall_side TEXT,
  mounting TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  rotation_json TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  electrical_json TEXT NOT NULL DEFAULT '{}',
  network_requirements TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  installation_status TEXT NOT NULL,
  installation_date TEXT,
  custom_properties_json TEXT NOT NULL DEFAULT '[]',
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS device_ports (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  port_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  service_category TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  maximum_voltage REAL,
  maximum_current REAL,
  network_speed TEXT,
  media_type TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cable', 'pipe', 'duct')),
  name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  standard TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  product_code TEXT NOT NULL DEFAULT '',
  source_device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  destination_device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  source_port_id TEXT REFERENCES device_ports(id) ON DELETE SET NULL,
  destination_port_id TEXT REFERENCES device_ports(id) ON DELETE SET NULL,
  room_ids_json TEXT NOT NULL DEFAULT '[]',
  wall_ids_json TEXT NOT NULL DEFAULT '[]',
  installed_length_mm INTEGER,
  spare_length_mm INTEGER,
  technical_properties_json TEXT NOT NULL DEFAULT '{}',
  installation_status TEXT NOT NULL,
  test_status TEXT NOT NULL DEFAULT '',
  test_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  custom_properties_json TEXT NOT NULL DEFAULT '[]',
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS route_points (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  x_mm INTEGER NOT NULL,
  y_mm INTEGER NOT NULL,
  z_mm INTEGER NOT NULL,
  UNIQUE (route_id, sort_order)
);

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  start_json TEXT NOT NULL,
  end_json TEXT NOT NULL,
  wall_id TEXT REFERENCES walls(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  referenced_object_ids_json TEXT NOT NULL DEFAULT '[]',
  text TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wall_id TEXT REFERENCES walls(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  position_json TEXT NOT NULL,
  text TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS export_presets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  options_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS camera_views (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  projection TEXT NOT NULL,
  position_json TEXT NOT NULL,
  target_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_floors_project_id ON floors(project_id);
CREATE INDEX IF NOT EXISTS idx_walls_project_floor ON walls(project_id, floor_id);
CREATE INDEX IF NOT EXISTS idx_rooms_project_floor ON rooms(project_id, floor_id);
CREATE INDEX IF NOT EXISTS idx_devices_project_floor ON devices(project_id, floor_id);
CREATE INDEX IF NOT EXISTS idx_devices_wall_id ON devices(wall_id);
CREATE INDEX IF NOT EXISTS idx_devices_room_id ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_routes_project_floor ON routes(project_id, floor_id);
CREATE INDEX IF NOT EXISTS idx_route_points_route_order ON route_points(route_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_measurements_project_id ON measurements(project_id);

PRAGMA optimize;
