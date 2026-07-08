/**
 * tools/group_organizer.js — 按群聊ID整理多维表格记录
 *
 * 功能：针对特定群的所有归档记录批量更新
 * - 统一添加群标签
 * - 更新整理时间
 * - 只操作多维表格，不删除飞书群聊消息
 *
 * 触发：用户 @机器人 说「整理群 oc_xxx」
 */

import 'dotenv/config';
import { client, log } from '../lib/feishu.js';

const APP_TOKEN=process.env.BITABLE_APP_TOKEN;
const TABLE_ID  = process.env.BITABLE_TABLE_ID;

/**
 * 按群聊ID整理记录
 * @param {string} groupChatId - 飞书群聊ID
 * @param {string} [groupLabel] - 可选群标签
 */
export async function organizeByGroup(groupChatId, groupLabel) {
  log('info', '开始整理群 ' + groupChatId + ' 的记录...');

  // 查询该群的所有记录
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    params: {
      filter: 'CurrentValue.[原始消息群]="' + groupChatId.replace(/"/g, '\\"') + '"',
      page_size: 500,
    },
  });

  if (resp.code !== 0) {
    return { success: false, report: '查询失败: ' + resp.msg };
  }

  const records = resp.data?.items ?? [];
  if (records.length === 0) {
    return { success: true, report: '该群暂无归档记录', count: 0 };
  }

  const label = groupLabel || '来自群 ' + groupChatId.slice(0, 8);
  let updated = 0;

  for (const record of records) {
    const existingTags = record.fields['主题标签'] || [];
    // 如果已经有群标签了，跳过
    if (existingTags.includes(label)) continue;

    const newTags = [...new Set([...existingTags, label])];
    try {
      await client.bitable.appTableRecord.update({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: record.record_id },
        data: { fields: { '主题标签': newTags } },
      });
      updated++;
    } catch (e) {
      log('warn', '更新失败 ' + record.record_id + ': ' + e.message);
    }
  }

  const report = '整理完成：群 ' + groupChatId + ' 共 ' + records.length + ' 条记录，更新 ' + updated + ' 条标签';
  log('ok', report);
  return { success: true, report, count: records.length, updated };
}

/**
 * Tool 接口
 */
export async function run(args) {
  const { groupChatId, groupLabel } = args;
  if (!groupChatId) {
    return { text: '请提供群聊ID，例如：整理群 oc_f0ff546e2129838527d88ba4f621f4b3' };
  }
  return await organizeByGroup(groupChatId, groupLabel);
}
