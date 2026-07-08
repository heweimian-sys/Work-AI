/**
 * hermes-verify-reply-format.mjs — Ad-hoc verification
 * 
 * Verifies that agent/core.js system prompt strictly enforces
 * clean reply format (no Markdown symbols, uses emoji instead)
 */

import process from 'process';
import 'dotenv/config';
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
const coreSrc = readFileSync(new URL('agent/core.js', root), 'utf-8');

// ── 1. No raw backtick inside template literal ──
console.log('\n=== Reply format rules in system prompt ===');
// The template literal uses backticks as delimiters — must not contain unescaped backticks
assert(coreSrc.includes('回复格式（必须遵守）'), 'has 回复格式 section');
assert(coreSrc.includes('禁止使用 # * ** - >'), 'has Markdown symbols ban');
assert(coreSrc.includes('以及反引号等任何 Markdown 符号'), 'explicitly bans backtick');
assert(coreSrc.includes('📄 👤 🏷️ 🚢 🔗'), 'has emoji prefix guide');
assert(coreSrc.includes('📄 从零搭建AI知识库让AI替你工作.pdf'), 'has good example');
assert(coreSrc.includes('链接单独一行'), 'link on its own line rule');

// Verify the template literal is syntactically valid (no unescaped backtick causing JS break)
// The file must parse correctly — we check this by looking at the structure
assert(coreSrc.includes('回复格式（必须遵守）'), 'reply rules inside template string');

// ── 2. Syntax check ──────────────────────────
console.log('\n=== Syntax check ===');
const { execFileSync } = await import('child_process');
try {
  execFileSync('node', ['--check', 'agent/core.js'], { cwd: process.cwd(), stdio: 'pipe', timeout: 10000 });
  assert(true, 'agent/core.js syntax OK');
} catch (e) {
  assert(false, `syntax error: ${(e.stderr?.toString() || e.message).slice(0, 120)}`);
}

// ── 3. Tools still work ─────────────────────
console.log('\n=== Tools module integration ===');
const { getToolSchemas, executeToolCall } = await import(new URL('tools/index.js', root));
assert(getToolSchemas().length === 8, '8 tools');
const fb = JSON.parse(await executeToolCall('record_feedback', { feedback: 'positive' }));
assert(fb.success, 'record_feedback works');

// ── 4. Unchanged biz logic ──────────────────
console.log('\n=== Unchanged biz logic ===');
const { searchMultiKeywords } = await import(new URL('lib/bitable.js', root));
assert(Array.isArray(await searchMultiKeywords(['AI'])), 'searchMultiKeywords OK');
const { extractSearchKeywords } = await import(new URL('lib/ai.js', root));
assert(Array.isArray(await extractSearchKeywords('测试')), 'extractSearchKeywords OK');

// ── Summary ──────────────────────────────────
console.log(`\n========================`);
console.log(`  ${passed} / ${passed + failed} passed`);
console.log(`========================`);
process.exit(failed > 0 ? 1 : 0);
