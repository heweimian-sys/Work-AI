/**
 * Backfill productized metadata shell for existing MCP records in Bitable.
 */

import 'dotenv/config';
import { client, log } from '../lib/feishu.js';
import { syncFieldMapping, update } from '../lib/bitable.js';
import { buildShellFromExistingFields, mergeMcpTags } from '../tools/mcp_shell.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.BITABLE_TABLE_ID;
const DEFAULT_LIMIT = 50;

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

async function listRecords(limit) {
  const records = [];
  let pageToken;
  for (let i = 0; i < 20 && records.length < limit; i++) {
    const params = { page_size: Math.min(500, limit - records.length) };
    if (pageToken) params.page_token = pageToken;
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
      params,
    });
    if (resp.code !== 0) throw new Error(`读取多维表失败 code=${resp.code} msg=${resp.msg}`);
    records.push(...(resp.data?.items || []));
    if (!resp.data?.has_more || !resp.data?.page_token) break;
    pageToken = resp.data.page_token;
  }
  return records;
}

function buildPatch(fields) {
  const shell = buildShellFromExistingFields(fields);
  const patch = {};

  if (isEmpty(fields['内容类型']) || fields['内容类型'] === '其他') patch['内容类型'] = shell.contentType;
  if (isEmpty(fields['主题标签'])) patch['主题标签'] = shell.tags.join(', ');
  else patch['主题标签'] = mergeMcpTags(fields['主题标签'], shell.tags);
  if (isEmpty(fields['一句话摘要'])) patch['一句话摘要'] = shell.summary;
  if (isEmpty(fields['核心观点'])) patch['核心观点'] = shell.corePoints.join('\n');
  if (isEmpty(fields['解决的问题'])) patch['解决的问题'] = shell.problem;
  if (isEmpty(fields['适合人群'])) patch['适合人群'] = shell.audience;
  if (isEmpty(fields['推荐优先级'])) patch['推荐优先级'] = shell.priority;
  if (isEmpty(fields['文档完整度'])) patch['文档完整度'] = shell.completeness;

  const oldReason = String(fields['归档理由'] || '');
  if (!oldReason.includes('资料壳子')) {
    patch['归档理由'] = [oldReason, '资料壳子回填：已补充内容类型、解决问题、适合人群、核心观点和检索标签。'].filter(Boolean).join('\n');
  }

  return patch;
}

async function main() {
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const dryRun = process.argv.includes('--dry-run');
  const limit = limitArg ? Number(limitArg.split('=')[1]) : DEFAULT_LIMIT;

  await syncFieldMapping();
  const records = await listRecords(limit);
  const mcpRecords = records.filter(record => String(record.fields?.['内容指纹'] || '').startsWith('mcp:'));

  let updated = 0;
  let skipped = 0;
  const samples = [];

  for (const record of mcpRecords) {
    const fields = record.fields || {};
    const patch = buildPatch(fields);
    if (!Object.keys(patch).length) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await update(record.record_id, patch);
    }
    updated++;
    samples.push(`${dryRun ? '预览' : '已更新'}：${fields['文件名'] || record.record_id}`);
  }

  console.log(JSON.stringify({
    success: true,
    dryRun,
    scanned: records.length,
    mcpRecords: mcpRecords.length,
    updated,
    skipped,
    samples: samples.slice(0, 20),
  }, null, 2));
}

main().catch(err => {
  log('err', `MCP资料壳子回填失败: ${err.message}`);
  process.exit(1);
});
