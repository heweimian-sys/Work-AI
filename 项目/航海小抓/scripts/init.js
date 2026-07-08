/**
 * init.js — 飞书知识库一键初始化脚本
 *
 * 运行: node scripts/init.js
 * 强制重建: node scripts/init.js --force
 *
 * 做了什么：
 *  1. 验证 App ID / Secret 是否有效（获取 tenant_access_token）
 *  2. 在云空间创建「应用所有」的归档文件夹（应用作为 owner，彻底解决 403）
 *  3. 在文件夹内创建多维表格（Bitable），并新建「资料索引」表
 *  4. 为表格添加所有需要的字段
 *  5. 将运营负责人（OPS_USER_OPEN_ID）加为文件夹/表格协作者
 *  6. 自动把新的 token/id 写回 .env
 */

import 'dotenv/config';
import { client, log, assertOk } from '../lib/feishu.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORCE = process.argv.includes('--force');

/* ─────────────────────────────────────────
   Step 1: 验证凭证
─────────────────────────────────────────── */
async function checkCredentials() {
  log('info', '验证 App 凭证...');
  const resp = await client.auth.tenantAccessToken.internal({
    data: {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    },
  });
  if (resp.code !== 0) throw new Error(`凭证无效: code=${resp.code} msg=${resp.msg}`);
  log('ok', `凭证有效，Token 有效期 ${resp.expire}s`);
}

/* ─────────────────────────────────────────
   Step 2: 创建云空间文件夹（应用所有）
─────────────────────────────────────────── */
async function createDriveFolder() {
  const today = new Date().toISOString().slice(0, 10);
  const folderName = `生财航海资料库（机器人创建）${today}`;
  log('info', `创建云空间归档文件夹：${folderName}`);

  try {
    const folderResp = await client.request({
      method: 'POST',
      url: 'https://open.feishu.cn/open-apis/drive/v1/files/create_folder',
      data: { name: folderName, folder_token: '' },
    });
    if (folderResp.code === 0) {
      const folderToken = folderResp.data.token;
      log('ok', `文件夹创建成功，DRIVE_FOLDER_TOKEN=${folderToken}`);
      return folderToken;
    }
    throw new Error(`创建文件夹失败: code=${folderResp.code} msg=${folderResp.msg}`);
  } catch (e) {
    throw new Error(`创建文件夹请求异常: ${e.message}`);
  }
}

/* ─────────────────────────────────────────
   Step 3: 创建多维表格
─────────────────────────────────────────── */
async function createBitable(driveFolderToken) {
  log('info', '创建多维表格（Bitable）...');

  const bitableData = {
    name: '生财航海资料索引',
  };
  if (driveFolderToken) {
    bitableData.folder_token = driveFolderToken;
  }

  const resp = await client.bitable.app.create({ data: bitableData });
  assertOk(resp, '创建多维表格');
  const appToken = resp.data.app.app_token;
  log('ok', `多维表格创建成功，BITABLE_APP_TOKEN=${appToken}`);
  return appToken;
}

/* ─────────────────────────────────────────
   Step 4: 获取默认表并重命名，添加字段
─────────────────────────────────────────── */
async function setupTable(appToken) {
  log('info', '获取默认表...');

  const listResp = await client.bitable.appTable.list({ path: { app_token: appToken } });
  assertOk(listResp, '列出表格');
  const tableId = listResp.data.items[0].table_id;
  log('ok', `默认表 ID: ${tableId}，BITABLE_TABLE_ID=${tableId}`);

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

  log('info', `添加 ${fields.length} 个字段...`);
  for (const field of fields) {
    const r = await client.bitable.appTableField.create({
      path: { app_token: appToken, table_id: tableId },
      data: field,
    });
    if (r.code === 0) {
      log('ok', `字段「${field.field_name}」添加成功`);
    } else {
      log('warn', `字段「${field.field_name}」添加失败: ${r.msg}（可能已存在）`);
    }
  }

  return tableId;
}

/* ─────────────────────────────────────────
   Step 5: 验证可读写多维表格
─────────────────────────────────────────── */
async function verifyBitableWrite(appToken, tableId) {
  log('info', '写入测试行到多维表格...');

  const resp = await client.bitable.appTableRecord.create({
    path: { app_token: appToken, table_id: tableId },
    data: {
      fields: {
        '文件名': '【测试行，可删除】init.js 验证写入',
        '分享人': '系统',
        'AI置信度': 1,
        '人工已核查': false,
      },
    },
  });
  assertOk(resp, '写入测试行');
  log('ok', `测试行写入成功，record_id=${resp.data.record.record_id}`);
}

