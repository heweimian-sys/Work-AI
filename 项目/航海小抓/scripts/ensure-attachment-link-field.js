import 'dotenv/config';
import { client } from '../lib/feishu.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;
const fieldName = '附件链接';

const listResp = await client.bitable.appTableField.list({
  path: { app_token: appToken, table_id: tableId },
});

if (listResp.code !== 0) {
  throw new Error(`字段列表读取失败: ${listResp.msg || listResp.code}`);
}

const fields = listResp.data?.items || [];
const existing = fields.find(field => field.field_name === fieldName);

if (existing) {
  console.log(JSON.stringify({
    ok: true,
    action: 'exists',
    field: { name: existing.field_name, type: existing.type, id: existing.field_id },
  }, null, 2));
  process.exit(0);
}

const createResp = await client.bitable.appTableField.create({
  path: { app_token: appToken, table_id: tableId },
  data: { field_name: fieldName, type: 1 },
});

if (createResp.code !== 0) {
  throw new Error(`字段创建失败: ${createResp.msg || createResp.code}`);
}

const field = createResp.data?.field || createResp.data;
console.log(JSON.stringify({
  ok: true,
  action: 'created',
  field,
}, null, 2));
