/**
 * hermes-verify-fixes-v2.mjs — Ad-hoc verification of runtime fixes
 * (called after the first launch revealed 3 issues)
 *
 * Fixed files: agent/core.js, tools/file_content_extractor.js
 * Verifies: syntax, code structure, system prompt rules, unchanged biz
 */

import process from 'process';
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

process.env.LOG_LEVEL = 'error';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  \u2705 ${label}`);
    passed++;
  } else {
    console.log(`  \u274c ${label}`);
    failed++;
  }
}

const root = new URL('..', import.meta.url);
function rel(p) { return new URL(p, root).href; }

// ── 1. Syntax ────────────────────────────────
console.log('\n=== 1. Syntax of changed files ===');
for (const f of ['agent/core.js', 'tools/file_content_extractor.js', 'tools/index.js']) {
  try {
    execFileSync('node', ['--check', f], { cwd: process.cwd(), stdio: 'pipe', timeout: 10000 });
    assert(true, `${f} syntax OK`);
  } catch (e) {
    assert(false, `${f}: ${(e.stderr?.toString() || e.message).slice(0, 100)}`);
  }
}

// ── 2. file_content_extractor content ────────
console.log('\n=== 2. file_content_extractor ===');
const extPath = new URL('../tools/file_content_extractor.js', import.meta.url);
const extSrc = readFileSync(extPath, 'utf-8');

// no image_url in executable lines
const execLines = extSrc.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
assert(!execLines.some(l => l.includes('image_url')), 'no image_url in executable code');
assert(!extSrc.includes('data:image/'), 'no data:image/ base64 encoding');
assert(extSrc.includes('inferContentFromFileName'), 'has inferContentFromFileName');
assert(extSrc.includes('extractText'), 'exports extractText');
assert(extSrc.includes('downloadFromDrive'), 'has downloadFromDrive');
assert(!extSrc.includes('extractPDFWithAI'), 'removed PDF-specific function');
assert(!extSrc.includes('extractImageWithAI'), 'removed Image-specific function');

// ── 3. agent/core.js system prompt ───────────
console.log('\n=== 3. agent/core.js system prompt ===');
const corePath = new URL('../agent/core.js', import.meta.url);
const coreSrc = readFileSync(corePath, 'utf-8');
assert(coreSrc.includes('直接回复用户'), 'rule: 直接回复用户');
assert(coreSrc.includes('不要再调用任何工具'), 'rule: 不要再调用任何工具');
assert(coreSrc.includes('read_file_content'), 'rule: read_file_content gated');
assert(coreSrc.includes('不要连续调同一个工具'), 'rule: anti-spam');
assert(coreSrc.includes('用自然语言组织回复'), 'rule: natural language');
assert(coreSrc.includes('查询有结果时'), 'rule: 查询有结果时');

// ── 4. Tools module integration ─────────────
console.log('\n=== 4. Tools module ===');
const { getToolSchemas, executeToolCall } = await import(rel('tools/index.js'));
const schemas = getToolSchemas();
assert(schemas.length === 8, '8 tools in schema');

// check read_file_content schema
const rfc = schemas.find(s => s.function.name === 'read_file_content');
assert(rfc, 'read_file_content schema exists');
assert(rfc.function.parameters.properties.fileToken, 'has fileToken param');
assert(rfc.function.parameters.properties.fileName, 'has fileName param');

// smoke test handlers
const fb = JSON.parse(await executeToolCall('record_feedback', { feedback: 'positive' }));
assert(fb.success, 'record_feedback handler works');

const dg = JSON.parse(await executeToolCall('diagnose', { error: 'x', operation: 'y' }));
assert(dg.summary, 'diagnose returns summary');
assert(Array.isArray(dg.causes), 'diagnose returns causes');
assert(Array.isArray(dg.actions), 'diagnose returns actions');

// ── 5. Unchanged biz logic ──────────────────
console.log('\n=== 5. Unchanged biz logic ===');
const { searchMultiKeywords } = await import(rel('lib/bitable.js'));
const r = await searchMultiKeywords(['AI']);
assert(Array.isArray(r), 'searchMultiKeywords OK');

const { extractSearchKeywords, expandQueryKeywords } = await import(rel('lib/ai.js'));
assert(Array.isArray(await extractSearchKeywords('测试')), 'extractSearchKeywords OK');
assert(Array.isArray(await expandQueryKeywords('人工智能')), 'expandQueryKeywords OK');

const { handleEvent } = await import(rel('agent/core.js'));
assert(typeof handleEvent === 'function', 'handleEvent function');

// ── Summary ──────────────────────────────────
console.log(`\n========================`);
console.log(`  ${passed} / ${passed + failed} passed`);
console.log(`========================`);
process.exit(failed > 0 ? 1 : 0);
