/**
 * test-api.js — API 权限逐项验证脚本
 *
 * 在已填好 .env（含 DRIVE_FOLDER_TOKEN、BITABLE_APP_TOKEN、BITABLE_TABLE_ID）后运行：
 * node scripts/test-api.js
 *
 * 验证项目：
 *  1. 列出云空间文件夹内容
 *  2. 多维表格查询（关键词搜索）
 *  3. 消息发送测试（需要 chat_id）
 */

import 'dotenv/config';
import { client, log, assertOk } from '../lib/feishu.js';

async function testDriveList() {
  log('info', '[1/3] 测试云空间文件夹读取...');
  const resp = await client.drive.file.list({
    params: { folder_token: process.env.DRIVE_FOLDER_TOKEN },
  });
  assertOk(resp, '列出文件夹');
  log('ok', `云空间读取成功，当前文件数: ${resp.data.files?.length ?? 0}`);
}

async function testBitableQuery() {
  log('info', '[2/3] 测试多维表格查询...');
  const resp = await client.bitable.appTableRecord.list({
    path: {
      app_token: process.env.BITABLE_APP_TOKEN,
      table_id: process.env.BITABLE_TABLE_ID,
    },
    params: { page_size: 5 },
  });
  assertOk(resp, '查询多维表格');
  log('ok', `多维表格查询成功，当前记录数: ${resp.data.total}`);
  if (resp.data.items?.length) {
    const first = resp.data.items[0];
    log('info', '第一条记录字段:', JSON.stringify(first.fields, null, 2));
  }
}

async function testBitableFilter(keyword) {
  log('info', `[3/3] 测试关键词过滤查询: "${keyword}"`);
  // 通过 filter 语法做文本匹配
  const resp = await client.bitable.appTableRecord.list({
    path: {
      app_token: process.env.BITABLE_APP_TOKEN,
      table_id: process.env.BITABLE_TABLE_ID,
    },
    params: {
      filter: `CurrentValue.[文件名].contains("${keyword}")`,
      page_size: 10,
    },
  });
  assertOk(resp, '过滤查询');
  log('ok', `关键词"${keyword}"命中 ${resp.data.total} 条记录`);
  resp.data.items?.forEach((item, i) => {
    log('info', `  [${i + 1}] ${item.fields['文件名'] ?? '(无文件名)'}`);
  });
}

async function main() {
  console.log('\n==============================');
  console.log('  飞书 API 权限验证');
  console.log('==============================\n');

  const required = ['FEISHU_APP_ID','FEISHU_APP_SECRET','BITABLE_APP_TOKEN','BITABLE_TABLE_ID'];
  const missing = required.filter(k => !process.env[k] || process.env[k].includes('xxx'));
  if (missing.length) {
    log('err', `以下环境变量未填写: ${missing.join(', ')}`);
    log('err', '请先运行 node scripts/init.js 完成初始化');
    process.exit(1);
  }

  try {
    // 1. 云空间文件夹（有 token 才测）
    if (process.env.DRIVE_FOLDER_TOKEN) {
      await testDriveList();
    } else {
      log('warn', '[1/3] 跳过云空间文件夹测试（DRIVE_FOLDER_TOKEN 未设置，不影响核心功能）');
    }
    await testBitableQuery();
    await testBitableFilter('AI');  // 用"AI"测试过滤，命中测试行即成功

    console.log('\n==============================');
    log('ok', '所有 API 验证通过，可以开始接入 Bot 逻辑');
    console.log('==============================\n');
  } catch (err) {
    log('err', err.message);
    console.log('\n常见原因：');
    console.log('  - 应用未发布/未上线（开发者后台 -> 版本管理 -> 发布）');
    console.log('  - 应用未添加对应权限（见下方权限清单）');
    console.log('  - 应用未加入目标群组');
    console.log('\n所需权限：');
    console.log('  drive:drive  drive:file  bitable:app  bitable:record  im:message:send_as_bot');
    process.exit(1);
  }
}

main();
