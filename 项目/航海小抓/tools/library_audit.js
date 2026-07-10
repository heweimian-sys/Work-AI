/**
 * tools/library_audit.js — Read-only knowledge base health report.
 *
 * It only reads Bitable records. No update, delete, or Drive operation happens here.
 */

import 'dotenv/config';
import { client } from '../lib/feishu.js';
import { normalizeFieldText, readStandardField, syncFieldMapping } from '../lib/bitable.js';
import { assessResourceRelevance } from './relevance.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.BITABLE_TABLE_ID;

const REQUIRED_SHELL_FIELDS = [
  '文件名',
  '主题标签',
  '一句话摘要',
  '核心观点',
  '内容类型',
  '解决的问题',
];

function text(value) {
  return normalizeFieldText(value);
}

function isEmpty(value) {
  return !text(value);
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

async function listAllRecords(limit = 1000) {
  const records = [];
  let pageToken;
  for (let i = 0; i < 100 && records.length < limit; i++) {
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

function missingShellFields(fields = {}) {
  return REQUIRED_SHELL_FIELDS.filter(name => isEmpty(readStandardField(fields, name)));
}

function isPending(fields = {}) {
  return text(readStandardField(fields, '文件名')).includes('[待审核]') ||
    text(readStandardField(fields, '归档理由')).includes('待审核') ||
    Number(readStandardField(fields, 'AI置信度') || 0) === -1;
}

function sourceType(fields = {}) {
  const fingerprint = text(readStandardField(fields, '内容指纹'));
  const reason = text(readStandardField(fields, '归档理由'));
  if (fingerprint.startsWith('mcp:') || reason.includes('生财MCP')) return 'MCP';
  if (fingerprint.startsWith('file:')) return '文件';
  if (fingerprint.startsWith('doc:') || fingerprint.startsWith('url:')) return '链接';
  if (fingerprint.startsWith('text:') || fingerprint.startsWith('forward:')) return '群聊文本';
  return '其他';
}

function buildAudit(records) {
  const fingerprintMap = new Map();
  const typeCount = {};
  const sourceCount = {};
  const missingShell = [];
  const pending = [];
  const lowValue = [];
  let searchReady = 0;
  let mcpCount = 0;

  for (const record of records) {
    const fields = record.fields || {};
    const name = text(readStandardField(fields, '文件名')) || record.record_id;
    const type = text(readStandardField(fields, '内容类型')) || '未分类';
    const source = sourceType(fields);
    const fingerprint = text(readStandardField(fields, '内容指纹'));
    const missing = missingShellFields(fields);
    const relevance = assessResourceRelevance(fields);

    typeCount[type] = (typeCount[type] || 0) + 1;
    sourceCount[source] = (sourceCount[source] || 0) + 1;
    if (source === 'MCP') mcpCount++;
    if (fingerprint) {
      if (!fingerprintMap.has(fingerprint)) fingerprintMap.set(fingerprint, []);
      fingerprintMap.get(fingerprint).push({ id: record.record_id, name });
    }
    if (missing.length === 0) searchReady++;
    else missingShell.push({ id: record.record_id, name, missing });
    if (isPending(fields)) pending.push({ id: record.record_id, name });
    if (!relevance.keep) lowValue.push({ id: record.record_id, name, reason: relevance.reason, score: relevance.score });
  }

  const duplicates = [...fingerprintMap.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([fingerprint, items]) => ({ fingerprint, count: items.length, items }));

  return {
    success: true,
    readOnly: true,
    total: records.length,
    searchReady,
    searchReadyRate: percent(searchReady, records.length),
    missingShellCount: missingShell.length,
    pendingCount: pending.length,
    duplicateFingerprintGroups: duplicates.length,
    duplicateRecordCount: duplicates.reduce((sum, item) => sum + item.count - 1, 0),
    lowValueCount: lowValue.length,
    mcpCount,
    mcpRate: percent(mcpCount, records.length),
    typeCount,
    sourceCount,
    samples: {
      missingShell: missingShell.slice(0, 10),
      pending: pending.slice(0, 10),
      duplicates: duplicates.slice(0, 5),
      lowValue: lowValue.slice(0, 10),
    },
  };
}

export function formatAuditReport(audit) {
  const typeTop = Object.entries(audit.typeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => `${name}:${count}`)
    .join('，');

  const sourceTop = Object.entries(audit.sourceCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}:${count}`)
    .join('，');

  const risks = [];
  if (audit.pendingCount) risks.push(`待审核 ${audit.pendingCount} 条`);
  if (audit.lowValueCount) risks.push(`低价值候选 ${audit.lowValueCount} 条`);
  if (audit.duplicateRecordCount) risks.push(`疑似重复 ${audit.duplicateRecordCount} 条`);
  if (audit.missingShellCount) risks.push(`壳子缺失 ${audit.missingShellCount} 条`);

  const missingSamples = audit.samples.missingShell
    .slice(0, 3)
    .map(item => `- ${item.name}：缺 ${item.missing.join('、')}`)
    .join('\n');
  const lowValueSamples = audit.samples.lowValue
    .slice(0, 3)
    .map(item => `- ${item.name}：${item.reason}`)
    .join('\n');

  return [
    '📊 资料库体检报告',
    `总记录：${audit.total} 条`,
    `可检索完整度：${audit.searchReady}/${audit.total}（${audit.searchReadyRate}%）`,
    `MCP资料：${audit.mcpCount} 条（${audit.mcpRate}%）`,
    `来源分布：${sourceTop || '暂无'}`,
    `类型Top：${typeTop || '暂无'}`,
    `风险项：${risks.length ? risks.join('，') : '暂未发现明显风险'}`,
    missingSamples ? `\n壳子缺失样例：\n${missingSamples}` : '',
    lowValueSamples ? `\n低价值候选样例：\n${lowValueSamples}` : '',
    '\n建议：先处理待审核/低价值候选，再补壳子缺失；删除云盘文件前务必单独确认。',
  ].filter(Boolean).join('\n');
}

export async function auditLibrary(options = {}) {
  const limit = Number(options.limit || 1000);
  await syncFieldMapping();
  const records = await listAllRecords(limit);
  const audit = buildAudit(records);
  audit.replyText = formatAuditReport(audit);
  return audit;
}

export async function run(args = {}) {
  return await auditLibrary(args);
}
