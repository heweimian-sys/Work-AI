import { cp, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const clientDir = join(distDir, "client");
const serverDir = join(distDir, "server");

async function copyChildren(fromDir, toDir, options = {}) {
  const entries = await readdir(fromDir, { withFileTypes: true });

  for (const entry of entries) {
    if (options.skip?.has(entry.name)) continue;

    await cp(join(fromDir, entry.name), join(toDir, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

// Cloudflare Pages advanced mode expects a Worker entry at the output root.
// Vinext builds the Worker-shaped server into dist/server/index.js and keeps
// static assets in dist/client. Pages serves dist as the upload directory, so
// we merge both trees into dist and expose the server entry as _worker.js.
await copyChildren(serverDir, distDir, { skip: new Set(["index.js"]) });
await copyChildren(clientDir, distDir);
await copyFile(join(serverDir, "index.js"), join(distDir, "_worker.js"));
await copyFile(join(serverDir, "index.js"), join(distDir, "index.js"));

console.log("Cloudflare Pages output ready: dist/_worker.js + dist/index.js + merged assets");
