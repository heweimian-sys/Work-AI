import { env } from "cloudflare:workers";

type Snapshot = {
  source_name: string;
  records: number;
  groups_count: number;
  date_start: string;
  date_end: string;
  good_news_candidates: number;
  public_publishable: number;
  updated_at: string;
};

export async function GET() {
  const snapshot = await env.DB.prepare(
    "SELECT source_name, records, groups_count, date_start, date_end, good_news_candidates, public_publishable, updated_at FROM dashboard_snapshots WHERE snapshot_id = 'latest'"
  ).first<Snapshot>();

  if (!snapshot) {
    return Response.json({ ok: true, records: 0, groups: 0, date_range: null, good_news_candidates: 0, public_publishable: 0, updated_at: null });
  }

  return Response.json({
    ok: true,
    source: snapshot.source_name,
    records: snapshot.records,
    groups: snapshot.groups_count,
    date_range: { start: snapshot.date_start, end: snapshot.date_end },
    analysis_status: "internal_summary",
    good_news_candidates: snapshot.good_news_candidates,
    public_publishable: snapshot.public_publishable,
    updated_at: snapshot.updated_at,
    note: "这是聚合分析结果；原始消息、姓名和证据未进入公开接口。",
  });
}
