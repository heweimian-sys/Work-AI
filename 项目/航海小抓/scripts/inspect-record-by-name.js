import 'dotenv/config';
import { client } from '../lib/feishu.js';

const name = process.argv.slice(2).join(' ');
const escaped = name.replace(/"/g, '\\"');
const resp = await client.bitable.appTableRecord.list({
  path: {
    app_token: process.env.BITABLE_APP_TOKEN,
    table_id: process.env.BITABLE_TABLE_ID,
  },
  params: {
    page_size: 10,
    filter: `CurrentValue.[文件名]="${escaped}"`,
  },
});

console.log(JSON.stringify({
  code: resp.code,
  msg: resp.msg,
  records: (resp.data?.items || []).map(record => ({
    id: record.record_id,
    fields: {
      文件名: record.fields?.['文件名'],
      文件链接: record.fields?.['文件链接'],
      原文链接: record.fields?.['原文链接'],
      附件链接: record.fields?.['附件链接'],
      内容指纹: record.fields?.['内容指纹'],
      归档理由: record.fields?.['归档理由'],
    },
  })),
}, null, 2));
