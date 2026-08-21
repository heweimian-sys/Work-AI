import { readFile, writeFile } from "node:fs/promises";

import { assessMcpOpsHealth, projectPublicMcpOps } from "../app/lib/public-api-safety.ts";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/project-scys-public.mjs <input.json> <output.json>");
}

const raw = JSON.parse(await readFile(inputPath, "utf8"));
const projected = projectPublicMcpOps(raw);
if (!projected || !projected.retrievedAt || projected.projects.length === 0) {
  throw new Error("MCP snapshot is invalid or has no projects");
}

const projectIds = new Set(projected.projects.map((project) => project.id));
const taskIds = new Set(projected.operations.taskWindows.map((task) => task.taskId));
const qaProjectIds = new Set(projected.operations.qaProjects.map((project) => project.projectId));
const expectedTasks = projected.projects.reduce((sum, project) => sum + project.taskCount, 0);
const contractValid = projected.operations.collection.taskDefinitionsComplete
  && projected.operations.collection.qaRecordsComplete
  && projected.operations.taskWindows.length === expectedTasks
  && taskIds.size === projected.operations.taskWindows.length
  && projected.operations.taskWindows.every((task) => projectIds.has(task.projectId) && task.sourceComplete)
  && projected.operations.qaProjects.length === projected.projects.length
  && qaProjectIds.size === projected.operations.qaProjects.length
  && projected.operations.qaProjects.every((project) => projectIds.has(project.projectId)
    && project.complete
    && !project.partialResults
    && project.fetched === project.upstreamTotal);

if (!contractValid) {
  throw new Error("MCP snapshot operations contract is incomplete; previous D1 snapshot was preserved");
}

const health = assessMcpOpsHealth(projected);
if (health.status === "degraded") {
  throw new Error(`MCP snapshot health check failed: ${health.issues.join(",")}`);
}

await writeFile(outputPath, JSON.stringify(projected), "utf8");
process.stdout.write(JSON.stringify({
  source_mode: projected.sourceMode,
  projects: projected.projects.length,
  retrieved_at: projected.retrievedAt,
  tasks: projected.operations.taskWindows.length,
  qa_records: projected.operations.qaProjects.reduce((sum, project) => sum + project.fetched, 0),
  safe_projection: true,
}));
