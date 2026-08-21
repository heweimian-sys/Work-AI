import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildProjectDecisions, hoursUntil, qaTimeWarnings, qaTotals, tasksDueWithin } from "../app/lib/data.ts";

const dataUrl = new URL("../examples/scys-ops-dashboard.public.json", import.meta.url);

async function readSnapshot() {
  return JSON.parse(await readFile(dataUrl, "utf8"));
}

test("MCP operations snapshot contains complete task and QA aggregates", async () => {
  const snapshot = await readSnapshot();
  const totals = qaTotals(snapshot);

  assert.equal(snapshot.sourceMode, "scys_mcp_only");
  assert.equal(snapshot.projects.length, 8);
  assert.equal(snapshot.operations.taskWindows.length, 48);
  assert.equal(snapshot.operations.collection.taskDefinitionsComplete, true);
  assert.equal(snapshot.operations.collection.qaRecordsComplete, true);
  assert.equal(snapshot.operations.collection.submissionTrendStatus, "unavailable");
  assert.equal(totals.visible, 5814);
  assert.equal(totals.new24h, 342);
  assert.equal(totals.new24hUnanswered, 16);
  assert.equal(totals.awaitingFirstReply, 103);
  assert.equal(totals.awaitingFirstReply48h, 66);
  assert.equal(totals.answeredButOpen, 5710);
});

test("MCP operations snapshot does not manufacture good-news candidates", async () => {
  const snapshot = await readSnapshot();
  const stages = Object.fromEntries(snapshot.operations.goodNews.stages.map((row) => [row.stage, row.count]));

  assert.equal(snapshot.operations.goodNews.candidateCount, 0);
  assert.equal(snapshot.operations.goodNews.verifiedCount, 0);
  assert.equal(stages["待运营看稿"], 0);
  assert.match(snapshot.operations.goodNews.note, /人工|运营/);
});

test("MCP public snapshot excludes personal, raw content, and evidence fields", async () => {
  const raw = await readFile(dataUrl, "utf8");
  for (const forbidden of ["memberRef", "contentPreview", "sourceId", "dedupeKey", "group_name", "participant_name", "message_id", "evidence_ids", "answers"]) {
    assert.equal(raw.includes(forbidden), false, `must not contain ${forbidden}`);
  }
});

test("task timing uses exact timestamps", () => {
  const now = new Date("2026-08-21T12:00:00+08:00");
  assert.equal(hoursUntil("2026-08-21T20:00:00+08:00", now), 8);
  assert.equal(hoursUntil("2026-08-20T12:00:00+08:00", now), -24);
  assert.equal(hoursUntil("invalid", now), null);
});

test("future 72 hour tasks use a shared real-time contract", async () => {
  const snapshot = await readSnapshot();
  const now = new Date(snapshot.retrievedAt);
  const tasks = tasksDueWithin(snapshot, 72, now);

  assert.deepEqual(tasks.map((task) => task.taskId).sort(), ["88083", "88088", "88097"]);
});

test("QA time warnings expose inconsistent recent metrics without hiding them", async () => {
  const snapshot = await readSnapshot();
  const warnings = qaTimeWarnings(snapshot);

  assert.deepEqual(warnings, [{
    projectId: "10092",
    dataAsOf: "2026-08-18T10:07:00.000Z",
    lagHours: 67,
    issue: "recent_24h_metric_older_than_snapshot",
  }]);
});

test("project decisions merge task and QA signals before ranking", async () => {
  const snapshot = await readSnapshot();
  const decisions = buildProjectDecisions(snapshot, new Date(snapshot.retrievedAt));

  assert.equal(new Set(decisions.map((item) => item.projectId)).size, decisions.length);
  assert.equal(decisions[0].projectId, "10096");
  assert.equal(decisions[0].priority, "P1");
  assert.match(decisions[0].recommendation, /答疑/);
  assert.ok(decisions[0].signals.some((signal) => signal.includes("关卡")));
});
