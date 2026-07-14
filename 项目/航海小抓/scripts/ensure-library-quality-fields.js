import 'dotenv/config';
import { client } from '../lib/feishu.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;

const requiredFields = [
  { field_name: '可用状态', type: 1 },
  { field_name: '资料类型', type: 1 },
  { field_name: '抽取正文', type: 1 },
  { field_name: '来源可信度', type: 1 },
  { field_name: '处理建议', type: 1 },
];

async function listFields() {
  const resp = await client.bitable.appTableField.list({
    path: { app_token: appToken, table_id: tableId },
  });
  if (resp.code !== 0) throw new Error(`字段列表读取失败: ${resp.msg || resp.code}`);
  return resp.data?.items || [];
}

const existing = await listFields();
const existingNames = new Set(existing.map(field => field.field_name));
const created = [];
const skipped = [];

for (const field of requiredFields) {
  if (existingNames.has(field.field_name)) {
    skipped.push(field.field_name);
    continue;
  }
  const resp = await client.bitable.appTableField.create({
    path: { app_token: appToken, table_id: tableId },
    data: field,
  });
  if (resp.code !== 0) throw new Error(`字段「${field.field_name}」创建失败: ${resp.msg || resp.code}`);
  created.push(field.field_name);
}

console.log(JSON.stringify({ ok: true, created, skipped }, null, 2));
