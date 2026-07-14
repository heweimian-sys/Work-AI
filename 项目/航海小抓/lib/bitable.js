/**
 * bitable.js — 多维表格操作封装
 *
 * 自适应：启动时自动读取表格字段列表，动态映射列名
 * 写入时根据实际列名映射，不再依赖硬编码
 */

import 'dotenv/config';
import { client, assertOk, log, fetchAPI } from './feishu.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID  = process.env.BITABLE_TABLE_ID;

// 字段映射缓存
let FIELD_MAPPING = {};
let FIELD_LIST = [];

// 代码中用到的标准字段名 → 可能的表格列名（按优先级）
const FIELD_ALIASES = {
  '文件名': ['文件名', '文件名称', '名称', '文件', 'FileName', 'Name', 'file_name', 'title'],
  '文件链接': ['文件链接', '链接', 'URL', 'Link', 'file_link', 'url'],
  '附件链接': ['附件链接', '附件URL', '附件地址', '图片链接', '图片URL', 'AttachmentLinks', 'attachment_links'],
  '分享人': ['分享人', '作者', '主讲人', '上传者', 'Speaker', 'Author', 'speaker', '分享者', '分享嘉宾'],
  '活动名称': ['活动名称', '活动', '标题', '名称', 'Title', 'Session', 'name', '活动标题', '分享主题'],
  '主题标签': ['主题标签', '标签', '关键词', 'Tags', 'Keywords', 'tag', 'tags', '关键字'],
  '航海期次': ['航海期次', '期次', '期数', '航海', 'Period', 'Session', 'period', '航海期'],
  'AI置信度': ['AI置信度', '置信度', '可信度', '评分', 'Score', 'Confidence', 'confidence', 'ai_score'],
  // ====== 新增字段 ======
  '一句话摘要': ['一句话摘要', '摘要', '简介', 'Summary', 'summary', '一句话总结'],
  '核心观点': ['核心观点', '关键观点', '要点', 'KeyPoints', 'key_points', '核心要点'],
  '内容类型': ['内容类型', '类型', '文档类型', 'Type', 'content_type', '文档分类'],
  '适合人群': ['适合人群', '受众', '目标人群', 'Audience', 'target_audience', '适用人群'],
  '推荐优先级': ['推荐优先级', '优先级', '推荐等级', 'Priority', 'priority', '重要程度'],
  '文档完整度': ['文档完整度', '完整度', '内容完整度', 'Completeness', 'completeness', '完整评分'],
  '原文链接': ['原文链接', '原始链接', '源链接', 'SourceLink', 'source_link', '原链接'],
  '可用状态': ['可用状态', '资料状态', '入库状态', 'Status', 'usable_status'],
  '资料类型': ['资料类型', '素材类型', '资源类型', 'MaterialType', 'material_type'],
  '抽取正文': ['抽取正文', '正文', 'OCR正文', '可检索正文', 'ExtractedText', 'extracted_text'],
  '来源可信度': ['来源可信度', '来源等级', '可信度等级', 'SourceConfidence', 'source_confidence'],
  '处理建议': ['处理建议', '治理建议', '上架建议', 'NextAction', 'next_action'],
  '归档时间': ['归档时间', '归档日期', '入库时间', 'ArchiveTime', 'archive_time', '创建时间'],
  '解决的问题': ['解决的问题', '解决问题', '适用场景', 'ProblemSolved', 'problem_solved', '场景'],
  '是否有实操': ['是否有实操', '有实操', '包含实操', 'HasPractice', 'has_practice', '实操步骤'],
  '是否有案例': ['是否有案例', '有案例', '包含案例', 'HasCase', 'has_case', '真实案例'],
  '文件大小': ['文件大小', '大小', '文件尺寸', 'FileSize', 'file_size', 'Size'],
  '归档理由': ['归档理由', '归档说明', '备注', 'ArchiveReason', 'archive_reason', '处理说明'],
  '内容指纹': ['内容指纹', '指纹', '哈希', 'Hash', 'hash', 'Fingerprint', 'fingerprint', 'content_hash'],
};

const IMPORTANT_FIELDS = [
  '活动名称',
  '主题标签',
  '一句话摘要',
  '核心观点',
  '内容类型',
  '解决的问题',
];

