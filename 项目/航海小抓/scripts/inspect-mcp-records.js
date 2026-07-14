import 'dotenv/config';
import { client } from '../lib/feishu.js';

const resp = await client.bitable.appTableRecord.list({
  path: {
    app_token: process.env.BITABLE_APP_TOKEN,
    table_id: process.env.BITABLE_TABLE_ID,
  },
  params: {
    page_size: 20,
    filter: 'CurrentValue.[内容指纹].contains("mcp:")',
  },
});

const records = (resp.data?.items || []).map(record => {
  const fields = record.fields || {};
  return {
    id: record.record_id,
    name: fields['文件名'],
    fileLink: fields['文件链接'],
    sourceLink: fields['原文链接'],
    attachmentLinks: fields['附件链接'],
    fingerprint: fields['内容指纹'],
    reason: String(fields['归档理由'] || '').slice(0, 220),
  };
});

console.log(JSON.stringify({
  code: resp.code,
  msg: resp.msg,
  total: records.length,
  records,
}, null, 2));
