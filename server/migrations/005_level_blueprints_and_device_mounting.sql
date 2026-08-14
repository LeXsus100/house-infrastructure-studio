ALTER TABLE floors ADD COLUMN blueprint_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE device_types ADD COLUMN mounting_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE device_ports ADD COLUMN position_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":0}';
ALTER TABLE device_ports ADD COLUMN face TEXT NOT NULL DEFAULT 'back';
ALTER TABLE device_ports ADD COLUMN required INTEGER NOT NULL DEFAULT 0;

PRAGMA optimize;