/**
 * 启动时调用：从飞书同步多维表格的实际字段列表，构建映射表
 */
export async function syncFieldMapping() {
  try {
    const resp = await client.bitable.appTableField.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    });
    
    if (resp.code !== 0 || !resp.data?.items) {
      log('warn', '同步字段映射失败: ' + (resp.msg || 'unknown'));
      return;
    }

    FIELD_LIST = resp.data.items;
    const tableFieldNames = FIELD_LIST.map(f => f.field_name);
    log('info', '表格实际字段: [' + tableFieldNames.join(', ') + ']');

    // 为每个标准字段名找到匹配的列
    const mapping = {};
    for (const [standardKey, aliases] of Object.entries(FIELD_ALIASES)) {
      // 精确匹配
      let matched = tableFieldNames.find(n => n === standardKey);
      // 别名匹配
      if (!matched) {
        matched = tableFieldNames.find(n => aliases.includes(n));
      }
      // 包含匹配（表格列名包含标准名，或标准名包含表格列名）
      if (!matched) {
        matched = tableFieldNames.find(n => n.includes(standardKey) || standardKey.includes(n));
      }
      mapping[standardKey] = matched || null;
    }

    FIELD_MAPPING = mapping;

    const missing = Object.entries(mapping).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      log('warn', '以下字段未在表格中找到别名: ' + missing.join(', '));
      log('info', '建议手动在表格中添加以下列: ' + missing.join(', '));
    } else {
      log('ok', '所有字段映射成功');
    }

    log('info', '字段映射: ' + JSON.stringify(mapping));
  } catch (err) {
    log('warn', '同步字段映射异常: ' + err.message);
  }
}

/**
 * 将代码中的标准字段名映射到表格的实际列名
 */
function mapFields(fields) {
  const mapped = {};
  const hasSyncedFields = FIELD_LIST.length > 0;
  for (const [key, value] of Object.entries(fields)) {
    // 下划线开头字段只给本地逻辑使用，不写入飞书多维表格。
    if (key.startsWith('_')) continue;
    if (hasSyncedFields && Object.prototype.hasOwnProperty.call(FIELD_MAPPING, key) && !FIELD_MAPPING[key]) continue;
    const actualName = FIELD_MAPPING[key] || key;
    if (hasSyncedFields && !hasActualField(actualName)) continue;
    if (isUrlField(key, actualName)) {
      const urlValue = normalizeUrlFieldValue(value, actualName);
      if (urlValue == null) continue;
      mapped[actualName] = urlValue;
      continue;
    }
    mapped[actualName] = value;
  }
  return mapped;
}

/**
 * 获取某个标准字段对应的实际表格列名
 */
export function getActualFieldName(standardName) {
  return FIELD_MAPPING[standardName] || standardName;
}

/**
 * 获取表格所有字段列表
 */
export function getFieldList() {
  return FIELD_LIST;
}

/**
 * 获取缺失的字段（表格中没有对应列的标准字段）
 */
export function getMissingFields() {
  const missing = [];
  for (const [key, value] of Object.entries(FIELD_MAPPING)) {
    if (!value) missing.push(key);
  }
  return missing;
}

function readField(fields, standardName) {
  const actualName = FIELD_MAPPING[standardName] || standardName;
  return fields?.[actualName] ?? fields?.[standardName];
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    if ('text' in value || 'link' in value) {
      return !String(value.text || value.link || '').trim();
    }
    return Object.keys(value).length === 0;
  }
  return false;
}

function hasActualField(actualName) {
  return FIELD_LIST.some(field => field.field_name === actualName);
}

function getFieldMeta(actualName) {
  return FIELD_LIST.find(field => field.field_name === actualName) || null;
}

function isUrlField(standardName, actualName) {
  return ['文件链接', '原文链接'].includes(standardName) || ['文件链接', '原文链接', '链接', 'URL', 'Link'].includes(actualName);
}

function isValidUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return false;
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

function normalizeUrlFieldValue(value, actualName) {
  if (isEmptyValue(value)) return null;
  const link = extractLinkValue(value).trim();
  if (!isValidUrl(link)) return null;
  const field = getFieldMeta(actualName);
  const text = typeof value === 'object' && value?.text ? String(value.text).trim() : link;
  if (!field || Number(field.type) === 15) return { link, text: text || link };
  return link;
}

