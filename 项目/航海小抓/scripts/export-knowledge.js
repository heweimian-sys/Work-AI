/**
 * Export Bitable knowledge records to Markdown and JSONL.
 *
 * The output is suitable for importing into RAG platforms such as MaxKB,
 * Dify, or any vector database ingestion pipeline.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { client } from '../lib/feishu.js';
import { syncFieldMapping } from '../lib/bitable.js';
import { assessResourceRelevance, classifyLibraryMaterial } from '../tools/relevance.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.BITABLE_TABLE_ID;

const REQUIRED_FIELDS = ['文件名', '主题标签', '一句话摘要', '核心观点', '内容类型', '解决的问题'];

function argValue(name, fallback = '') {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
}

function numberArg(name, fallback) {
  const value = Number(argValue(name, ''));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return [value.text, value.link, value.name, value.title].map(text).filter(Boolean).join(' ');
  return String(value ?? '').trim();
}

function linkValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map(linkValue).find(Boolean) || '';
  }
  if (typeof value === 'object') {
    const link = String(value.link || value.url || value.href || '').trim();
    if (isValidHttpUrl(link)) return link;
    return '';
  }
  const raw = String(value).trim();
  const match = raw.match(/https?:\/\/\S+/i);
  return match && isValidHttpUrl(match[0]) ? match[0] : '';
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) && /[a-z0-9-]+\.[a-z]{2,}/i.test(url.hostname);
  } catch {
    return false;
  }
}

function lines(value) {
  return text(value).split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
}

function safeFileName(name) {
  return text(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80) || 'knowledge';
}

function isEmpty(value) {
  return !text(value);
}

function isPending(fields = {}) {
  return text(fields['文件名']).includes('[待审核]') ||
    text(fields['归档理由']).includes('待审核') ||
    Number(fields['AI置信度'] || 0) === -1;
}

function sourceType(fields = {}) {
  const fingerprint = text(fields['内容指纹']);
  const reason = text(fields['归档理由']);
  if (fingerprint.startsWith('mcp:') || reason.includes('生财MCP')) return 'MCP';
  if (fingerprint.startsWith('file:')) return '文件';
  if (fingerprint.startsWith('doc:') || fingerprint.startsWith('url:')) return '链接';
  if (fingerprint.startsWith('text:') || fingerprint.startsWith('forward:')) return '群聊文本';
  return '其他';
}

async function listAllRecords(limit = 2000) {
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

function shouldExport(record, options) {
  const fields = record.fields || {};
  const usability = fields['可用状态'] || classifyLibraryMaterial(fields).status;
  if (!options.includeLowValue && usability !== '可用') return false;
  if (!options.includePending && isPending(fields)) return false;
  if (!options.includeLowValue && !assessResourceRelevance(fields).keep) return false;
  if (!options.includeIncomplete && REQUIRED_FIELDS.some(name => isEmpty(fields[name]))) return false;
  return true;
}

function toKnowledgeDoc(record) {
  const fields = record.fields || {};
  const title = text(fields['文件名']) || record.record_id;
  const link = linkValue(fields['原文链接']) || linkValue(fields['文件链接']);
  const tags = text(fields['主题标签']);
  const corePoints = lines(fields['核心观点']);
  const source = sourceType(fields);
  const usability = fields['可用状态'] || classifyLibraryMaterial(fields).status;

  const contentLines = [
    `# ${title}`,
    '',
    `来源类型：${source}`,
    `内容类型：${text(fields['内容类型']) || '未分类'}`,
    tags ? `标签：${tags}` : '',
    text(fields['适合人群']) ? `适合人群：${text(fields['适合人群'])}` : '',
    text(fields['推荐优先级']) ? `推荐优先级：${text(fields['推荐优先级'])}` : '',
    link ? `原文链接：${link}` : '',
    '',
    '## 一句话摘要',
    text(fields['一句话摘要']) || '暂无',
    '',
    '## 解决的问题',
    text(fields['解决的问题']) || '暂无',
    '',
    '## 核心观点',
    corePoints.length ? corePoints.map(item => `- ${item}`).join('\n') : '暂无',
    '',
    '## 归档说明',
    text(fields['归档理由']) || '暂无',
  ].filter(line => line !== '').join('\n');

  return {
    id: record.record_id,
    title,
    source,
    contentType: text(fields['内容类型']),
    tags,
    summary: text(fields['一句话摘要']),
    problem: text(fields['解决的问题']),
    corePoints,
    link,
    fingerprint: text(fields['内容指纹']),
    content: contentLines,
    metadata: {
      audience: text(fields['适合人群']),
      priority: text(fields['推荐优先级']),
      confidence: Number(fields['AI置信度'] || 0),
      completeness: Number(fields['文档完整度'] || 0),
      archivedAt: text(fields['归档时间']),
      usability,
      materialType: text(fields['资料类型']),
      sourceConfidence: text(fields['来源可信度']),
      nextAction: text(fields['处理建议']),
    },
  };
}

async function main() {
  const limit = numberArg('limit', 2000);
  const outArg = argValue('out', '');
  const includePending = process.argv.includes('--include-pending');
  const includeLowValue = process.argv.includes('--include-low-value');
  const includeIncomplete = process.argv.includes('--include-incomplete');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(outArg || path.join('exports', `kb-export-${stamp}`));

  await syncFieldMapping();
  const records = await listAllRecords(limit);
  const docs = records
    .filter(record => shouldExport(record, { includePending, includeLowValue, includeIncomplete }))
    .map(toKnowledgeDoc);

  await mkdir(outDir, { recursive: true });
  const jsonlPath = path.join(outDir, 'knowledge.jsonl');
  const mdPath = path.join(outDir, 'knowledge.md');
  const manifestPath = path.join(outDir, 'manifest.json');

  await writeFile(jsonlPath, docs.map(doc => JSON.stringify(doc)).join('\n') + '\n', 'utf-8');
  await writeFile(mdPath, docs.map(doc => doc.content).join('\n\n---\n\n'), 'utf-8');
  await writeFile(manifestPath, JSON.stringify({
    success: true,
    readRecords: records.length,
    exported: docs.length,
    skipped: records.length - docs.length,
    generatedAt: new Date().toISOString(),
    files: {
      jsonl: jsonlPath,
      markdown: mdPath,
    },
  }, null, 2), 'utf-8');

  console.log(JSON.stringify({
    success: true,
    outDir,
    readRecords: records.length,
    exported: docs.length,
    skipped: records.length - docs.length,
    samples: docs.slice(0, 5).map(doc => doc.title),
  }, null, 2));
}

main().catch(err => {
  console.error(`知识库导出失败：${err.message}`);
  process.exit(1);
});
