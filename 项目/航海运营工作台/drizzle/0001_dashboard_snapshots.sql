CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  records INTEGER NOT NULL,
  groups_count INTEGER NOT NULL,
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  good_news_candidates INTEGER NOT NULL DEFAULT 0,
  public_publishable INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
