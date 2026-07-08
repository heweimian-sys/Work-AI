/**
 * tools/cleanup.js — 多维表格清理工具
 *
 * 清理规则：
 * 1. 按内容指纹去重（保留最早创建，删除后续）
 * 2. 内容为空（文件名或主题标签为空）
 * 3. 置信度过低（<0.3 标记待审核）
 * 4. 过期记录（>180天 可选）
 *
 * 触发方式：
 * - 用户 @机器人 说「清理表格」
 * - Agent 自动判断
 *
 * 只操作多维表格，不删除飞书群聊消息。
 */

import 'dotenv/config';
import { log, fetchAPI } from '../lib/feishu.js';
import { extractFields } from '../lib/ai.js';
import { assessResourceRelevance, extractDriveFileToken } from './relevance.js';

const CLEANUP_CONFIG = {
  minConfidence: 0.3,
  keepDays: 180,
};

/**
 * 清理多维表格
 * @returns {Promise<{deleted: number, marked: number, report: string}>}
 */
export async function cleanupTable(options = {}) {
  const { deleteDuplicates = false, enrichEmpty = true, limit = 30 } = options;
  log('info', '开始清理多维表格...');
  const { client } = await import('../lib/feishu.js');

  const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
  const TABLE_ID  = process.env.BITABLE_TABLE_ID;

  // 获取全部记录
  const allRecords = await getAllRecords(client, APP_TOKEN, TABLE_ID);
  log('info', `共 ${allRecords.length} 条记录`);

  const toDelete = new Set();
  const toMark = []; // {id, reason}
  const toEnrich = [];

  // 1. 按内容指纹去重
  const seenFingerprint = new Map();
  for (const record of allRecords) {
    const fp = record.fields['内容指纹'];
    if (!fp) continue;
    if (seenFingerprint.has(fp)) {
      if (deleteDuplicates) toDelete.add(record.record_id);
      else toMark.push({ id: record.record_id, reason: '疑似重复：内容指纹相同' });
    } else {
      seenFingerprint.set(fp, record);
    }
  }

  // 2. 空内容记录（文件名 + 主题标签 + 内容指纹都为空）
  for (const record of allRecords) {
    if (toDelete.has(record.record_id)) continue;
    const name = record.fields['文件名'] || '';
    const tags = record.fields['主题标签'] || [];
    const fp = record.fields['内容指纹'] || '';
    if (!name && tags.length === 0 && !fp) {
      toMark.push({ id: record.record_id, reason: '内容为空' });
    }
  }

  // 3. 置信度过低
  for (const record of allRecords) {
    if (toDelete.has(record.record_id)) continue;
    const conf = parseFloat(record.fields['AI置信度']) || 0;
    if (conf > 0 && conf < CLEANUP_CONFIG.minConfidence) {
      toMark.push({ id: record.record_id, reason: '置信度 ' + conf });
    }
  }

  // 3.5 资料价值判断：明显客服/交易/寒暄/短群聊，标记待审核，不默认删除。
  for (const record of allRecords) {
    if (toDelete.has(record.record_id)) continue;
    if (toMark.some(item => item.id === record.record_id)) continue;
    const assessment = assessResourceRelevance(record.fields || {});
    if (!assessment.keep) {
      toMark.push({ id: record.record_id, reason: `低价值：${assessment.reason}` });
    }
  }

  // 4. 自动补全空字段：有标题或摘要的记录，尝试重新生成结构化字段。
  if (enrichEmpty) {
    for (const record of allRecords) {
      if (toDelete.has(record.record_id)) continue;
      if (toEnrich.length >= limit) break;
      const f = record.fields || {};
      const name = f['文件名'] || '';
      const summary = f['一句话摘要'] || '';
      const keyPoints = f['核心观点'] || '';
      const tags = f['主题标签'] || '';
      const contentType = f['内容类型'] || '';
      const confidence = parseFloat(f['AI置信度']) || 0;
      const missingImportant = !summary || !keyPoints || !tags || !contentType || confidence < 0.6;
      if (name && missingImportant) toEnrich.push(record);
    }
  }

  // 执行删除
  const deleteIds = Array.from(toDelete);
  for (const id of deleteIds) {
    try {
      await client.bitable.appTableRecord.delete({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: id },
      });
    } catch (e) {
      log('warn', '删除失败 ' + id + ': ' + e.message);
    }
  }

  // 标记待审核（更新AI置信度为 -1 表示已清理）
  for (const { id, reason } of toMark) {
    try {
      await client.bitable.appTableRecord.update({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: id },
        data: {
          fields: {
            'AI置信度': '-1',
            '文件名': (await getRecordField(client, APP_TOKEN, TABLE_ID, id, '文件名')) || '[待审核] ' + reason,
            '归档理由': `待审核：${reason}`,
          },
        },
      });
    } catch (e) {
      log('warn', '标记失败 ' + id + ': ' + e.message);
    }
  }

  let enriched = 0;
  let enrichFailed = 0;
  for (const record of toEnrich) {
    const f = record.fields || {};
    const name = f['文件名'] || '未命名资料';
    const context = [
      f['一句话摘要'],
      f['核心观点'],
      f['归档理由'],
      f['主题标签'],
    ].filter(Boolean).join('\n');

    try {
      const ai = await extractFields(name, '多维表字段自动补全', f['分享人'] || '', context || null);
      await client.bitable.appTableRecord.update({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: record.record_id },
        data: {
          fields: {
            '活动名称': ai.活动名称 || f['活动名称'] || '',
            '分享人': ai.分享人 || f['分享人'] || '',
            '主题标签': Array.isArray(ai.主题标签) ? ai.主题标签.join(', ') : (f['主题标签'] || ''),
            '一句话摘要': ai.一句话摘要 || f['一句话摘要'] || '',
            '核心观点': Array.isArray(ai.核心观点) ? ai.核心观点.join('\n') : (f['核心观点'] || ''),
            '内容类型': ai.内容类型 || f['内容类型'] || '其他',
            '适合人群': Array.isArray(ai.适合人群) ? ai.适合人群 : (f['适合人群'] || []),
            '推荐优先级': ai.推荐优先级 || f['推荐优先级'] || '参考',
            '文档完整度': ai.文档完整度 || f['文档完整度'] || 5,
            'AI置信度': Math.max(Number(ai.置信度 || 0), Number(f['AI置信度'] || 0)),
            '解决的问题': ai.解决的问题 || f['解决的问题'] || '',
            '是否有实操': !!(ai.是否有实操 || f['是否有实操']),
            '是否有案例': !!(ai.是否有案例 || f['是否有案例']),
            '归档理由': ai.归档理由 || f['归档理由'] || '自动补全字段',
          },
        },
      });
      enriched++;
    } catch (err) {
      enrichFailed++;
      log('warn', `自动补全失败 ${record.record_id}: ${err.message}`);
    }
  }

  const report = '整理完成：删除 ' + deleteIds.length + ' 条重复记录，标记 ' + toMark.length + ' 条待审核，补全 ' + enriched + ' 条，失败 ' + enrichFailed + ' 条';
  log('ok', report);
  return { deleted: deleteIds.length, marked: toMark.length, enriched, enrichFailed, report };
}

