export type PublicMcpProject = {
  id: string;
  name: string;
  type: string;
  platforms: string[];
  target: string;
  status: string;
  statusCode: number;
  isFull: boolean;
  joinCount: number;
  stock: number;
  enrollStart: string;
  enrollEnd: string;
  sailAt: string;
  endAt: string;
  avatar: string;
  taskCount: number;
  outputCount: number;
  outputCountAtBoundary?: boolean;
  reviewedCount?: number;
  unreviewedCount?: number;
  manualTocCount?: number;
  manualReadableCount?: number;
  qaTotal: number;
  qaOpen: number;
  qaResolved: number;
  qaPartialResults?: boolean;
  currentMilestone: string;
  currentDueAt: string;
  nextMilestone: string;
  nextDueAt: string;
  lastSubmissionAt: string;
  dataAsOf: string;
};

export type PublicMcpOpsSnapshot = {
  source: string;
  sourceMode: "scys_mcp_only";
  label: string;
  retrievedAt: string;
  dataAsOf: string;
  historicalPeriodCount: number;
  taskSchedule: {
    total: number;
    suggestedFinishElapsed: number;
    suggestedFinishUpcoming: number;
    allOpenAtRetrievedAt: boolean;
  };
  manualCoverage: { tocCount: number; readableCount: number };
  snapshotComparison: {
    previousRetrievedAt: string;
    joinDelta: number;
    outputDelta: number;
    qaOpenDelta: number;
  };
  goodNewsMapping: { available: boolean; reason: string };
  recentTimeline: { label: string; projects: number }[];
  sourceChecks: { tool: string; status: string; scope: string }[];
  projects: PublicMcpProject[];
};

export type McpHealthStatus = "healthy" | "stale" | "degraded";

export type McpHealthAssessment = {
  ok: boolean;
  status: McpHealthStatus;
  projectCount: number;
  retrievedAt: string | null;
  ageMs: number | null;
  sourceCheckCount: number;
  sourceCheckFailures: string[];
  sourceCheckLimitations: string[];
  issues: string[];
};

export const MCP_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function signedNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function projectMcpProject(value: unknown): PublicMcpProject | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  if (!id || !name) return null;

  const outputCountAtBoundary = typeof value.outputCountAtBoundary === "boolean"
    ? value.outputCountAtBoundary
    : undefined;
  const reviewedCount = optionalCount(value.reviewedCount);
  const unreviewedCount = optionalCount(value.unreviewedCount);
  const manualTocCount = optionalCount(value.manualTocCount);
  const manualReadableCount = optionalCount(value.manualReadableCount);
  const qaPartialResults = typeof value.qaPartialResults === "boolean" ? value.qaPartialResults : undefined;

  return {
    id,
    name,
    type: stringValue(value.type),
    platforms: stringArray(value.platforms),
    target: stringValue(value.target),
    status: stringValue(value.status),
    statusCode: numberValue(value.statusCode),
    isFull: value.isFull === true,
    joinCount: numberValue(value.joinCount),
    stock: numberValue(value.stock),
    enrollStart: stringValue(value.enrollStart),
    enrollEnd: stringValue(value.enrollEnd),
    sailAt: stringValue(value.sailAt),
    endAt: stringValue(value.endAt),
    avatar: stringValue(value.avatar),
    taskCount: numberValue(value.taskCount),
    outputCount: numberValue(value.outputCount),
    ...(outputCountAtBoundary === undefined ? {} : { outputCountAtBoundary }),
    ...(reviewedCount === undefined ? {} : { reviewedCount }),
    ...(unreviewedCount === undefined ? {} : { unreviewedCount }),
    ...(manualTocCount === undefined ? {} : { manualTocCount }),
    ...(manualReadableCount === undefined ? {} : { manualReadableCount }),
    qaTotal: numberValue(value.qaTotal),
    qaOpen: numberValue(value.qaOpen),
    qaResolved: numberValue(value.qaResolved),
    ...(qaPartialResults === undefined ? {} : { qaPartialResults }),
    currentMilestone: stringValue(value.currentMilestone),
    currentDueAt: stringValue(value.currentDueAt),
    nextMilestone: stringValue(value.nextMilestone),
    nextDueAt: stringValue(value.nextDueAt),
    lastSubmissionAt: stringValue(value.lastSubmissionAt),
    dataAsOf: stringValue(value.dataAsOf),
  };
}

function projectTimeline(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{ label: stringValue(item.label), projects: numberValue(item.projects) }];
  });
}

function projectSourceChecks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{
      tool: stringValue(item.tool),
      status: stringValue(item.status),
      scope: stringValue(item.scope),
    }];
  });
}

