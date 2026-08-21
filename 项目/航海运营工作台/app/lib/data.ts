export type McpProject = {
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

export type TaskWindow = {
  projectId: string;
  taskId: string;
  title: string;
  startAt: string;
  endAt: string;
  suggestedFinishAt: string;
  sourceComplete: boolean;
};

export type QaTopicMetric = {
  topic: string;
  recent7d: number;
  awaitingFirstReply: number;
  awaitingFirstReply48h: number;
};

export type QaProjectMetric = {
  projectId: string;
  upstreamTotal: number;
  fetched: number;
  complete: boolean;
  partialResults: boolean;
  dataAsOf: string;
  new24h: number;
  new24hUnanswered: number;
  awaitingFirstReply: number;
  awaitingFirstReply48h: number;
  answeredButOpen: number;
  oldestUnansweredAt: string;
  topicBuckets: QaTopicMetric[];
};

export type GoodNewsStage = {
  stage: string;
  count: number;
};

export type ProjectDecision = {
  id: string;
  priority: "P1" | "P2" | "P3";
  projectId: string;
  riskScore: number;
  title: string;
  signals: string[];
  recommendation: string;
  dueAt: string;
  dataAsOf: string;
};

export type OperationsSnapshot = {
  taskWindows: TaskWindow[];
  qaProjects: QaProjectMetric[];
  goodNews: {
    candidateCount: number;
    verifiedCount: number;
    stages: GoodNewsStage[];
    note: string;
  };
  collection: {
    taskDefinitionsComplete: boolean;
    qaRecordsComplete: boolean;
    qaClassifierVersion: string;
    submissionTrendStatus: "unavailable" | "partial" | "complete";
    submissionTrendReason: string;
  };
};

export type McpOpsSnapshot = {
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
  projects: McpProject[];
  operations: OperationsSnapshot;
};

export type DashboardResponse = {
  ok: boolean;
  source_mode: string;
  updated_at: string | null;
  ops: McpOpsSnapshot | null;
  health_status?: "healthy" | "stale" | "degraded";
  health_issues?: string[];
  note?: string;
};

export const EMPTY_OPERATIONS: OperationsSnapshot = {
  taskWindows: [],
  qaProjects: [],
  goodNews: {
    candidateCount: 0,
    verifiedCount: 0,
    stages: [],
    note: "尚未建立人工核验台账。",
  },
  collection: {
    taskDefinitionsComplete: false,
    qaRecordsComplete: false,
    qaClassifierVersion: "",
    submissionTrendStatus: "unavailable",
    submissionTrendReason: "尚未采集任务级逐日提交数据。",
  },
};

export const EMPTY_OPS: McpOpsSnapshot = {
  source: "生财有术 MCP",
  sourceMode: "scys_mcp_only",
  label: "等待同步",
  retrievedAt: "",
  dataAsOf: "",
  historicalPeriodCount: 0,
  taskSchedule: { total: 0, suggestedFinishElapsed: 0, suggestedFinishUpcoming: 0, allOpenAtRetrievedAt: false },
  manualCoverage: { tocCount: 0, readableCount: 0 },
  snapshotComparison: { previousRetrievedAt: "", joinDelta: 0, outputDelta: 0, qaOpenDelta: 0 },
  goodNewsMapping: { available: false, reason: "等待 MCP 数据。" },
  recentTimeline: [],
  sourceChecks: [],
  projects: [],
  operations: EMPTY_OPERATIONS,
};

export function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function projectName(ops: McpOpsSnapshot, projectId: string) {
  return ops.projects.find((project) => project.id === projectId)?.name || `项目 ${projectId}`;
}

export function isActiveProject(project: McpProject, now = new Date()) {
  const endAt = Date.parse(project.endAt);
  return Number.isFinite(endAt) && endAt >= now.getTime() && project.status !== "已结束";
}

export function tasksDueWithin(ops: McpOpsSnapshot, withinHours = 72, now = new Date()) {
  const activeIds = new Set(ops.projects.filter((project) => isActiveProject(project, now)).map((project) => project.id));
  return ops.operations.taskWindows.filter((task) => {
    const dueAt = Date.parse(task.suggestedFinishAt);
    return activeIds.has(task.projectId)
      && Number.isFinite(dueAt)
      && dueAt >= now.getTime()
      && dueAt - now.getTime() <= withinHours * 3600000;
  });
}

export function hoursUntil(value: string, now = new Date()) {
  const target = Date.parse(value);
  if (!Number.isFinite(target)) return null;
  return (target - now.getTime()) / 3600000;
}

export function qaTotals(ops: McpOpsSnapshot) {
  return ops.operations.qaProjects.reduce((total, project) => ({
    visible: total.visible + project.upstreamTotal,
    new24h: total.new24h + project.new24h,
    new24hUnanswered: total.new24hUnanswered + project.new24hUnanswered,
    awaitingFirstReply: total.awaitingFirstReply + project.awaitingFirstReply,
    awaitingFirstReply48h: total.awaitingFirstReply48h + project.awaitingFirstReply48h,
    answeredButOpen: total.answeredButOpen + project.answeredButOpen,
  }), {
    visible: 0,
    new24h: 0,
    new24hUnanswered: 0,
    awaitingFirstReply: 0,
    awaitingFirstReply48h: 0,
    answeredButOpen: 0,
  });
}

export function qaTimeWarnings(ops: McpOpsSnapshot, maxLagHours = 36) {
  const retrievedAt = Date.parse(ops.retrievedAt);
  if (!Number.isFinite(retrievedAt)) return [];

  return ops.operations.qaProjects.flatMap((project) => {
    const dataAsOf = Date.parse(project.dataAsOf);
    if (!Number.isFinite(dataAsOf) || project.new24h === 0) return [];
    const lagHours = (retrievedAt - dataAsOf) / 3600000;
    if (lagHours <= maxLagHours) return [];
    return [{
      projectId: project.projectId,
      dataAsOf: project.dataAsOf,
      lagHours: Math.round(lagHours),
      issue: "recent_24h_metric_older_than_snapshot",
    }];
  });
}

export function buildProjectDecisions(ops: McpOpsSnapshot, now = new Date()): ProjectDecision[] {
  const qaByProject = new Map(ops.operations.qaProjects.map((item) => [item.projectId, item]));
  const activeProjectIds = new Set(ops.projects.filter((project) => isActiveProject(project, now)).map((project) => project.id));
  const tasksByProject = new Map<string, { task: TaskWindow; hours: number }>();

  for (const task of ops.operations.taskWindows) {
    if (!activeProjectIds.has(task.projectId)) continue;
    const hours = hoursUntil(task.suggestedFinishAt, now);
    if (hours === null || hours < -24 || hours > 72) continue;
    const current = tasksByProject.get(task.projectId);
    if (!current || hours < current.hours) tasksByProject.set(task.projectId, { task, hours });
  }

  return ops.projects.flatMap((project) => {
    const qa = qaByProject.get(project.id);
    const taskSignal = tasksByProject.get(project.id);
    const aged = qa?.awaitingFirstReply48h || 0;
    const recent = qa?.new24hUnanswered || 0;
    const taskScore = taskSignal ? (taskSignal.hours <= 24 ? 30 : 15) : 0;
    const riskScore = Math.min(50, aged * 2) + Math.min(20, recent * 4) + taskScore;
    if (riskScore === 0) return [];

    const signals: string[] = [];
    if (aged > 0) signals.push(`${formatInteger(aged)} 条问题超过 48h 未首答${qa?.oldestUnansweredAt ? `，最早 ${formatDate(qa.oldestUnansweredAt)}` : ""}`);
    if (recent > 0) signals.push(`最近 24h 新增 ${formatInteger(recent)} 条未首答`);
    if (taskSignal) signals.push(`${taskSignal.task.title} ${taskSignal.hours < 0 ? "刚过建议完成时间" : "进入 72h 提醒窗口"}`);

    const hasQaPressure = aged > 0 || recent > 0;
    const recommendation = hasQaPressure && taskSignal
      ? "先安排集中答疑，再核对关卡提醒"
      : aged > 0
        ? "安排集中答疑，优先清理 48h+"
        : recent > 0
          ? "安排今天首答"
          : "核对关卡提醒是否已发";
    const title = hasQaPressure && taskSignal ? "答疑积压 + 关卡临期" : hasQaPressure ? "答疑首答压力" : "关卡提醒临期";
    const priority: ProjectDecision["priority"] = riskScore >= 45 ? "P1" : riskScore >= 20 ? "P2" : "P3";

    return [{
      id: `decision-${project.id}`,
      priority,
      projectId: project.id,
      riskScore,
      title,
      signals,
      recommendation,
      dueAt: taskSignal?.task.suggestedFinishAt || "",
      dataAsOf: qa?.dataAsOf || ops.retrievedAt,
    }];
  }).sort((a, b) => b.riskScore - a.riskScore || Date.parse(a.dueAt || "9999") - Date.parse(b.dueAt || "9999"));
}
