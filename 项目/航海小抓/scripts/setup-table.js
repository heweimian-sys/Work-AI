/**
 * setup-table.js — 给用户新建的多维表格添加字段
 * 用法: node scripts/setup-table.js
 */
import 'dotenv/config';
import { client, log } from '../lib/feishu.js';

const APP_TOKEN = 'D9hAbr3zoabh1LsFj50coA3VnUd';
const TABLE_ID  = 'tbl1QHWTNHP4zBoQ';

const fields = [
  { field_name: '文件名', type: 1 },
  { field_name: '活动名称', type: 3 },
  { field_name: '分享人', type: 1 },
  { field_name: '主题标签', type: 4 },
  { field_name: '航海期次', type: 3 },
  { field_name: '上传时间', type: 5 },
  { field_name: '文件链接', type: 15 },
  { field_name: '原始消息群', type: 1 },
  { field_name: 'AI置信度', type: 2 },
  { field_name: '人工已核查', type: 7 },
];

async function main() {
  log('info', `给表格 ${TABLE_ID} 添加字段...`);

  for (const field of fields) {
    try {
      const r = await client.bitable.appTableField.create({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID },
        data: field,
      });
      if (r.code === 0) {
        log('ok', `字段「${field.field_name}」添加成功`);
      } else {
        const alreadyExists = r.code === 1063001 || r.code === 1740005;
        log(alreadyExists ? 'warn' : 'err',
          `字段「${field.field_name}」: ${r.msg}${alreadyExists ? ' (已存在)' : ''}`);
      }
    } catch (e) {
      log('err', `字段「${field.field_name}」异常: ${e.message?.substring(0,60)}`);
    }
  }

  log('ok', '字段设置完成');
}

main().catch(err => { log('err', err.message); process.exit(1); });
