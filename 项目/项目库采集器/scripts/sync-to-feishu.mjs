/**
 * 将本地收件箱记录同步到飞书多维表格。
 * 复用仓库已有的航海小抓 Feishu API 和字段动态映射，不在浏览器扩展中保存密钥。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insert, syncFieldMapping, getFieldList } from '../../航海小抓/lib/bitable.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const inboxDir = path.resolve(here, '..', 'inbox');

async function readRecords() {
  const files = (await fs.readdir(inboxDir)).filter((file) => file.endsWith('.json'));
  const records = [];
  for (const file of files) {
    const value = JSON.parse(await fs.readFile(path.join(inboxDir, file), 'utf8'));
    if (Array.isArray(value)) records.push(...value);
    else records.push(value);
  }
  return records;
}

function toFields(record) {
  const media = record.media || {};
  const collectedAt = record.collected_at ? Date.parse(record.collected_at) : null;
  return {
    '标题': record.title || '未命名采集内容',
    '平台': record.platform || 'unknown',
    '原文链接': record.content_url || '',
    '作者': record.author_name || '',
    '主题标签': (record.detail?.hashtags || []).join(' '),
    '一句话摘要': (record.text || record.detail?.body || '').slice(0, 500),
    '核心观点': record.detail?.body || record.text || '',
    '内容类型': `${record.platform || 'unknown'} / ${record.collection_method || 'unknown'}`,
    '附件链接': [...(media.image_urls || []), ...(media.video_urls || [])].join('\n'),
    '图片链接': (media.image_urls || []).join('\n'),
    '内容ID': record.content_id || '',
    '评论': JSON.stringify(record.comments || []),
    '互动数据': JSON.stringify(record.metrics || {}),
    '项目相关性': record.project_relevance || 'unknown',
    '采集时间': Number.isFinite(collectedAt) ? collectedAt : null,
    '内容指纹': record.dedupe_key || record.content_id || record.content_url || '',
    '来源可信度': record.evidence_level || 'L1',
    '归档状态': record.review_status || 'pending',
    '原始记录': JSON.stringify({
      record_id: record.record_id,
      content_id: record.content_id || null,
      comments: record.comments || [],
      metrics: record.metrics || {},
      raw_network_responses: record.raw_network_responses || [],
      raw_record: record,
    }),
  };
}

const records = await readRecords();
if (!records.length) {
  console.log('收件箱没有 JSON 记录，跳过同步。');
  process.exit(0);
}

await syncFieldMapping();
console.log(`已读取 ${records.length} 条记录；飞书字段数 ${getFieldList().length}。`);
let success = 0;
for (const record of records) {
  try {
    await insert(toFields(record));
    success += 1;
  } catch (error) {
    console.error(`同步失败 ${record.record_id || record.content_url}: ${error.message}`);
  }
}
console.log(`飞书同步完成：${success}/${records.length}`);