function hasMeaningfulField(fields, standardName) {
  return !isEmptyValue(readField(fields, standardName));
}

function needsEnrichment(fields) {
  const confidence = Number(readField(fields, 'AI置信度') || 0);
  if (confidence > 0 && confidence < 0.6) return true;
  return IMPORTANT_FIELDS.some(name => !hasMeaningfulField(fields, name));
}

function incomingHasEnrichment(fields) {
  return IMPORTANT_FIELDS.some(name => !isEmptyValue(fields[name]));
}

function extractLinkValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.link || value.text || '';
  return String(value);
}

/**
 * 写入一条记录（带字段映射）
 */
export async function insert(fields) {
  const mappedFields = mapFields(fields);
  const resp = await client.bitable.appTableRecord.create({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    data: { fields: mappedFields },
  });
  assertOk(resp, '写入多维表格');
  return resp.data.record.record_id;
}

/** 更新一条已有记录 */
export async function update(recordId, fields) {
  const mappedFields = mapFields(fields);
  const resp = await client.bitable.appTableRecord.update({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: recordId },
    data: { fields: mappedFields },
  });
  assertOk(resp, '更新多维表格');
  return resp.data.record?.record_id || recordId;
}

/** 按文件名精确查找 */
export async function findByFileName(fileName) {
  if (!fileName) return null;
  const nameField = FIELD_MAPPING['文件名'] || '文件名';
  const escaped = fileName.replace(/"/g, '\\"');
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    params: {
      filter: 'CurrentValue.[' + nameField + ']="' + escaped + '"',
      page_size: 5,
    },
  });
  if (resp.code === 0 && resp.data?.items?.length > 0) return resp.data.items[0];
  return null;
}

/** 按内容指纹查找 */
export async function findByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const fpField = FIELD_MAPPING['内容指纹'] || '内容指纹';
  if (!FIELD_MAPPING['内容指纹']) return null;
  const escaped = fingerprint.replace(/"/g, '\\"');
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    params: {
      filter: 'CurrentValue.[' + fpField + ']="' + escaped + '"',
      page_size: 5,
    },
  });
  if (resp.code === 0 && resp.data?.items?.length > 0) return resp.data.items[0];
  return null;
}

