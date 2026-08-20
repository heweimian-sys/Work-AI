import { env } from "cloudflare:workers";
import { assessMcpOpsHealth, MCP_STALE_AFTER_MS } from "../../lib/public-api-safety";

type HealthRow = { updated_at: string; ops_json: string };

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export async function GET() {
  try {
    const row = await env.DB.prepare(
      "SELECT updated_at, ops_json FROM scys_ops_snapshots WHERE snapshot_id = 'latest'"
    ).first<HealthRow>();

    const health = assessMcpOpsHealth(row ? parseJson(row.ops_json) : null);
    return Response.json({
      ok: health.ok,
      status: health.status,
      service: "voyage-ops-workbench",
      data_source: "scys_mcp_only",
      projects: health.projectCount,
      updated_at: row?.updated_at || null,
      retrieved_at: health.retrievedAt,
      data_age_seconds: health.ageMs === null ? null : Math.floor(health.ageMs / 1000),
      stale_after_seconds: MCP_STALE_AFTER_MS / 1000,
      source_checks: {
        total: health.sourceCheckCount,
        failed: health.sourceCheckFailures,
        limited: health.sourceCheckLimitations,
      },
      issues: health.issues,
    }, { status: health.status === "healthy" ? 200 : 503 });
  } catch {
    return Response.json({
      ok: false,
      status: "degraded",
      service: "voyage-ops-workbench",
      data_source: "scys_mcp_only",
      issues: ["health_check_failed"],
    }, { status: 503 });
  }
}