export function projectPublicMcpOps(value: unknown): PublicMcpOpsSnapshot | null {
  if (!isRecord(value) || value.sourceMode !== "scys_mcp_only") return null;

  const goodNewsMapping = isRecord(value.goodNewsMapping) ? value.goodNewsMapping : {};
  const taskSchedule = isRecord(value.taskSchedule) ? value.taskSchedule : {};
  const manualCoverage = isRecord(value.manualCoverage) ? value.manualCoverage : {};
  const snapshotComparison = isRecord(value.snapshotComparison) ? value.snapshotComparison : {};
  const projects = Array.isArray(value.projects)
    ? value.projects.flatMap((project) => {
      const safeProject = projectMcpProject(project);
      return safeProject ? [safeProject] : [];
    })
    : [];

  return {
    source: stringValue(value.source),
    sourceMode: "scys_mcp_only",
    label: stringValue(value.label),
    retrievedAt: stringValue(value.retrievedAt),
    dataAsOf: stringValue(value.dataAsOf),
    historicalPeriodCount: numberValue(value.historicalPeriodCount),
    taskSchedule: {
      total: numberValue(taskSchedule.total),
      suggestedFinishElapsed: numberValue(taskSchedule.suggestedFinishElapsed),
      suggestedFinishUpcoming: numberValue(taskSchedule.suggestedFinishUpcoming),
      allOpenAtRetrievedAt: taskSchedule.allOpenAtRetrievedAt === true,
    },
    manualCoverage: {
      tocCount: numberValue(manualCoverage.tocCount),
      readableCount: numberValue(manualCoverage.readableCount),
    },
    snapshotComparison: {
      previousRetrievedAt: stringValue(snapshotComparison.previousRetrievedAt),
      joinDelta: signedNumberValue(snapshotComparison.joinDelta),
      outputDelta: signedNumberValue(snapshotComparison.outputDelta),
      qaOpenDelta: signedNumberValue(snapshotComparison.qaOpenDelta),
    },
    goodNewsMapping: {
      available: goodNewsMapping.available === true,
      reason: stringValue(goodNewsMapping.reason),
    },
    recentTimeline: projectTimeline(value.recentTimeline),
    sourceChecks: projectSourceChecks(value.sourceChecks),
    projects,
  };
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase();
}

function sourceCheckKind(status: string): "healthy" | "limited" | "failed" {
  const normalized = normalizeStatus(status);
  if (["正常", "ok", "healthy", "pass", "passed"].includes(normalized)) return "healthy";
  if (["暂未开放", "未开放", "不适用", "not available", "not_available", "unsupported"].includes(normalized)) {
    return "limited";
  }
  return "failed";
}

export function assessMcpOpsHealth(
  value: unknown,
  nowMs = Date.now(),
  staleAfterMs = MCP_STALE_AFTER_MS,
): McpHealthAssessment {
  const ops = projectPublicMcpOps(value);
  if (!ops) {
    return {
      ok: false,
      status: "degraded",
      projectCount: 0,
      retrievedAt: null,
      ageMs: null,
      sourceCheckCount: 0,
      sourceCheckFailures: [],
      sourceCheckLimitations: [],
      issues: ["invalid_snapshot"],
    };
  }

  const failures: string[] = [];
  const limitations: string[] = [];
  for (const check of ops.sourceChecks) {
    const kind = sourceCheckKind(check.status);
    const label = check.tool || "unknown_tool";
    if (kind === "failed") failures.push(label);
    if (kind === "limited") limitations.push(label);
  }

  const issues: string[] = [];
  if (ops.projects.length === 0) issues.push("no_projects");
  if (ops.sourceChecks.length === 0) issues.push("no_source_checks");
  if (failures.length > 0) issues.push("source_check_failed");

  const retrievedAtMs = Date.parse(ops.retrievedAt);
  const hasValidRetrievedAt = Number.isFinite(retrievedAtMs);
  const ageMs = hasValidRetrievedAt ? Math.max(0, nowMs - retrievedAtMs) : null;
  if (!hasValidRetrievedAt) issues.push("invalid_retrieved_at");

  if (issues.length > 0) {
    return {
      ok: false,
      status: "degraded",
      projectCount: ops.projects.length,
      retrievedAt: ops.retrievedAt || null,
      ageMs,
      sourceCheckCount: ops.sourceChecks.length,
      sourceCheckFailures: failures,
      sourceCheckLimitations: limitations,
      issues,
    };
  }

  if (ageMs !== null && ageMs > staleAfterMs) {
    return {
      ok: false,
      status: "stale",
      projectCount: ops.projects.length,
      retrievedAt: ops.retrievedAt,
      ageMs,
      sourceCheckCount: ops.sourceChecks.length,
      sourceCheckFailures: failures,
      sourceCheckLimitations: limitations,
      issues: ["stale_data"],
    };
  }

  return {
    ok: true,
    status: "healthy",
    projectCount: ops.projects.length,
    retrievedAt: ops.retrievedAt,
    ageMs,
    sourceCheckCount: ops.sourceChecks.length,
    sourceCheckFailures: failures,
    sourceCheckLimitations: limitations,
    issues: [],
  };
}