/** 带去重写入：文件名+大小+内容哈希三因子去重 */
export async function insertIfNotExist(fields) {
  const fileName = fields['文件名'];
  const fileSize = fields['文件大小'];
  const fileHash = fields['_fileHash'];  // 可选：SHA-256 内容哈希
  const contentFingerprint = fields['内容指纹'] || (fileHash ? `file:${fileHash}` : '');
  const newLink = extractLinkValue(fields['文件链接']);
  const newAttachmentLinks = fields['附件链接'];

  if (contentFingerprint) {
    const sameFingerprint = await findByFingerprint(contentFingerprint);
    if (sameFingerprint) {
      const existingFields = sameFingerprint.fields || {};
      const existingLink = extractLinkValue(readField(existingFields, '文件链接'));
      const existingAttachmentLinks = readField(existingFields, '附件链接');
      if ((!existingLink && newLink) || (!existingAttachmentLinks && newAttachmentLinks) || (needsEnrichment(existingFields) && incomingHasEnrichment(fields))) {
        log('info', '更新旧记录(内容指纹命中且补链接/补全字段): ' + (fileName || contentFingerprint));
        await update(sameFingerprint.record_id, fields);
        return { action: 'updated', record_id: sameFingerprint.record_id, recordId: sameFingerprint.record_id };
      }
      log('info', '去重跳过(内容指纹命中): ' + (fileName || contentFingerprint));
      return { action: 'skipped', record_id: sameFingerprint.record_id, recordId: sameFingerprint.record_id };
    }
  }

  if (fileName) {
    const existing = await findByFileName(fileName);
    if (existing) {
      const existingFields = existing.fields || {};
      const existingLink = extractLinkValue(readField(existingFields, '文件链接'));
      const existingAttachmentLinks = readField(existingFields, '附件链接');
      const oldHasValidLink = isValidUrl(existingLink) && !existingLink.includes('/file/test');
      const newHasValidLink = isValidUrl(newLink) && !newLink.includes('/file/test');

      // 场景1：同名同大小。如果旧记录是坏链接而新记录有真实链接，则修复旧记录；否则才跳过。
      if (fileSize && existingFields['文件大小'] === fileSize) {
        if ((!oldHasValidLink && newHasValidLink) || (!existingAttachmentLinks && newAttachmentLinks) || (needsEnrichment(existingFields) && incomingHasEnrichment(fields))) {
          log('info', '更新旧记录(修复链接或补全字段): ' + fileName);
          await update(existing.record_id, fields);
          return { action: 'updated', record_id: existing.record_id, recordId: existing.record_id };
        }
        log('info', '去重跳过(文件名+大小且无需更新): ' + fileName);
        return { action: 'skipped', record_id: existing.record_id, recordId: existing.record_id };
      }

      // 场景2：同名但旧记录没有文件链接（上次上传失败）→ 更新旧记录
      if ((!existingLink && newLink) || (!existingAttachmentLinks && newAttachmentLinks) || (needsEnrichment(existingFields) && incomingHasEnrichment(fields))) {
        log('info', '更新旧记录(补文件链接或补全字段): ' + fileName);
        await update(existing.record_id, fields);
        return { action: 'updated', record_id: existing.record_id, recordId: existing.record_id };
      }

      // 场景3：同名但不同大小 → 可能是新版，写入新记录
      log('info', '同名不同大小，写入新记录: ' + fileName);
    }
  }

  // 内容哈希去重：如果有 fileHash，扫描全表找相同大小的同名文件
  if (fileHash && fileName) {
    try {
      const nameField = FIELD_MAPPING['文件名'] || '文件名';
      const resp = await client.bitable.appTableRecord.list({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID },
        params: {
          filter: `CurrentValue.[${nameField}] = "${fileName.replace(/"/g, '\\\\"')}"`,
          page_size: 50,
        },
      });
      if (resp.code === 0 && resp.data?.items?.length > 0) {
        for (const item of resp.data.items) {
          const f = item.fields || {};
          // 同名且同大小 → 重复
          if (f['文件大小'] === fileSize) {
            log('info', `去重跳过(同名同大小): ${fileName}`);
            return { action: 'skipped', record_id: item.record_id };
          }
        }
      }
    } catch (scanErr) {
      log('warn', `文件名扫描去重失败: ${scanErr.message}`);
    }
  }

  const recordId = await insert(fields);
  return { action: 'created', record_id: recordId, recordId };
}

/** 单字段关键词检索 */
export async function search(keyword) {
  const nameField = FIELD_MAPPING['文件名'] || '文件名';
  const resp = await client.bitable.appTableRecord.list({
    path: { app_token: APP_TOKEN, table_id: TABLE_ID },
    params: {
      filter: 'CurrentValue.[' + nameField + '].contains("' + keyword + '")',
      page_size: 10,
    },
  });
  assertOk(resp, '检索多维表格');
  return resp.data.items ?? [];
}

/** 多关键词合并检索 */
export async function searchMultiKeywords(keywords) {
  if (!keywords || keywords.length === 0) return [];
  const nameField = FIELD_MAPPING['文件名'] || '文件名';
  const tagField = FIELD_MAPPING['主题标签'] || '主题标签';
  const summaryField = FIELD_MAPPING['一句话摘要'] || '一句话摘要';
  const pointsField = FIELD_MAPPING['核心观点'] || '核心观点';
  const problemField = FIELD_MAPPING['解决的问题'] || '解决的问题';
  const typeField = FIELD_MAPPING['内容类型'] || '内容类型';
  const searchFields = [nameField, tagField, summaryField, pointsField, problemField, typeField]
    .filter(Boolean);

  const uniqueKeywords = [...new Set(keywords.map(q => String(q || '').trim()).filter(q => q.length >= 1))];
  const chunks = [];
  for (let i = 0; i < uniqueKeywords.length; i += 3) chunks.push(uniqueKeywords.slice(i, i + 3));

  const merged = new Map();
  for (const chunk of chunks) {
    const items = await searchKeywordChunk(chunk, searchFields, nameField);
    for (const item of items) merged.set(item.record_id, item);
    if (merged.size >= 50) break;
  }

  return Array.from(merged.values())
    .filter(r => !String(r.fields[nameField] || '').includes('【测试行'))
    .slice(0, 50);
}

