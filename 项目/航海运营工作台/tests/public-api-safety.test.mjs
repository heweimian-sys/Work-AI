import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_STALE_AFTER_MS,
  assessMcpOpsHealth,
  projectPublicMcpOps,
} from "../app/lib/public-api-safety.ts";

function snapshot(overrides = {}) {
  return {
    source: "生财有术 MCP",
    sourceMode: "scys_mcp_only",
    label: "2026年8月实战活动",
    retrievedAt: "2026-08-20T01:03:00+08:00",
    dataAsOf: "2026-08-19T17:40:47+08:00",
    historicalPeriodCount: 37,
    taskSchedule: {
      total: 6,
      suggestedFinishElapsed: 5,
      suggestedFinishUpcoming: 1,
      allOpenAtRetrievedAt: true,
    },
    manualCoverage: { tocCount: 30, readableCount: 18 },
    snapshotComparison: {
      previousRetrievedAt: "2026-08-20T00:00:00+08:00",
      joinDelta: 0,
      outputDelta: 5,
      qaOpenDelta: -1,
    },
    goodNewsMapping: { available: false, reason: "尚无可验证映射" },
    recentTimeline: [{ label: "2026年8月", projects: 1 }],
    sourceChecks: [
      { tool: "activityList", status: "正常", scope: "项目聚合", content: "secret" },
      { tool: "观远 BI 卡片", status: "暂未开放", scope: "无卡片" },
    ],
    projects: [{
      id: "10092",
      name: "AI 产品",
      type: "常规航海",
      platforms: ["AI", { content: "secret" }],
      target: "完成项目",
      status: "进行中",
      statusCode: 3,
      isFull: false,
      joinCount: 100,
      stock: 0,
      enrollStart: "2026-07-22T20:00:00+08:00",
      enrollEnd: "2026-07-27T23:59:59+08:00",
      sailAt: "2026-08-05T20:00:00+08:00",
      endAt: "2026-08-27T20:00:00+08:00",
      avatar: "https://example.test/avatar.png",
      taskCount: 6,
      outputCount: 75,
      reviewedCount: 60,
      unreviewedCount: 15,
      manualTocCount: 30,
      manualReadableCount: 18,
      qaTotal: 12,
      qaOpen: 10,
      qaResolved: 2,
      qaPartialResults: true,
      currentMilestone: "关卡 5",
      currentDueAt: "2026-08-19T23:59:59+08:00",
      nextMilestone: "关卡 6",
      nextDueAt: "2026-08-21T23:59:59+08:00",
      lastSubmissionAt: "2026-08-20T00:59:29+08:00",
      dataAsOf: "2026-08-19T17:40:47+08:00",
      author: "private member",
      content: "private output",
      sourceId: "private-source-id",
      evidence: { message: "private evidence" },
    }],
    operations: {
      taskWindows: [{
        projectId: "10092",
        taskId: "88083",
        title: "关卡 5：提交网站上线结果",
        startAt: "2026-08-05T16:00:00Z",
        endAt: "2026-08-26T15:59:59Z",
        suggestedFinishAt: "2026-08-21T15:59:59Z",
        sourceComplete: true,
        content: "private task content",
      }],
      qaProjects: [{
        projectId: "10092",
        upstreamTotal: 12,
        fetched: 12,
        complete: true,
        partialResults: false,
        dataAsOf: "2026-08-20T01:00:00+08:00",
        new24h: 3,
        new24hUnanswered: 1,
        awaitingFirstReply: 2,
        awaitingFirstReply48h: 1,
        answeredButOpen: 10,
        oldestUnansweredAt: "2026-08-17T01:00:00+08:00",
        topicBuckets: [{ topic: "技术报错与部署", recent7d: 5, awaitingFirstReply: 2, awaitingFirstReply48h: 1, questionText: "private question" }],
        memberRef: "private member ref",
      }],
      goodNews: {
        candidateCount: 0,
        verifiedCount: 0,
        stages: [{ stage: "待运营看稿", count: 0 }, { stage: "非法状态", count: 99 }],
        note: "等待人工判断",
        evidence: "private evidence",
      },
      collection: {
        taskDefinitionsComplete: true,
        qaRecordsComplete: true,
        qaClassifierVersion: "ops-topic-v1",
        submissionTrendStatus: "unavailable",
        submissionTrendReason: "没有完整任务级历史",
      },
    },
    author: "private member",
    content: "private snapshot content",
    sourceId: "private-snapshot-id",
    ...overrides,
  };
}

