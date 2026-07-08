/**
 * build-vectors.js — 为已有 Bitable 记录批量重建语义向量
 *
 * 使用方式：
 *   node scripts/build-vectors.js
 *
 * 功能：
 *   - 拉取多维表格全部记录
 *   - 为每条记录生成 embedding
 *   - 写入本地向量库 data/vectors.json
 */

import 'dotenv/config';
import { client, log } from '../lib/feishu.js';
import { embed, buildDocumentText, isEmbeddingAvailable } from '../lib/embedding.js';
import * as vectorStore from '../lib/vector-store.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.BITABLE_TABLE_ID;

async function fetchAllRecords() {
  const records = [];
  let pageToken = null;

  while (true) {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
      params: { page_size: 500, page_token: pageToken },
    });

    if (resp.code !== 0) {
      throw new Error(`拉取记录失败 code=${resp.code} msg=${resp.msg}`);
    }

    const items = resp.data.items ?? [];
    records.push(...items);

    pageToken = resp.data.page_token;
    if (!pageToken || items.length < 500) break;
  }

  return records;
}

async function main() {
  log('info', '开始批量重建语义向量...');

  if (!APP_TOKEN || !TABLE_ID) {
    log('err', 'BITABLE_APP_TOKEN 或 BITABLE_TABLE_ID 未设置');
    process.exit(1);
  }

  if (process.env.ENABLE_SEMANTIC_SEARCH !== 'true') {
    log('warn', 'ENABLE_SEMANTIC_SEARCH 未开启，跳过向量重建');
    log('info', '如需启用，请在 .env 中设置 ENABLE_SEMANTIC_SEARCH=true 并配置支持的 Embedding API');
    process.exit(0);
  }

  const available = await isEmbeddingAvailable();
  if (!available) {
    log('err', 'Embedding 服务不可用，无法重建向量');
    log('info', '请检查 EMBEDDING_MODEL 和 OPENAI_BASE_URL，或暂时关闭语义检索');
    process.exit(1);
  }

  let records;
  try {
    records = await fetchAllRecords();
    log('ok', `共拉取 ${records.length} 条记录`);
  } catch (err) {
    log('err', `拉取记录失败: ${err.message}`);
    process.exit(1);
  }

  // 清空旧向量
  vectorStore.clear();
  log('info', '已清空旧向量库');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordId = record.record_id;
    const fields = record.fields;
    const text = buildDocumentText(fields);

    if (!text) {
      log('warn', `[${i + 1}/${records.length}] ${recordId} 没有可嵌入文本，跳过`);
      failed++;
      continue;
    }

    try {
      const vector = await embed(text);
      vectorStore.upsert(recordId, recordId, text, vector);
      success++;
      log('ok', `[${i + 1}/${records.length}] ${recordId} 向量已生成 (dim=${vector.length})`);
    } catch (err) {
      failed++;
      log('err', `[${i + 1}/${records.length}] ${recordId} 失败: ${err.message}`);
    }

    // 每 10 条休息一下，避免 rate limit
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  log('ok', `批量重建完成：成功 ${success} 条，失败 ${failed} 条，向量库共 ${vectorStore.count()} 条`);
}

main().catch(err => {
  log('err', `脚本异常: ${err.message}`);
  process.exit(1);
});
