CREATE TABLE IF NOT EXISTS scys_ops_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_mode TEXT NOT NULL CHECK (source_mode = 'scys_mcp_only'),
  ops_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
