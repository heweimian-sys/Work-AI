import { access, readFile } from "node:fs/promises";
import { register } from "node:module";

const workerPath = new URL("../dist/server/index.js", import.meta.url);
const hostingPath = new URL("../dist/.openai/hosting.json", import.meta.url);
const loaderPath = new URL("../tests/cloudflare-loader.mjs", import.meta.url);

await Promise.all([access(workerPath), access(hostingPath), access(loaderPath)]);
JSON.parse(await readFile(hostingPath, "utf8"));
register(loaderPath);

workerPath.searchParams.set("artifact-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerPath.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must export default.fetch");
}

process.stdout.write("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.\n");