test("public projection recursively strips fields outside the explicit allowlist", () => {
  const projected = projectPublicMcpOps(snapshot());

  assert.ok(projected);
  assert.equal(projected.projects[0].reviewedCount, 60);
  assert.equal(projected.projects[0].unreviewedCount, 15);
  assert.equal(projected.projects[0].manualReadableCount, 18);
  assert.equal(projected.projects[0].qaPartialResults, true);
  assert.equal(projected.taskSchedule.suggestedFinishElapsed, 5);
  assert.equal(projected.manualCoverage.readableCount, 18);
  assert.equal(projected.snapshotComparison.qaOpenDelta, -1);
  assert.deepEqual(projected.projects[0].platforms, ["AI"]);
  assert.equal(projected.operations.taskWindows.length, 1);
  assert.equal(projected.operations.qaProjects[0].awaitingFirstReply48h, 1);
  assert.deepEqual(projected.operations.goodNews.stages, [{ stage: "待运营看稿", count: 0 }]);

  const serialized = JSON.stringify(projected);
  for (const forbidden of ["author", "content", "sourceId", "evidence", "memberRef", "questionText", "private member", "private output", "非法状态"]) {
    assert.equal(serialized.includes(forbidden), false, `must not expose ${forbidden}`);
  }
});

test("public projection drops plausible unknown personal fields before D1 sync", () => {
  const projected = projectPublicMcpOps(snapshot({
    email: "member@example.test",
    userName: "private member",
    projects: [{ ...snapshot().projects[0], questionText: "private question", contact: "private contact" }],
  }));

  const serialized = JSON.stringify(projected);
  for (const forbidden of ["email", "userName", "questionText", "contact", "member@example.test", "private question"]) {
    assert.equal(serialized.includes(forbidden), false, `must not expose ${forbidden}`);
  }
});

test("public projection rejects snapshots outside the MCP-only contract", () => {
  assert.equal(projectPublicMcpOps(snapshot({ sourceMode: "group_chat" })), null);
  assert.equal(projectPublicMcpOps(null), null);
  assert.equal(projectPublicMcpOps(snapshot({ operations: undefined })), null);
  assert.equal(projectPublicMcpOps(snapshot({ operations: {
    ...snapshot().operations,
    qaProjects: [{ ...snapshot().operations.qaProjects[0], topicBuckets: [{ topic: "成员的具体问题标题", recent7d: 1 }] }],
  } })), null);
});

test("health rejects an empty operations payload instead of claiming healthy", () => {
  const raw = snapshot();
  raw.operations = {
    ...raw.operations,
    taskWindows: [],
    qaProjects: [],
    collection: { ...raw.operations.collection, taskDefinitionsComplete: false, qaRecordsComplete: false },
  };
  const health = assessMcpOpsHealth(raw, Date.parse("2026-08-20T12:00:00+08:00"));

  assert.equal(health.status, "degraded");
  assert.equal(health.ok, false);
  assert.deepEqual(health.issues, ["incomplete_task_definitions", "incomplete_qa_records"]);
});

test("health is healthy only for fresh projects with non-failing source checks", () => {
  const now = Date.parse("2026-08-20T12:00:00+08:00");
  const health = assessMcpOpsHealth(snapshot(), now);

  assert.equal(health.status, "healthy");
  assert.equal(health.ok, true);
  assert.equal(health.projectCount, 1);
  assert.deepEqual(health.sourceCheckLimitations, ["观远 BI 卡片"]);
  assert.deepEqual(health.sourceCheckFailures, []);
});

test("health reports stale data instead of claiming it is normal", () => {
  const now = Date.parse("2026-08-20T01:03:00+08:00") + MCP_STALE_AFTER_MS + 1;
  const health = assessMcpOpsHealth(snapshot(), now);

  assert.equal(health.status, "stale");
  assert.equal(health.ok, false);
  assert.deepEqual(health.issues, ["stale_data"]);
});

test("health reports failed checks, empty projects, and invalid timestamps as degraded", () => {
  const abnormal = assessMcpOpsHealth(snapshot({
    retrievedAt: "invalid",
    projects: [],
    sourceChecks: [{ tool: "searchActivityOutputs", status: "失败", scope: "产出聚合" }],
  }));

  assert.equal(abnormal.status, "degraded");
  assert.equal(abnormal.ok, false);
  assert.deepEqual(abnormal.sourceCheckFailures, ["searchActivityOutputs"]);
  assert.deepEqual(abnormal.issues, ["no_projects", "source_check_failed", "invalid_retrieved_at"]);
});
