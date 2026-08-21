import { env } from "cloudflare:workers";
import { assessMcpOpsHealth, projectPublicMcpOps } from "../../../lib/public-api-safety";
import { buildProjectDecisions, projectName, qaTimeWarnings, tasksDueWithin } from "../../../lib/data";

type SnapshotRow = { ops_json: string; updated_at: string };

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export async function GET() {
  try {
    const row = await env.DB.prepare(
      "SELECT ops_json, updated_at FROM scys_ops_snapshots WHERE snapshot_id = 'latest'",
    ).first<SnapshotRow>();
    const raw = row ? parseJson(row.ops_json) : null;
    const ops = projectPublicMcpOps(raw);
    const health = assessMcpOpsHealth(raw);

    if (!ops) {
      return Response.json({ ok: false, status: "unavailable", source_mode: "scys_mcp_only" }, { status: 503 });
    }

    const tasks72h = tasksDueWithin(ops, 72, new Date());
    const qa = ops.operations.qaProjects.reduce((total, project) => ({
      records: total.records + project.fetched,
      new24h: total.new24h + project.new24h,
      new24hWithoutFirstReply: total.new24hWithoutFirstReply + project.new24hUnanswered,
      withoutFirstReply: total.withoutFirstReply + project.awaitingFirstReply,
      withoutFirstReply48h: total.withoutFirstReply48h + project.awaitingFirstReply48h,
    }), { records: 0, new24h: 0, new24hWithoutFirstReply: 0, withoutFirstReply: 0, withoutFirstReply48h: 0 });
    const qaWarnings = qaTimeWarnings(ops).map((warning) => ({
      project_id: warning.projectId,
      project: projectName(ops, warning.projectId),
      data_as_of: warning.dataAsOf,
      lag_hours: warning.lagHours,
      issue: warning.issue,
    }));
    const priorities = buildProjectDecisions(ops, new Date()).slice(0, 5).map((decision) => ({
      project_id: decision.projectId,
      project: projectName(ops, decision.projectId),
      priority: decision.priority,
      risk_score: decision.riskScore,
      title: decision.title,
      signals: decision.signals,
      recommendation: decision.recommendation,
      due_at: decision.dueAt || null,
      data_as_of: decision.dataAsOf,
    }));

    return Response.json({
      ok: health.ok,
      status: health.status,
      source_mode: "scys_mcp_only",
      retrieved_at: ops.retrievedAt,
      updated_at: row?.updated_at || null,
      projects: ops.projects.length,
      task_definitions: ops.operations.taskWindows.length,
      tasks_due_72h: tasks72h.length,
      qa_records: qa.records,
      qa_new_24h: qa.new24h,
      qa_new_without_first_reply_24h: qa.new24hWithoutFirstReply,
      qa_without_first_reply_total: qa.withoutFirstReply,
      qa_without_first_reply_48h: qa.withoutFirstReply48h,
      qa_metrics_window: {
        kind: "rolling_24h_at_collection",
        reference_at: ops.retrievedAt,
      },
      qa_time_warnings: qaWarnings,
      priority_projects: priorities,
      good_news_pending_ops_review: ops.operations.goodNews.stages.find((item) => item.stage === "待运营看稿")?.count || 0,
      data_complete: {
        tasks: ops.operations.collection.taskDefinitionsComplete,
        qa: ops.operations.collection.qaRecordsComplete,
        submission_trend: ops.operations.collection.submissionTrendStatus,
      },
      dashboard_url: "https://voyage-ops-workbench.heweimian.workers.dev/",
    }, { status: health.status === "degraded" ? 503 : 200 });
  } catch {
    return Response.json({ ok: false, status: "degraded", source_mode: "scys_mcp_only" }, { status: 503 });
  }
}
