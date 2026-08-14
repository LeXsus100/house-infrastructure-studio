CREATE TABLE IF NOT EXISTS room_categories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#64748b'
);

ALTER TABLE rooms ADD COLUMN category_id TEXT REFERENCES room_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_room_categories_project_id ON room_categories(project_id);
CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON rooms(category_id);
