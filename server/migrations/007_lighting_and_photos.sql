CREATE TABLE lighting_controls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  switch_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('on', 'off')),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE lighting_control_lights (
  control_id TEXT NOT NULL REFERENCES lighting_controls(id) ON DELETE CASCADE,
  light_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (control_id, light_device_id)
);

CREATE INDEX idx_lighting_controls_project_id ON lighting_controls(project_id);
CREATE INDEX idx_lighting_control_lights_device_id ON lighting_control_lights(light_device_id);

CREATE TABLE photo_markers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  position_x_mm INTEGER NOT NULL,
  position_y_mm INTEGER NOT NULL,
  position_z_mm INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE project_photos (
  id TEXT PRIMARY KEY,
  marker_id TEXT NOT NULL REFERENCES photo_markers(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX idx_photo_markers_project_floor ON photo_markers(project_id, floor_id);
CREATE INDEX idx_project_photos_marker_id ON project_photos(marker_id);
CREATE UNIQUE INDEX idx_project_photos_stored_file_name ON project_photos(stored_file_name);

PRAGMA optimize;
