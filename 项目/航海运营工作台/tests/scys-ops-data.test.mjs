import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { daysRemaining, openQaPerHundred } from "../app/lib/data.ts";

const dataUrl = new URL("../examples/scys-ops-dashboard.public.json", import.meta.url);

test("MCP public snapshot has complete project aggregates", async () => {
  const snapshot = JSON.parse(await readFile(dataUrl, "utf8"));
  assert.equal(snapshot.sourceMode, "scys_mcp_only");
  assert.equal(snapshot.projects.length, 8);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.joinCount, 0), 21458);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.outputCount, 0), 48899);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.reviewedCount, 0), 61);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.unreviewedCount, 0), 48879);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.manualTocCount, 0), 346);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.manualReadableCount, 0), 247);
  assert.equal(snapshot.taskSchedule.suggestedFinishElapsed, 37);
  assert.equal(snapshot.taskSchedule.suggestedFinishUpcoming, 11);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.taskCount, 0), 48);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.qaTotal, 0), 5479);
  assert.equal(snapshot.projects.reduce((sum, item) => sum + item.qaOpen, 0), 5478);
  assert.equal(snapshot.projects.filter((item) => item.outputCountAtBoundary).length, 2);
});

test("MCP public snapshot excludes personal and chat fields", async () => {
  const raw = await readFile(dataUrl, "utf8");
  for (const forbidden of ["memberRef", "contentPreview", "sourceId", "dedupeKey", "group_name", "participant_name", "message_id", "evidence_ids"]) {
    assert.equal(raw.includes(forbidden), false, `must not contain ${forbidden}`);
  }
});

test("daysRemaining uses Shanghai calendar days instead of elapsed hours", () => {
  const project = { endAt: "2026-08-27T00:00:00+08:00" };

  assert.equal(daysRemaining(project, new Date("2026-08-20T00:01:00+08:00")), 7);
  assert.equal(daysRemaining(project, new Date("2026-08-20T23:59:59+08:00")), 7);
});

test("daysRemaining respects the Shanghai date across UTC boundaries", () => {
  const project = { endAt: "2026-08-27T23:00:00+08:00" };

  assert.equal(daysRemaining(project, new Date("2026-08-19T16:30:00Z")), 7);
  assert.equal(daysRemaining(project, new Date("2026-08-26T16:30:00Z")), 0);
});

test("daysRemaining clamps completed and invalid projects to zero", () => {
  assert.equal(daysRemaining({ endAt: "2026-08-19T12:00:00+08:00" }, new Date("2026-08-20T12:00:00+08:00")), 0);
  assert.equal(daysRemaining({ endAt: "not-a-date" }, new Date("2026-08-20T12:00:00+08:00")), 0);
});

test("openQaPerHundred uses pending questions instead of all visible questions", () => {
  assert.equal(openQaPerHundred({ joinCount: 200, qaTotal: 20, qaOpen: 12 }), 6);
});
