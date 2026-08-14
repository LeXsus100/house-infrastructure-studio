ALTER TABLE device_types ADD COLUMN default_display_color TEXT;
ALTER TABLE devices ADD COLUMN visual_json TEXT NOT NULL DEFAULT '{}';

PRAGMA optimize;
