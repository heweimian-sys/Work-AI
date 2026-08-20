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
};

export function sum(projects: McpProject[], field: "joinCount" | "outputCount" | "reviewedCount" | "unreviewedCount" | "taskCount" | "qaTotal" | "qaOpen" | "qaResolved" | "manualTocCount" | "manualReadableCount") {
  return projects.reduce((total, project) => total + (project[field] ?? 0), 0);
}

export function outputDensity(project: McpProject) {
  return project.joinCount ? project.outputCount / project.joinCount : 0;
}

export function openQaPerHundred(project: McpProject) {
  return project.joinCount ? (project.qaOpen / project.joinCount) * 100 : 0;
}

export function reviewCoverage(project: McpProject) {
  const reviewed = project.reviewedCount ?? 0;
  const counted = reviewed + (project.unreviewedCount ?? 0);
  return counted ? (reviewed / counted) * 100 : 0;
}

function shanghaiCalendarDay(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const valueByPart = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return Date.UTC(Number(valueByPart.year), Number(valueByPart.month) - 1, Number(valueByPart.day));
}

export function daysRemaining(project: McpProject, now = new Date()) {
  const endAt = new Date(project.endAt);
  if (Number.isNaN(endAt.getTime()) || Number.isNaN(now.getTime())) return 0;

  return Math.max(0, Math.round((shanghaiCalendarDay(endAt) - shanghaiCalendarDay(now)) / 86400000));
}

export function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
