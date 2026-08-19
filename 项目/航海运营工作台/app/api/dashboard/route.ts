import { env } from "cloudflare:workers";

type Snapshot = {
  source_name: string;
  records: number;
  groups_count: number;
  date_start: string;
  date_end: string;
  good_news_candidates: number;
  good_news_detected: number;
  good_news_breakdown_json: string;
  good_news_reviewed_at: string | null;
  public_publishable: number;
  updated_at: string;
  source_checksum: string;
  analysis_status: string;
  daily_trends_json: string;
  active_groups_json: string;
  project_overview_json: string;
  aggregate_report_json: string;
  scys_projects_json: string;
  scys_updated_at: string | null;
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function GET() {
  const snapshot = await env.DB.prepare(
    "SELECT source_name, records, groups_count, date_start, date_end, good_news_candidates, good_news_detected, good_news_breakdown_json, good_news_reviewed_at, public_publishable, updated_at, source_checksum, analysis_status, daily_trends_json, active_groups_json, project_overview_json, aggregate_report_json, scys_projects_json, scys_updated_at FROM dashboard_snapshots WHERE snapshot_id = 'latest'"
  ).first<Snapshot>();

  if (!snapshot) {
    return Response.json({ ok: true, records: 0, groups: 0, date_range: null, good_news_candidates: 0, public_publishable: 0, updated_at: null });
  }

  return Response.json({
    ok: true,
    source: snapshot.source_name,
    source_checksum: snapshot.source_checksum,
    records: snapshot.records,
    groups: snapshot.groups_count,
    date_range: { start: snapshot.date_start, end: snapshot.date_end },
    analysis_status: snapshot.analysis_status,
    good_news_candidates: snapshot.good_news_candidates,
    good_news_detected: snapshot.good_news_detected,
    good_news_breakdown: parseJson(snapshot.good_news_breakdown_json, []),
    good_news_reviewed_at: snapshot.good_news_reviewed_at,
    public_publishable: snapshot.public_publishable,
    updated_at: snapshot.updated_at,
    daily_trends: parseJson(snapshot.daily_trends_json, []),
    active_groups: parseJson(snapshot.active_groups_json, []),
    project_overview: parseJson(snapshot.project_overview_json, {}),
    aggregate_report: parseJson(snapshot.aggregate_report_json, {}),
    scys_projects: parseJson(snapshot.scys_projects_json, []),
    scys_updated_at: snapshot.scys_updated_at,
    note: "这是聚合分析结果；原始消息、姓名和证据未进入公开接口。",
  });
}
