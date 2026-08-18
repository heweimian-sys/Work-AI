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

INSERT OR REPLACE INTO dashboard_snapshots (
  snapshot_id, source_name, records, groups_count, date_start, date_end,
  good_news_candidates, public_publishable, updated_at
) VALUES (
  'latest', '20260815-all-voyage-records-to-latest.zip', 87331, 51,
  '2026-08-06', '2026-08-15', 30, 0, '2026-08-18T00:00:00+08:00'
);
