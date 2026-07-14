import 'dotenv/config';
import { client } from '../lib/feishu.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;

let pageToken;
const counts = {};
const sourceConfidence = {};
let total = 0;
let filled = 0;
const samples = [];

do {
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: appToken, table_id: tableId },
    params: { page_size: 100, page_token: pageToken },
  });
  if (resp.code !== 0) throw new Error(`记录读取失败: ${resp.msg || resp.code}`);
  for (const item of resp.data?.items || []) {
    total++;
    const fields = item.fields || {};
    const status = fields['可用状态'] || '';
    const confidence = fields['来源可信度'] || '';
    if (status) filled++;
    counts[status || '空'] = (counts[status || '空'] || 0) + 1;
    sourceConfidence[confidence || '空'] = (sourceConfidence[confidence || '空'] || 0) + 1;
    if (samples.length < 20 && status && status !== '可用') {
      samples.push({
        id: item.record_id,
        name: fields['文件名'],
        status,
        suggestion: fields['处理建议'],
      });
    }
  }
  pageToken = resp.data?.page_token;
  if (!resp.data?.has_more) break;
} while (pageToken);

console.log(JSON.stringify({ total, filled, counts, sourceConfidence, samples }, null, 2));
