import { env } from "cloudflare:workers";
import { assessMcpOpsHealth, projectPublicMcpOps } from "../../lib/public-api-safety";

type SnapshotRow = {
  ops_json: string;
  updated_at: string;
};

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export async function GET() {
  const snapshot = await env.DB.prepare(
    "SELECT ops_json, updated_at FROM scys_ops_snapshots WHERE snapshot_id = 'latest'"
  ).first<SnapshotRow>();

  if (!snapshot) {
    return Response.json({ ok: true, source_mode: "scys_mcp_only", updated_at: null, ops: null });
  }

  const rawSnapshot = parseJson(snapshot.ops_json);
  const ops = projectPublicMcpOps(rawSnapshot);
  if (!ops) {
    return Response.json({
      ok: false,
      source_mode: "scys_mcp_only",
      updated_at: snapshot.updated_at,
      ops: null,
      error: "invalid_mcp_snapshot",
    }, { status: 503 });
  }

  const health = assessMcpOpsHealth(rawSnapshot);

  return Response.json({
    ok: true,
    source_mode: "scys_mcp_only",
    updated_at: snapshot.updated_at,
    ops,
    health_status: health.status,
    health_issues: health.issues,
    note: "公开工作台仅包含生财 MCP 的项目级安全聚合，不含成员、作业原文、问答原文或群聊数据。",
  });
}
