import 'dotenv/config';
import { client } from '../lib/feishu.js';
import { syncFieldMapping, update } from '../lib/bitable.js';
import { classifyLibraryMaterial } from '../tools/relevance.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;
const limit = Number(process.argv[2] || 500);
const dryRun = process.argv.includes('--dry-run');

function shortText(value, max = 5000) {
  return String(value || '').slice(0, max);
}

async function listRecords(max) {
  const records = [];
  let pageToken = undefined;
  while (records.length < max) {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: appToken, table_id: tableId },
      params: {
        page_size: Math.min(100, max - records.length),
        page_token: pageToken,
      },
    });
    if (resp.code !== 0) throw new Error(`记录读取失败: ${resp.msg || resp.code}`);
    records.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token;
    if (!pageToken || !resp.data?.has_more) break;
  }
  return records;
}

function buildPatch(fields) {
  const classification = classifyLibraryMaterial(fields);
  const extractedText = shortText(fields['抽取正文'] || fields['核心观点'] || fields['一句话摘要'] || '');
  return {
    '可用状态': classification.status,
    '资料类型': classification.materialType,
    '抽取正文': extractedText,
    '来源可信度': classification.sourceConfidence,
    '处理建议': classification.suggestion,
  };
}

await syncFieldMapping();
const records = await listRecords(limit);
const stats = {
  scanned: records.length,
  updated: 0,
  skipped: 0,
  failed: 0,
  byStatus: {},
  samples: [],
  dryRun,
};

for (const record of records) {
  const fields = record.fields || {};
  const patch = buildPatch(fields);
  stats.byStatus[patch['可用状态']] = (stats.byStatus[patch['可用状态']] || 0) + 1;

  const current = {
    '可用状态': fields['可用状态'] || '',
    '资料类型': fields['资料类型'] || '',
    '来源可信度': fields['来源可信度'] || '',
    '处理建议': fields['处理建议'] || '',
  };
  const needsUpdate = Object.entries(current).some(([key, value]) => String(value || '') !== String(patch[key] || ''));
  if (!needsUpdate && fields['抽取正文']) {
    stats.skipped++;
    continue;
  }

  stats.samples.push({
    id: record.record_id,
    name: fields['文件名'],
    status: patch['可用状态'],
    suggestion: patch['处理建议'],
  });

  if (dryRun) {
    stats.updated++;
    continue;
  }

  try {
    await update(record.record_id, patch);
    stats.updated++;
  } catch (err) {
    stats.failed++;
    stats.samples.push({ id: record.record_id, error: err.message });
  }
}

stats.samples = stats.samples.slice(0, 20);
console.log(JSON.stringify(stats, null, 2));
