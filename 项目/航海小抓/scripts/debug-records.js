/**
 * debug-records.js — 查看多维表格实际数据格式，诊断链接字段问题
 */
import 'dotenv/config';
import { client, log } from '../lib/feishu.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID  = process.env.BITABLE_TABLE_ID;

async function main() {
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    params: { page_size: 20 },
  });

  if (resp.code !== 0) {
    log('err', '获取失败', resp);
    return;
  }

  const items = resp.data.items ?? [];
  log('info', `共 ${items.length} 条记录`);

  for (const item of items) {
    const f = item.fields;
    console.log(`\n=== ${item.record_id} ===`);
    console.log(`文件名: ${JSON.stringify(f['文件名'])}`);
    console.log(`文件链接: ${JSON.stringify(f['文件链接'])}`);
    console.log(`分享人: ${JSON.stringify(f['分享人'])}`);
    console.log(`活动名称: ${JSON.stringify(f['活动名称'])}`);
    console.log(`主题标签: ${JSON.stringify(f['主题标签'])}`);
    console.log(`AI置信度: ${JSON.stringify(f['AI置信度'])}`);
    console.log(`All keys:`, Object.keys(f));
  }
}

main().catch(err => console.error('FATAL:', err));
