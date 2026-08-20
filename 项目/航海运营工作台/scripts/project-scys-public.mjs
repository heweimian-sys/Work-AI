import { readFile, writeFile } from "node:fs/promises";

import { projectPublicMcpOps } from "../app/lib/public-api-safety.ts";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/project-scys-public.mjs <input.json> <output.json>");
}

const raw = JSON.parse(await readFile(inputPath, "utf8"));
const projected = projectPublicMcpOps(raw);
if (!projected || !projected.retrievedAt || projected.projects.length === 0) {
  throw new Error("MCP snapshot is invalid or has no projects");
}

await writeFile(outputPath, JSON.stringify(projected), "utf8");
process.stdout.write(JSON.stringify({
  source_mode: projected.sourceMode,
  projects: projected.projects.length,
  retrieved_at: projected.retrievedAt,
  safe_projection: true,
}));