/**
 * 清理本轮历史扫描产生的低价值记录。
 * 默认只删除本次扫描返回的 record_id，避免影响旧资料库。
 */
export async function cleanupScannedRecords(options = {}) {
  const {
    recordIds = [],
    deleteIrrelevant = true,
    deleteDriveFiles = true,
    dryRun = false,
  } = options;

  const uniqueIds = [...new Set((recordIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { checked: 0, deletedRecords: 0, deletedDriveFiles: 0, kept: 0, failed: 0, report: '无本轮新增记录需要清理' };
  }

  const { client } = await import('../lib/feishu.js');
  const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
  const TABLE_ID  = process.env.BITABLE_TABLE_ID;

  let checked = 0;
  let deletedRecords = 0;
  let deletedDriveFiles = 0;
  let kept = 0;
  let failed = 0;
  const removed = [];

  log('info', `开始清理本轮扫描记录: ${uniqueIds.length} 条 dryRun=${dryRun}`);

  for (const recordId of uniqueIds) {
    try {
      const record = await getRecord(client, APP_TOKEN, TABLE_ID, recordId);
      if (!record) continue;
      checked++;

      const fields = record.fields || {};
      const assessment = assessResourceRelevance(fields);
      if (assessment.keep || !deleteIrrelevant) {
        kept++;
        continue;
      }

      const fileToken = extractDriveFileToken(fields);
      if (!dryRun && fileToken && deleteDriveFiles) {
        const deleted = await deleteDriveFile(fileToken);
        if (deleted) deletedDriveFiles++;
      }

      if (!dryRun) {
        await client.bitable.appTableRecord.delete({
          path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: recordId },
        });
      }
      deletedRecords++;
      removed.push({
        recordId,
        fileName: fields['文件名'] || '',
        reason: assessment.reason,
      });
      log('ok', `清理无关扫描记录: ${fields['文件名'] || recordId} (${assessment.reason})`);
    } catch (err) {
      failed++;
      log('warn', `清理扫描记录失败 ${recordId}: ${err.message}`);
    }
  }

  const report = `扫描后清理完成：检查 ${checked} 条，保留 ${kept} 条，删除表格 ${deletedRecords} 条，删除云盘 ${deletedDriveFiles} 个，失败 ${failed} 条`;
  log('ok', report);
  return { checked, deletedRecords, deletedDriveFiles, kept, failed, removed, report };
}

async function getAllRecords(client, appToken, tableId) {
  const records = [];
  let pageToken = null;
  while (true) {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: appToken, table_id: tableId },
      params: { page_size: 500, page_token: pageToken },
    });
    if (resp.code !== 0) break;
    const items = resp.data?.items ?? [];
    records.push(...items);
    pageToken = resp.data?.page_token;
    if (!pageToken) break;
  }
  return records;
}

async function getRecordField(client, appToken, tableId, recordId, fieldName) {
  try {
    const resp = await client.bitable.appTableRecord.get({
      path: { app_token: appToken, table_id: tableId, record_id: recordId },
    });
    return resp.data?.record?.fields?.[fieldName];
  } catch { return null; }
}

async function getRecord(client, appToken, tableId, recordId) {
  const resp = await client.bitable.appTableRecord.get({
    path: { app_token: appToken, table_id: tableId, record_id: recordId },
  });
  return resp.data?.record || null;
}

async function deleteDriveFile(fileToken) {
  try {
    const data = await fetchAPI('DELETE', `/open-apis/drive/v1/files/${fileToken}?type=file`, 10000);
    return data !== null;
  } catch (err) {
    log('warn', `删除云盘文件失败 ${fileToken}: ${err.message}`);
    return false;
  }
}

/**
 * Tool 接口
 */
export async function run(args) {
  return await cleanupTable(args || {});
}