/* ─────────────────────────────────────────
   Step 6: 把用户加为协作者
─────────────────────────────────────────── */
async function addCollaborator(token, type, userOpenId, role = 'full_access') {
  if (!userOpenId) return false;

  const url = `https://open.feishu.cn/open-apis/drive/v1/permissions/${token}/members?type=${type}`;
  const label = type === 'folder' ? '文件夹' : '多维表格';
  try {
    const resp = await client.request({
      method: 'POST',
      url,
      data: {
        member_type: 'openid',
        member_id: userOpenId,
        perm: role,
      },
    });
    if (resp.code === 0) {
      log('ok', `已把用户 ${userOpenId} 加为 ${label} 协作者（${role}）`);
      return true;
    }
    log('warn', `加${label}协作者失败: code=${resp.code} msg=${resp.msg}（可在脚本运行后手动分享）`);
    return false;
  } catch (e) {
    const feishuErr = e?.response?.data;
    log('warn', `加${label}协作者异常: code=${feishuErr?.code ?? e.response?.status} msg=${feishuErr?.msg ?? e.message?.substring(0, 80)}`);
    return false;
  }
}

/* ─────────────────────────────────────────
   Step 7: 自动写回 .env
─────────────────────────────────────────── */
async function updateEnvFile({ folderToken, appToken, tableId }) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    log('warn', '未找到 .env 文件，请手动填入以下配置');
    return false;
  }

  let content = fs.readFileSync(envPath, 'utf8');

  const updateOrAdd = (key, value) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  };

  if (folderToken) updateOrAdd('DRIVE_FOLDER_TOKEN', folderToken);
  if (appToken) updateOrAdd('BITABLE_APP_TOKEN', appToken);
  if (tableId) updateOrAdd('BITABLE_TABLE_ID', tableId);

  try {
    fs.writeFileSync(envPath, content);
    log('ok', '.env 已自动更新');
    return true;
  } catch (e) {
    log('warn', '自动写回 .env 失败（权限不足），请手动更新以下配置：');
    if (folderToken) console.log(`DRIVE_FOLDER_TOKEN=${folderToken}`);
    if (appToken) console.log(`BITABLE_APP_TOKEN=${appToken}`);
    if (tableId) console.log(`BITABLE_TABLE_ID=${tableId}`);
    return false;
  }
}

/* ─────────────────────────────────────────
   主流程
─────────────────────────────────────────── */
async function main() {
  console.log('\n==============================');
  console.log('  飞书知识库 初始化脚本');
  console.log('==============================\n');

  if (!process.env.FEISHU_APP_ID || process.env.FEISHU_APP_ID.includes('xxx')) {
    log('err', '请先复制 .env.example 为 .env 并填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }

  try {
    await checkCredentials();

    const existingAppToken = process.env.BITABLE_APP_TOKEN;
    const existingTableId = process.env.BITABLE_TABLE_ID;

    let folderToken, appToken, tableId;

    if (existingAppToken && existingTableId && !FORCE) {
      log('warn', `检测到已有配置：BITABLE_APP_TOKEN=${existingAppToken}`);
      log('warn', '如需让机器人重新创建一套全新资源，请运行：node scripts/init.js --force');
      console.log('\n==============================');
      console.log('  已跳过，未创建新资源');
      console.log('==============================');
      process.exit(0);
    }

    if (FORCE && (existingAppToken || existingTableId)) {
      log('info', '--force 已启用，将创建新的文件夹和多维表格');
    }

    folderToken = await createDriveFolder();
    appToken = await createBitable(folderToken);
    tableId = await setupTable(appToken);
    await verifyBitableWrite(appToken, tableId);

    const userOpenId = process.env.OPS_USER_OPEN_ID;
    if (userOpenId) {
      await addCollaborator(folderToken, 'folder', userOpenId, 'full_access');
      await addCollaborator(appToken, 'bitable', userOpenId, 'full_access');
    } else {
      log('warn', '未设置 OPS_USER_OPEN_ID，机器人已创建资源，但无法自动把你加为协作者');
      log('info', '请在 .env 填入 OPS_USER_OPEN_ID 后重新运行：node scripts/init.js --force');
    }

    await updateEnvFile({ folderToken, appToken, tableId });

    console.log('\n==============================');
    console.log('  初始化完成！');
    console.log('==============================');
    console.log(`DRIVE_FOLDER_TOKEN=${folderToken}`);
    console.log(`BITABLE_APP_TOKEN=${appToken}`);
    console.log(`BITABLE_TABLE_ID=${tableId}`);
    console.log('');
    log('ok', '多维表格「生财航海资料索引」可用');
    log('info', '机器人现在可以直接上传文件到这个新文件夹，无需在 UI 里添加应用协作者');
  } catch (err) {
    log('err', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
