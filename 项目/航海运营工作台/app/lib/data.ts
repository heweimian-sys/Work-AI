export type Mode = "api";
export type ProjectId = "proj_planet_01";
export type Project = { project_id: ProjectId; name: string; stage: string; day: number; status: string; risk: "低风险" | "中风险" | "高风险"; summary: string; todayGoodNews: number; actions: number; coverage: string };
export type GoodNews = { good_news_id: string; project_id: ProjectId; group_id: string; request_id: string; evidence_ids: string[]; time: string; project: string; group: string; sailor: string; summary: string; original: string; type: string; confidence: number; status: string; spreadable: boolean };
export type Action = { action_id: string; project_id: ProjectId; group_id: string; evidence_ids: string[]; priority: "P1" | "P2" | "P3"; project: string; issue: string; suggestion: string; source: "航海好事" | "风险异常" | "日报" | "群组观察"; owner: string; due: string; status: "待处理" | "进行中" | "待确认" | "已完成"; groupName: string };
export type Report = { request_id: string; project_id: ProjectId; project: string; date: string; status: "待确认" | "已确认"; goodNews: number; actions: number; coverage: string; raw: number; deduped: number; updatedAt: string; dataStatus: string; mainLine: string };
export type Group = { group_id: string; project_id: ProjectId; project: string; group: string; messages: number; interactions: number; questions: number; leads: number; status: "高活跃" | "正常" | "低活跃" | "无互动"; dataStatus: "已覆盖" | "未覆盖"; riskReason?: string };
export type Evidence = { evidence_id: string; source: "群聊原文" | "截图" | "日报" | "飞书表格" | "运营备注"; project_id: ProjectId; group_id: string; request_id: string; project: string; group: string; summary: string; related: string; trust: "已核实" | "待核实" | "存疑"; time: string; raw: string; good_news_id?: string; action_id?: string };
export type DashboardData = { mode: Mode; date: string; projects: Project[]; goodNews: GoodNews[]; actions: Action[]; reports: Report[]; groups: Group[]; evidence: Evidence[]; trends: { date: string; goodNews: number; messages: number; interactions: number; activeGroups: number; lowGroups: number }[]; topics: { name: string; count: number }[]; snapshot?: { records: number; groups: number; candidates: number; published: number; updatedAt: string | null } };
export type DashboardSnapshot = { ok: boolean; records: number; groups: number; date_range: { start: string; end: string } | null; good_news_candidates: number; public_publishable: number; updated_at: string | null; daily_trends?: { date: string; messages: number; active_groups: number }[]; active_groups?: { group: string; messages: number }[]; project_overview?: { title?: string; summary?: string; coverage?: string }; aggregate_report?: { title?: string; main_line?: string; data_status?: string } };

export function dashboardFromSnapshot(snapshot: DashboardSnapshot): DashboardData {
  const date = snapshot.date_range ? `${snapshot.date_range.start} - ${snapshot.date_range.end}` : "暂无数据";
  const projectName = snapshot.project_overview?.title || "航海项目总览";
  const coverage = snapshot.project_overview?.coverage || `${snapshot.groups} / ${snapshot.groups}`;
  return {
    mode: "api", date,
    projects: [{ project_id: "proj_planet_01", name: projectName, stage: "聚合分析", day: snapshot.daily_trends?.length || 0, status: snapshot.records ? "已完成聚合" : "暂无数据", risk: "中风险", summary: snapshot.project_overview?.summary || "暂无可展示数据", todayGoodNews: snapshot.good_news_candidates, actions: 0, coverage }],
    goodNews: [], actions: [], evidence: [],
    reports: snapshot.records ? [{ request_id: "PUBLIC-LATEST", project_id: "proj_planet_01", project: projectName, date, status: "待确认", goodNews: snapshot.good_news_candidates, actions: 0, coverage: coverage.replaceAll(" ", ""), raw: snapshot.records, deduped: snapshot.records, updatedAt: snapshot.updated_at || "-", dataStatus: snapshot.aggregate_report?.data_status || "聚合完成", mainLine: snapshot.aggregate_report?.main_line || "已完成匿名聚合分析" }] : [],
    groups: (snapshot.active_groups || []).map((item, index) => ({ group_id: `AGG-${String(index + 1).padStart(2, "0")}`, project_id: "proj_planet_01", project: projectName, group: item.group, messages: item.messages, interactions: 0, questions: 0, leads: 0, status: "高活跃", dataStatus: "已覆盖" })),
    trends: (snapshot.daily_trends || []).map((item) => ({ date: item.date, goodNews: 0, messages: item.messages, interactions: 0, activeGroups: item.active_groups, lowGroups: 0 })),
    topics: [{ name: "待核验好事线索", count: snapshot.good_news_candidates }, { name: "已覆盖群组", count: snapshot.groups }, { name: "分析天数", count: snapshot.daily_trends?.length || 0 }],
    snapshot: { records: snapshot.records, groups: snapshot.groups, candidates: snapshot.good_news_candidates, published: snapshot.public_publishable, updatedAt: snapshot.updated_at },
  };
}
