export function GET() {
  return Response.json({
    ok: true,
    source: "20260815-all-voyage-records-to-latest.zip",
    records: 87331,
    groups: 51,
    date_range: { start: "2026-08-06", end: "2026-08-15" },
    analysis_status: "internal_summary",
    good_news_candidates: 30,
    public_publishable: 0,
    note: "这是聚合分析结果；原始消息、姓名和证据未进入公开接口。",
  });
}