async function searchKeywordChunk(keywords, searchFields, nameField) {
  const conditions = [];
  for (const q of keywords) {
    const variants = buildCaseVariants(q);
    for (const v of variants) {
      const escaped = v.replace(/"/g, '\\"');
      for (const f of searchFields) {
        conditions.push('CurrentValue.[' + f + '].contains("' + escaped + '")');
      }
    }
  }
  if (conditions.length === 0) return [];
  const filter = conditions.length === 1 ? conditions[0] : 'OR(' + conditions.join(',') + ')';
  try {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
      params: { filter, page_size: 50 },
    });
    if (resp.code !== 0) {
      log('warn', `searchKeywordChunk 失败 code=${resp.code} msg=${resp.msg || ''}`);
      return await searchKeywordsOneByOne(keywords, searchFields, nameField);
    }
    return resp.data.items ?? [];
  } catch (e) {
    log('warn', 'searchKeywordChunk 异常: ' + e.message);
    return await searchKeywordsOneByOne(keywords, searchFields, nameField);
  }
}

async function searchKeywordsOneByOne(keywords, searchFields, nameField) {
  const merged = new Map();
  for (const keyword of keywords) {
    for (const field of searchFields) {
      const escaped = keyword.replace(/"/g, '\\"');
      try {
        const resp = await client.bitable.appTableRecord.list({
          path: { app_token: APP_TOKEN, table_id: TABLE_ID },
          params: {
            filter: 'CurrentValue.[' + field + '].contains("' + escaped + '")',
            page_size: 20,
          },
        });
        if (resp.code !== 0) continue;
        for (const item of resp.data?.items || []) merged.set(item.record_id, item);
      } catch {
        // keep trying other fields
      }
    }
  }
  return Array.from(merged.values()).filter(r => !String(r.fields[nameField] || '').includes('【测试行'));
}

/** 多字段检索（单关键词） */
export async function searchMultiField(q) {
  const nameField = FIELD_MAPPING['文件名'] || '文件名';
  const tagField = FIELD_MAPPING['主题标签'] || '主题标签';
  const variants = buildCaseVariants(q);
  const conditions = [];
  for (const v of variants) {
    const escaped = v.replace(/"/g, '\\"');
    conditions.push('CurrentValue.[' + nameField + '].contains("' + escaped + '")');
    conditions.push('CurrentValue.[' + tagField + '].contains("' + escaped + '")');
  }
  if (conditions.length === 0) return [];
  const filter = 'OR(' + conditions.join(',') + ')';
  try {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
      params: { filter, page_size: 50 },
    });
    if (resp.code !== 0) return [];
    return (resp.data.items ?? []).filter(r => !String(r.fields[nameField] || '').includes('【测试行')).slice(0, 50);
  } catch (e) {
    return [];
  }
}

function buildCaseVariants(q) {
  const v = new Set([q]);
  if (/[a-zA-Z]/.test(q)) {
    v.add(q.toLowerCase());
    v.add(q.toUpperCase());
    v.add(q.charAt(0).toUpperCase() + q.slice(1).toLowerCase());
  }
  return Array.from(v);
}

export function formatRecords(records) {
  if (!records.length) return null;
  return records.map((r, i) => {
    const f = r.fields;
    const name = f[FIELD_MAPPING['文件名'] || '文件名'] ?? '未知文件';
    const person = f[FIELD_MAPPING['分享人'] || '分享人'] ? ' · ' + f[FIELD_MAPPING['分享人'] || '分享人'] : '';
    const link = f[FIELD_MAPPING['文件链接'] || '文件链接']?.link ?? f[FIELD_MAPPING['文件链接'] || '文件链接'] ?? '';
    return (i + 1) + '. ' + name + person + '\n   ' + link;
  }).join('\n\n');
}

export async function getByRecordIds(recordIds) {
  if (!recordIds || recordIds.length === 0) return [];
  const results = [];
  for (const rid of recordIds) {
    try {
      const resp = await client.bitable.appTableRecord.get({
        path: { app_token: APP_TOKEN, table_id: TABLE_ID, record_id: rid },
      });
      if (resp.code === 0 && resp.data?.record) results.push(resp.data.record);
    } catch (e) {
      log('warn', '获取记录 ' + rid + ' 失败: ' + e.message);
    }
  }
  return results;
}
