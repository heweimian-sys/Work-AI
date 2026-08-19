ALTER TABLE dashboard_snapshots ADD COLUMN good_news_detected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dashboard_snapshots ADD COLUMN good_news_breakdown_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dashboard_snapshots ADD COLUMN good_news_reviewed_at TEXT;
