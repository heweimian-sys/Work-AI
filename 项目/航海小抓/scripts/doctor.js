/**
 * Agent doctor: one command to verify the critical runtime chain.
 *
 * Checks:
 * - Required environment variables.
 * - Syntax of core modules.
 * - Bitable/library health audit.
 * - Shengcai MCP manual-chain dry-run.
 * - Knowledge export smoke test.
 */

import 'dotenv/config';
import { execFileSync } from 'child_process';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { auditLibrary } from '../tools/library_audit.js';
import { syncScysMcpMaterials } from '../tools/mcp_sync.js';

const CHECK_FILES = [
  'agent/core.js',
  'tools/index.js',
  'tools/mcp_sync.js',
  'tools/library_audit.js',
  'scripts/export-knowledge.js',
];

const REQUIRED_ENV = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'BITABLE_APP_TOKEN',
  'BITABLE_TABLE_ID',
  'DRIVE_FOLDER_TOKEN',
  'OPENAI_API_KEY',
];

const OPTIONAL_ENV = [
  'SCYS_MCP_TOKEN',
];

function runStep(results, name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(data => {
      results.push({ name, ok: true, ...data });
    })
    .catch(err => {
      results.push({ name, ok: false, error: err.message });
    });
}

function syntaxCheck() {
  const checked = [];
  for (const file of CHECK_FILES) {
    execFileSync('node', ['--check', file], { stdio: 'pipe', timeout: 15000 });
    checked.push(file);
  }
  return { checked };
}

function envCheck() {
  const missingRequired = REQUIRED_ENV.filter(name => !process.env[name]);
  const missingOptional = OPTIONAL_ENV.filter(name => !process.env[name]);
  if (missingRequired.length) {
    throw new Error(`缺少必要环境变量：${missingRequired.join(', ')}`);
  }
  return { missingOptional };
}

async function mcpManualCheck() {
  if (!process.env.SCYS_MCP_TOKEN) {
    return { skipped: true, reason: 'SCYS_MCP_TOKEN 未配置' };
  }
  const result = await syncScysMcpMaterials({
    mode: 'manual_chapters',
    dryRun: true,
    activityLimit: 1,
    chapterLimit: 2,
    limit: 2,
  });
  if (!result.success || (result.total || 0) === 0 || (result.failed || 0) > 0) {
    throw new Error(`MCP航海手册 dryRun 异常 total=${result.total || 0} failed=${result.failed || 0}`);
  }
  return {
    total: result.total || 0,
    samples: (result.samples || []).slice(0, 3),
  };
}

async function exportCheck() {
  const outDir = path.resolve('exports', 'doctor-smoke');
  await mkdir(outDir, { recursive: true });
  execFileSync('node', ['scripts/export-knowledge.js', '--limit=5', `--out=${outDir}`], {
    stdio: 'pipe',
    timeout: 120000,
  });
  const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf-8'));
  if (!manifest.success || manifest.exported <= 0) {
    throw new Error(`知识包导出异常 exported=${manifest.exported || 0}`);
  }
  return {
    outDir,
    exported: manifest.exported,
  };
}

function printReport(results) {
  const failed = results.filter(item => !item.ok);
  console.log('\n航海小抓 Agent Doctor');
  console.log('====================');
  for (const item of results) {
    const mark = item.ok ? 'OK' : 'FAIL';
    console.log(`${mark} ${item.name}`);
    if (item.error) console.log(`  ${item.error}`);
    if (item.skipped) console.log(`  skipped: ${item.reason}`);
    if (item.total != null) console.log(`  total: ${item.total}`);
    if (item.exported != null) console.log(`  exported: ${item.exported}`);
  }
  console.log('====================');
  console.log(failed.length ? `失败 ${failed.length} 项` : '全部关键检查通过');
}

const results = [];

await runStep(results, '环境变量', () => envCheck());
await runStep(results, '核心语法', () => syntaxCheck());
await runStep(results, '资料库体检', async () => {
  const audit = await auditLibrary({ limit: 1000 });
  return {
    total: audit.total,
    searchReadyRate: audit.searchReadyRate,
    pendingCount: audit.pendingCount,
  };
});
await runStep(results, 'MCP航海手册 dryRun', () => mcpManualCheck());
await runStep(results, '知识包导出 smoke test', () => exportCheck());

printReport(results);
process.exit(results.some(item => !item.ok) ? 1 : 0);
