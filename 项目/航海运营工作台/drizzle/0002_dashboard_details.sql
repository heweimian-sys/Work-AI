ALTER TABLE dashboard_snapshots ADD COLUMN source_checksum TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_snapshots ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'internal_summary';
ALTER TABLE dashboard_snapshots ADD COLUMN daily_trends_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dashboard_snapshots ADD COLUMN active_groups_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dashboard_snapshots ADD COLUMN project_overview_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE dashboard_snapshots ADD COLUMN aggregate_report_json TEXT NOT NULL DEFAULT '{}';
