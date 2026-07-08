/**
 * hermes-verify-phase3.mjs — Ad-hoc verification of Phase 3 Agent architecture
 *
 * Tests:
 *   1. All changed files parse correctly (syntax check)
 *   2. getToolSchemas() — 10 tools with correct JSON schema
 *   3. executeToolCall() — handler routing works
 *   4. Unchanged biz logic still works (Bitable queries, AI keyword extraction)
 *   5. Module exports for new files
 *
 * Run from project root: node scripts/verify-phase3.mjs
 */

import process from 'process';
import 'dotenv/config';
import { execFileSync } from 'child_process';

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

// Resolve project-relative imports using URL
const root = new URL('..', import.meta.url);

function rel(path) {
  return new URL(path, root).href;
}

// ─── Test 1: Syntax check ──────────────────────
console.log('\n=== Test 1: Syntax check for all source files ===');
const changedFiles = [
  'agent/core.js', 'bot/index.js', 'bot/query.js', 'bot/archive.js',
  'tools/index.js', 'tools/chat_scanner.js', 'tools/file_content_extractor.js',
  'tools/cleanup.js', 'tools/group_organizer.js', 'tools/continue.js',
  'tools/diagnose.js', 'tools/send-message.js', 'lib/bitable.js', 'lib/ai.js',
  'memory/session.js',
];
for (const f of changedFiles) {
  try {
    execFileSync('node', ['--check', f], { cwd: process.cwd(), stdio: 'pipe', timeout: 10000 });
    assert(true, `${f} passes syntax check`);
  } catch (e) {
    const stderr = e.stderr?.toString()?.slice(0, 120) || e.message;
    assert(false, `${f}: ${stderr.replace(/\n/g, ' ')}`);
  }
}

// ─── Test 2: Tool schemas ───────────────────────
console.log('\n=== Test 2: getToolSchemas() ===');
const { getToolSchemas, executeToolCall } = await import(rel('tools/index.js'));
const schemas = getToolSchemas();
assert(Array.isArray(schemas), 'schemas is array');
assert(schemas.length === 10, `10 tools defined, got ${schemas.length}`);

const names = schemas.map(s => s.function.name);
const expected = [
  'archive_file', 'archive_link', 'query_knowledge', 'continue_query',
  'read_file_content', 'scan_chat_history', 'diagnose', 'record_feedback',
  'cleanup_table', 'organize_by_group',
];
for (const n of expected) {
  assert(names.includes(n), `tool "${n}" exists`);
}

const querySchema = schemas.find(s => s.function.name === 'query_knowledge');
assert(querySchema.function.parameters.properties.query, 'query_knowledge has query param');
assert(querySchema.function.description.length > 10, 'query_knowledge has description');

const archiveSchema = schemas.find(s => s.function.name === 'archive_file');
assert(archiveSchema.function.parameters.required.includes('messageId'), 'archive_file requires messageId');
assert(archiveSchema.function.parameters.properties.fileName, 'archive_file has fileName param');

const scanSchema = schemas.find(s => s.function.name === 'scan_chat_history');
assert(scanSchema.function.parameters.properties.chatId, 'scan_chat_history has chatId param');
assert(scanSchema.function.parameters.properties.limit, 'scan_chat_history has limit param default');

// ─── Test 3: Handler routing ────────────────────
console.log('\n=== Test 3: executeToolCall handler routing ===');

// record_feedback
try {
  const result = await executeToolCall('record_feedback', { feedback: 'positive', note: 'test' });
  const parsed = JSON.parse(result);
  assert(parsed.success === true, 'record_feedback returns success');
} catch (err) {
  assert(false, `record_feedback: ${err.message}`);
}

// diagnose
try {
  const result = await executeToolCall('diagnose', { error: 'test error', operation: 'test', context: { x: 1 } });
  const parsed = JSON.parse(result);
  assert(parsed.summary, 'diagnose returns summary field');
  assert(Array.isArray(parsed.causes), 'diagnose returns causes array');
  assert(Array.isArray(parsed.actions), 'diagnose returns actions array');
} catch (err) {
  assert(false, `diagnose: ${err.message}`);
}

// unknown tool throws
try {
  await executeToolCall('does_not_exist', {});
  assert(false, 'should have thrown');
} catch (err) {
  assert(err.message.includes('未知工具'), `unknown tool error correct: "${err.message.slice(0, 50)}"`);
}

// ─── Test 4: Unchanged biz logic ────────────────
console.log('\n=== Test 4: Unchanged biz logic ===');

const { searchMultiKeywords } = await import(rel('lib/bitable.js'));
const bitableResults = await searchMultiKeywords(['AI']);
assert(Array.isArray(bitableResults), 'searchMultiKeywords returns array');
if (bitableResults.length > 0) {
  assert(bitableResults[0].fields?.['文件名'], 'results have 文件名 field');
}

const { extractSearchKeywords, expandQueryKeywords } = await import(rel('lib/ai.js'));
const keywords = await extractSearchKeywords('AI沙龙PPT');
assert(Array.isArray(keywords) && keywords.length > 0, 'extractSearchKeywords works');

const expanded = await expandQueryKeywords('人工智能');
assert(Array.isArray(expanded), 'expandQueryKeywords works');

const { log } = await import(rel('lib/feishu.js'));
assert(typeof log === 'function', 'log is a function');

// searchMultiField backward compat
const { searchMultiField } = await import(rel('lib/bitable.js'));
const mfResults = await searchMultiField('AI');
assert(Array.isArray(mfResults), 'searchMultiField still works');

// ─── Test 5: New files ──────────────────────────
console.log('\n=== Test 5: New files module exports ===');

const scanner = await import(rel('tools/chat_scanner.js'));
assert(typeof scanner.scanChatHistory === 'function', 'scanChatHistory exported');
assert(scanner.scanChatHistory.constructor.name === 'AsyncFunction', 'scanChatHistory is async');

const extractor = await import(rel('tools/file_content_extractor.js'));
assert(typeof extractor.extractText === 'function', 'extractText exported');
assert(extractor.extractText.constructor.name === 'AsyncFunction', 'extractText is async');

const agent = await import(rel('agent/core.js'));
assert(typeof agent.handleEvent === 'function', 'handleEvent is function');

// ─── Summary ──────────────────────────────────
console.log(`\n============================`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`============================`);
process.exit(failed > 0 ? 1 : 0);
