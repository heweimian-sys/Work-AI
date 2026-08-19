ALTER TABLE dashboard_snapshots ADD COLUMN scys_projects_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dashboard_snapshots ADD COLUMN scys_updated_at TEXT;
