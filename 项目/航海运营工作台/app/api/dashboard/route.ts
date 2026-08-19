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

  const scysProjects = parseJson(snapshot.scys_projects_json, []);
  return Response.json({
    ok: true,
    source: snapshot.source_name,
    source_checksum: snapshot.source_checksum,
    records: 0,
    groups: 0,
    date_range: null,
    analysis_status: "scys_mcp_only",
    good_news_candidates: 0,
    good_news_detected: 0,
    good_news_breakdown: [],
    good_news_reviewed_at: null,
    public_publishable: 0,
    updated_at: snapshot.scys_updated_at,
    daily_trends: [],
    active_groups: [],
    project_overview: { title: "生财航海项目总览", summary: "仅展示生财 MCP 提供的官方项目与审核可见产出。", coverage: `${scysProjects.length} 个项目` },
    aggregate_report: { title: "生财 MCP 项目数据", main_line: "群聊资料与 ZIP 分析结果未进入公开工作台。", data_status: "MCP 数据已同步" },
    scys_projects: scysProjects,
    scys_updated_at: snapshot.scys_updated_at,
    note: "这是聚合分析结果；原始消息、姓名和证据未进入公开接口。",
  });
}
