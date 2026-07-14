/**
 * tools/mcp_sync.js - Sync useful materials from Shengcai MCP into Bitable.
 */

import crypto from 'crypto';
import 'dotenv/config';
import { log } from '../lib/feishu.js';
import { createScysMcpClient } from '../lib/mcp_client.js';
import { insertIfNotExist } from '../lib/bitable.js';
import { extractFields } from '../lib/ai.js';
import { buildDocumentText } from '../lib/embedding.js';
import { assessResourceRelevance } from './relevance.js';
import { buildMcpShell, mergeMcpTags } from './mcp_shell.js';

const DEFAULT_LIMIT = 20;
const PREFERRED_MATERIAL_TOOLS = [
  'activityManualSearch',
  'activityPilotSearch',
  'projectLibSearch',
  'projectLibList',
  'contentSearch',
  'searchTopic',
];
const DEFAULT_BATCH_TOOLS = [
  'activityManualSearch',
  'activityPilotSearch',
  'projectLibSearch',
];
const MANUAL_CHAIN_TOOL_HINTS = {
  activityList: [/航海列表/, /activity.*list/i, /voyage.*list/i, /sailing.*list/i, /haohang.*list/i],
  chapterList: [/航海手册目录/, /航海手册章节列表/, /手册章节列表/, /手册目录/, /activityManualToc/i, /manual.*toc/i, /chapter.*list/i, /manual.*chapter.*list/i],
  chapterDetail: [/航海手册章节详情/, /手册章节详情/, /activityManualDetail/i, /chapter.*detail/i, /manual.*chapter.*detail/i],
};
const DEFAULT_BATCH_QUERIES = [
  'AI',
  '小红书',
  '短视频',
  '电商',
  '私域',
  '直播',
  '复盘',
  'SOP',
];

function normalizeText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/<\/?em>/gi, '').replace(/<[^>]+>/g, '').trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    if (value.text || value.content || value.summary || value.title) {
      return [value.title, value.summary, value.content, value.text].map(normalizeText).filter(Boolean).join('\n');
    }
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function flattenContentBlocks(result) {
  const content = result?.content || result?.structuredContent || result;
  if (Array.isArray(content)) {
    return content.map(item => {
      if (item?.type === 'text') return item.text || '';
      if (item?.text) return item.text;
      return normalizeText(item);
    }).filter(Boolean).join('\n');
  }
  return normalizeText(content);
}

function tryParseJson(value) {
  if (!value || typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* keep text */ }
    }
  }
  return value;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.materials)) return value.materials;
  if (Array.isArray(value.resources)) return value.resources;
  if (Array.isArray(value.list)) return value.list;
  if (Array.isArray(value.records)) return value.records;
  if (value.data && typeof value.data === 'object') return asArray(value.data);
  return [value];
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null && value !== '') return value;
  }
  return '';
}

function unwrapMcpItem(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.topicDTO && typeof raw.topicDTO === 'object') {
    const topic = raw.topicDTO;
    const user = raw.topicUserDTO || {};
    return {
      ...raw,
      ...topic,
      detailUrl: raw.detailUrl || topic.detailUrl,
      author: pick(user, ['userName', 'name', 'nickname', 'nickName']) || pick(topic, ['author', 'nickname', 'userName']),
      rawResult: raw,
    };
  }
  if (raw.projectLibDTO && typeof raw.projectLibDTO === 'object') {
    return { ...raw, ...raw.projectLibDTO, rawResult: raw };
  }
  return raw;
}

function normalizeUrl(value) {
  const text = normalizeText(value);
  if (!/^https?:\/\//i.test(text)) return '';
  try {
    return new URL(text).toString();
  } catch {
    return '';
  }
}

function collectUrls(value) {
  if (!value) return [];
  if (typeof value === 'string') return [normalizeUrl(value)].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (typeof value === 'object') {
    return [
      value.url,
      value.link,
      value.href,
      value.hrefUrl,
      value.detailUrl,
      value.image,
      value.imageUrl,
      value.fileUrl,
    ].flatMap(collectUrls);
  }
  return [];
}

function makeUrlCell(url, text) {
  const link = normalizeUrl(url);
  if (!link) return '';
  return { link, text: normalizeText(text) || link };
}

function normalizeMaterial(raw, index = 0, sourceTool = '') {
  const item = raw && typeof raw === 'object' ? unwrapMcpItem(raw) : { content: normalizeText(raw) };
  const id = normalizeText(pick(item, [
    'id',
    'projectId',
    'activityId',
    'chapterId',
    'sectionId',
    'manualId',
    'manualChapterId',
    'entityId',
    'material_id',
    'resource_id',
    'post_id',
    'document_id',
    'uuid',
  ])) || `mcp_${index}`;
  const title =
    normalizeText(pick(item, ['title', 'name', 'activityName', 'chapterName', 'sectionName', 'manualName', 'highlightShowTitle', 'fileName', 'file_name', 'subject'])) ||
    normalizeText(item.content || item.text || item.summary || '').slice(0, 40) ||
    `MCP资料_${index + 1}`;
  const summary = normalizeText(pick(item, ['summary', 'description', 'desc', 'abstract', 'brief']));
  const content = normalizeText(pick(item, ['content', 'text', 'markdown', 'body', 'detail', 'articleContent', 'highlightArticleContent', 'highlightText'])) || summary;
  const attachments = collectUrls(pick(item, ['imageList', 'questionImages', 'miniQuestionImageList', 'images', 'files', 'attachments']));
  const url = normalizeUrl(pick(item, ['url', 'link', 'source_url', 'web_url', 'href', 'hrefUrl', 'detailUrl'])) || attachments[0] || '';
  const author = normalizeText(pick(item, ['author', 'creator', 'user_name', 'nickname', 'speaker', 'shareUserNickName']));
  const inferredType =
    sourceTool === 'activityManualSearch' || /manual|chapter|航海手册|章节/i.test(sourceTool) ? '航海手册' :
    sourceTool === 'activityPilotSearch' ? '高手领航' :
    sourceTool === 'projectLibSearch' || sourceTool === 'projectLibList' ? '项目库案例' :
    sourceTool === 'searchTopic' || sourceTool === 'contentSearch' ? '生财帖子' :
    '';
  const type = normalizeText(pick(item, ['type', 'material_type', 'resource_type', 'category'])) || inferredType;
  const tagsRaw = pick(item, ['tags', 'tag_names', 'keywords', 'labels']);
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map(normalizeText).filter(Boolean) : normalizeText(tagsRaw);
  const updatedAt = normalizeText(pick(item, ['updated_at', 'updateTime', 'updatedAt', 'mtime']));
  const createdAt = normalizeText(pick(item, ['created_at', 'createTime', 'createdAt', 'ctime', 'gmtCreate', 'gmtPublish', 'shareTime']));

  return {
    id,
    title,
    summary,
    content,
    url,
    attachments,
    author,
    type,
    tags,
    updatedAt,
    createdAt,
    sourceTool,
    raw: item,
  };
}

function splitList(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  return String(value).split(/[,，;\n]+/).map(v => v.trim()).filter(Boolean);
}

function chooseTool(tools, preferredName = '') {
  if (preferredName) {
    const preferredNames = String(preferredName).split(',').map(s => s.trim()).filter(Boolean);
    for (const name of preferredNames) {
      const found = tools.find(t => t.name === name);
      if (found) return found;
    }
  }

  for (const name of PREFERRED_MATERIAL_TOOLS) {
    const found = tools.find(t => t.name === name);
    if (found) return found;
  }

  const candidates = tools.map(tool => {
    const haystack = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
    let score = 0;
    if (/manual|pilot|projectlib|contentsearch|searchtopic|activity/.test(haystack)) score += 6;
    if (/search|query|find|list/.test(haystack)) score += 3;
    if (/material|resource|document|post|content|资料|文档|搜索|内容|航海|手册|领航|项目库/.test(haystack)) score += 4;
    if (/chat|comment|message|private|user|relation|dashboard|token|reset|auth|delete|remove/.test(haystack)) score -= 10;
    return { tool, score };
  }).sort((a, b) => b.score - a.score);

  return candidates[0]?.score > 0 ? candidates[0].tool : null;
}

function toolText(tool) {
  return `${tool?.name || ''} ${tool?.description || ''}`;
}

function findToolByHints(tools, hintList) {
  return tools.find(tool => hintList.some(re => re.test(toolText(tool))));
}

function findManualChainTools(tools) {
  const byName = name => tools.find(tool => tool.name === name);
  const activityList = byName('activityList') || findToolByHints(tools, MANUAL_CHAIN_TOOL_HINTS.activityList);
  const chapterList = byName('activityManualToc') || findToolByHints(tools, MANUAL_CHAIN_TOOL_HINTS.chapterList);
  const chapterDetail = byName('activityManualDetail') || findToolByHints(tools, MANUAL_CHAIN_TOOL_HINTS.chapterDetail);
  return { activityList, chapterList, chapterDetail };
}

function buildToolArgs(tool, options) {
  const query = options.query || process.env.SCYS_MCP_DEFAULT_QUERY || '航海 资料 课程 PPT 直播 复盘 SOP 模板 案例 AI';
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const schemaProps = tool?.inputSchema?.properties || {};
  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const args = {};

  for (const key of Object.keys(schemaProps)) {
    const prop = schemaProps[key] || {};
    if (/target.*(user|xq|group).*id|targetXqGroupNumber/i.test(key)) continue;
    if (/^keyword$/i.test(key) || /^query$/i.test(key) || /^q$/i.test(key) || /^search(Text|Keyword|Query)?$/i.test(key)) args[key] = query;
    else if (/limit|size|pageSize|perPage|count/i.test(key)) args[key] = Math.min(limit, 50);
    else if (/pageIndex/i.test(key)) args[key] = 1;
    else if (/page/i.test(key)) args[key] = 1;
    else if (/displayMode/i.test(key)) args[key] = 1;
    else if (/pageScene/i.test(key)) args[key] = 'all';
    else if (/sortType/i.test(key)) args[key] = 'latest';
    else if (required.includes(key)) {
      if (prop.type === 'array') args[key] = [];
      else if (prop.type === 'boolean') args[key] = null;
      else if (prop.type === 'integer' || prop.type === 'number') args[key] = null;
      else if (prop.enum?.length) args[key] = prop.enum[0];
      else args[key] = '';
    }
  }

  if (Object.keys(args).length === 0) {
    return { query, limit };
  }
  return args;
}

function getId(raw, keys) {
  return normalizeText(pick(raw, keys));
}

function normalizeActivity(raw, index = 0) {
  const item = raw && typeof raw === 'object' ? raw : { title: normalizeText(raw) };
  return {
    id: getId(item, ['id', 'activityId', 'voyageId', 'sailingId', 'haohangId', 'manualId', 'entityId', 'uuid']) || '',
    title: normalizeText(pick(item, ['title', 'name', 'activityName', 'voyageName', 'sailingName', 'manualName'])) || `航海_${index + 1}`,
    raw: item,
  };
}

function normalizeChapter(raw, activity, index = 0) {
  const item = raw && typeof raw === 'object' ? raw : { title: normalizeText(raw) };
  return {
    id: getId(item, ['itemId', 'id', 'chapterId', 'sectionId', 'manualChapterId', 'nodeId', 'entityId', 'uuid']) || '',
    title: normalizeText(pick(item, ['title', 'name', 'chapterName', 'sectionName', 'manualChapterName'])) || `章节_${index + 1}`,
    raw: item,
  };
}

function buildManualToolArgs(tool, options = {}) {
  const schemaProps = tool?.inputSchema?.properties || {};
  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const args = {};
  const activity = options.activity || {};
  const chapter = options.chapter || {};
  const limit = Number(options.limit || DEFAULT_LIMIT);

  for (const key of Object.keys(schemaProps)) {
    const prop = schemaProps[key] || {};
    if (/item.*id/i.test(key)) args[key] = chapter.id || '';
    else if (/chapter|section|node/i.test(key) && /id|token|key/i.test(key)) args[key] = chapter.id || '';
    else if (/activity|voyage|sailing|haohang|manual/i.test(key) && /id|token|key/i.test(key)) args[key] = activity.id || '';
    else if (/chapter|section/i.test(key) && /name|title/i.test(key)) args[key] = chapter.title || '';
    else if (/activity|voyage|sailing|haohang|manual/i.test(key) && /name|title/i.test(key)) args[key] = activity.title || '';
    else if (/query|keyword|q|search/i.test(key)) {
      if (options.query) args[key] = options.query;
    }
    else if (/limit|size|pageSize|perPage|count/i.test(key)) args[key] = Math.min(limit, 50);
    else if (/pageIndex/i.test(key)) args[key] = 1;
    else if (/page/i.test(key)) args[key] = 1;
    else if (/displayMode/i.test(key)) args[key] = 1;
    else if (/pageScene/i.test(key)) args[key] = 'all';
    else if (/sortType/i.test(key)) args[key] = 'latest';
    else if (/withTimeline/i.test(key)) args[key] = false;
    else if (/offset/i.test(key)) args[key] = 0;
    else if (/maxChars/i.test(key)) args[key] = Math.min(Number(options.maxChars || 20000), 50000);
    else if (/format/i.test(key)) args[key] = options.format || 'text';
    else if (required.includes(key)) {
      if (prop.type === 'array') args[key] = [];
      else if (prop.type === 'boolean') args[key] = null;
      else if (prop.type === 'integer' || prop.type === 'number') args[key] = null;
      else if (prop.enum?.length) args[key] = prop.enum[0];
      else args[key] = '';
    }
  }

  return args;
}

function cleanArgsForSchema(args, tool) {
  const schemaProps = tool?.inputSchema?.properties || {};
  const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
  const cleaned = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (!(key in schemaProps)) continue;
    if ((value === '' || value == null) && !required.includes(key)) continue;
    const prop = schemaProps[key] || {};
    if ((prop.type === 'integer' || prop.type === 'number') && value !== '' && value != null) {
      const number = Number(value);
      if (Number.isFinite(number)) cleaned[key] = number;
      else if (required.includes(key)) cleaned[key] = value;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

async function callToolAsItems(client, tool, args) {
  const cleanedArgs = cleanArgsForSchema(args, tool);
  log('info', `调用生财 MCP 工具: ${tool.name} args=${JSON.stringify(cleanedArgs).slice(0, 200)}`);
  const result = await client.callTool(tool.name, cleanedArgs);
  const textPayload = flattenContentBlocks(result);
  const parsed = tryParseJson(textPayload);
  return asArray(parsed);
}

function getBatchQueries(options = {}) {
  if (options.query) return [options.query];
  return splitList(process.env.SCYS_MCP_SYNC_QUERIES, DEFAULT_BATCH_QUERIES);
}

function getBatchToolNames(tools, options = {}) {
  const configured = options.toolName || process.env.SCYS_MCP_MATERIAL_TOOLS || process.env.SCYS_MCP_MATERIAL_TOOL;
  const names = splitList(configured, DEFAULT_BATCH_TOOLS);
  return names.filter(name => tools.some(tool => tool.name === name));
}

function materialToFields(material, aiFields, relevance) {
  const shell = buildMcpShell(material);
  const fingerprintSource = material.url || material.id || `${material.title}:${material.content.slice(0, 200)}`;
  const fingerprint = 'mcp:' + crypto.createHash('sha256').update(fingerprintSource).digest('hex');
  const sourceLink = makeUrlCell(material.url, material.title);
  const sourceNote = [
    '来源：生财MCP',
    material.id ? `外部ID：${material.id}` : '',
    material.url ? `原文链接：${material.url}` : '',
    material.attachments?.length ? `附件链接数：${material.attachments.length}` : '',
    material.updatedAt ? `外部更新时间：${material.updatedAt}` : '',
    relevance?.reason ? `价值判断：${relevance.reason}` : '',
  ].filter(Boolean).join('\n');

  return {
    '文件名': material.title,
    '活动名称': aiFields.活动名称 || `${material.title}｜生财MCP`,
    '分享人': aiFields.分享人 || material.author || '',
    '主题标签': mergeMcpTags(aiFields.主题标签, shell.tags),
    '航海期次': aiFields.航海期次 || '',
    '上传时间': material.createdAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    '一句话摘要': aiFields.一句话摘要 || shell.summary,
    '核心观点': Array.isArray(aiFields.核心观点) && aiFields.核心观点.length ? aiFields.核心观点.join('\n') : shell.corePoints.join('\n'),
    '内容类型': aiFields.内容类型 && aiFields.内容类型 !== '其他' ? aiFields.内容类型 : shell.contentType,
    '适合人群': Array.isArray(aiFields.适合人群) && aiFields.适合人群.length ? aiFields.适合人群 : shell.audience,
    '推荐优先级': aiFields.推荐优先级 || shell.priority,
    '文档完整度': aiFields.文档完整度 || shell.completeness,
    '解决的问题': aiFields.解决的问题 || shell.problem,
    'AI置信度': aiFields.置信度 || 0.5,
    '文件链接': sourceLink,
    '原文链接': sourceLink,
    '附件链接': Array.isArray(material.attachments) && material.attachments.length ? material.attachments.join('\n') : '',
    '归档时间': Date.now(),
    '是否有实操': !!aiFields.是否有实操,
    '是否有案例': !!aiFields.是否有案例,
    '归档理由': [aiFields.归档理由 || 'MCP同步入库', shell.archiveReason, sourceNote].filter(Boolean).join('\n'),
    '文件大小': material.content ? String(material.content.length) : '',
    '内容指纹': fingerprint,
  };
}

async function indexRecord(recordId, fields) {
  if (!recordId) return;
  const text = buildDocumentText(fields);
  if (!text) return;
  const { addToIndex } = await import('../lib/embedding.js');
  addToIndex(recordId, text);
}

async function insertMcpFields(fields, material) {
  try {
    return { result: await insertIfNotExist(fields), fields, degraded: false };
  } catch (err) {
    if (!/URLFieldConvFail|URL.*Conv|url/i.test(err.message || '')) throw err;
    const fallbackFields = {
      ...fields,
      '文件链接': '',
      '原文链接': '',
      '归档理由': [fields['归档理由'], material.url ? `链接字段写入失败，原链接：${material.url}` : '链接字段写入失败，已跳过URL字段'].filter(Boolean).join('\n'),
    };
    log('warn', `MCP URL字段写入失败，改为无链接入库: ${material.title}`);
    return { result: await insertIfNotExist(fallbackFields), fields: fallbackFields, degraded: true };
  }
}

async function persistMcpMaterial(material, { dryRun = false, forceKeep = false } = {}) {
  const ai = dryRun
    ? {}
    : await extractFields(
      material.title,
      ['来源：生财MCP', material.summary, material.tags].filter(Boolean).join('\n'),
      material.author,
      material.content || material.summary || null
    );
  const fields = materialToFields(material, ai, null);
  const relevance = assessResourceRelevance(fields);
  if (!forceKeep && !relevance.keep) {
    return {
      action: 'lowValue',
      title: material.title,
      reason: relevance.reason,
      sample: `跳过低价值：${material.title}（${relevance.reason}）`,
    };
  }
  fields['归档理由'] = [fields['归档理由'], `MCP价值分=${relevance.score}：${relevance.reason}`].filter(Boolean).join('\n');

  if (dryRun) {
    return {
      action: 'created',
      title: material.title,
      sample: `预览入库：${material.title}${material.url ? `（链接：${material.url.slice(0, 60)}）` : '（无链接）'}`,
    };
  }

  const { result, fields: persistedFields, degraded } = await insertMcpFields(fields, material);
  await indexRecord(result.record_id || result.recordId, persistedFields);
  return {
    action: result.action,
    title: material.title,
    sample: `${result.action}: ${material.title}${degraded ? '（URL字段已跳过）' : ''}`,
  };
}

async function syncManualChapterChain(client, tools, options = {}) {
  const dryRun = options.dryRun === true;
  const limit = Number(options.limit || process.env.SCYS_MCP_MANUAL_SYNC_LIMIT || DEFAULT_LIMIT);
  const activityLimit = Number(options.activityLimit || process.env.SCYS_MCP_ACTIVITY_LIMIT || 3);
  const chapterLimit = Number(options.chapterLimit || process.env.SCYS_MCP_CHAPTER_LIMIT || 10);
  const chainTools = findManualChainTools(tools);

  if (!chainTools.activityList || !chainTools.chapterList || !chainTools.chapterDetail) {
    return {
      success: false,
      mode: 'manual_chapters',
      missingTools: {
        activityList: !chainTools.activityList,
        chapterList: !chainTools.chapterList,
        chapterDetail: !chainTools.chapterDetail,
      },
      replyText: [
        '已连上 MCP，但没有凑齐“航海列表 → 航海手册章节列表 → 航海手册章节详情”三类工具。',
        `当前可用工具：${tools.map(t => t.name).join(', ') || '无'}`,
      ].join('\n'),
    };
  }

  const activityItems = await callToolAsItems(
    client,
    chainTools.activityList,
    buildManualToolArgs(chainTools.activityList, { ...options, limit: activityLimit })
  );
  const activities = activityItems.slice(0, activityLimit).map(normalizeActivity);

  const aggregate = {
    success: true,
    mode: 'manual_chapters',
    tools: {
      activityList: chainTools.activityList.name,
      chapterList: chainTools.chapterList.name,
      chapterDetail: chainTools.chapterDetail.name,
    },
    total: 0,
    created: 0,
    updated: 0,
    skippedDuplicate: 0,
    skippedLowValue: 0,
    failed: 0,
    samples: [],
  };

  for (const activity of activities) {
    if (aggregate.created + aggregate.updated + aggregate.skippedDuplicate + aggregate.skippedLowValue + aggregate.failed >= limit) break;

    let chapters = [];
    try {
      const chapterItems = await callToolAsItems(
        client,
        chainTools.chapterList,
        buildManualToolArgs(chainTools.chapterList, { ...options, activity, limit: chapterLimit })
      );
      chapters = chapterItems.slice(0, chapterLimit).map((item, index) => normalizeChapter(item, activity, index));
    } catch (err) {
      aggregate.failed++;
      aggregate.samples.push(`${activity.title}: 章节列表失败（${err.message.slice(0, 80)}）`);
      continue;
    }

    for (const chapter of chapters) {
      const processed = aggregate.created + aggregate.updated + aggregate.skippedDuplicate + aggregate.skippedLowValue + aggregate.failed;
      if (processed >= limit) break;

      try {
        const detailItems = await callToolAsItems(
          client,
          chainTools.chapterDetail,
          buildManualToolArgs(chainTools.chapterDetail, { ...options, activity, chapter, limit: 1 })
        );
        const detail = detailItems[0] && typeof detailItems[0] === 'object' ? detailItems[0] : { content: normalizeText(detailItems[0]) };
        const material = normalizeMaterial({
          ...detail,
          id: getId(detail, ['id', 'chapterId', 'sectionId', 'manualChapterId']) || `${activity.id}:${chapter.id}`,
          activityId: activity.id,
          chapterId: chapter.id,
          title: `${activity.title}｜${chapter.title}`,
          activityName: activity.title,
          chapterName: chapter.title,
          content: normalizeText(pick(detail, ['content', 'text', 'markdown', 'body', 'detail', 'articleContent'])) || normalizeText(detail),
          summary: normalizeText(pick(detail, ['summary', 'description', 'desc', 'abstract', 'brief'])) || normalizeText(chapter.raw?.summary),
          rawActivity: activity.raw,
          rawChapter: chapter.raw,
        }, aggregate.total, chainTools.chapterDetail.name);
        material.type = '航海手册';
        material.tags = mergeMcpTags(material.tags, ['航海手册', activity.title, chapter.title]);
        aggregate.total++;

        const result = await persistMcpMaterial(material, { dryRun, forceKeep: true });
        if (result.action === 'created') aggregate.created++;
        else if (result.action === 'updated') aggregate.updated++;
        else if (result.action === 'lowValue') aggregate.skippedLowValue++;
        else aggregate.skippedDuplicate++;
        aggregate.samples.push(result.sample);
      } catch (err) {
        aggregate.failed++;
        aggregate.samples.push(`${activity.title}/${chapter.title}: 详情失败（${err.message.slice(0, 80)}）`);
        log('warn', `MCP航海手册章节处理失败 ${activity.title}/${chapter.title}: ${err.message}`);
      }
    }
  }

  aggregate.replyText = [
    '生财 MCP 航海手册同步完成',
    `工具链：${chainTools.activityList.name} → ${chainTools.chapterList.name} → ${chainTools.chapterDetail.name}`,
    `航海：${activities.length} 个，章节详情读取：${aggregate.total} 条`,
    `新增：${aggregate.created} 条，更新：${aggregate.updated} 条，重复跳过：${aggregate.skippedDuplicate} 条，低价值跳过：${aggregate.skippedLowValue} 条，失败：${aggregate.failed} 条`,
    dryRun ? '当前为 dryRun 预览，未写入多维表格' : '',
    aggregate.samples.slice(0, 10).join('\n'),
  ].filter(Boolean).join('\n');

  return aggregate;
}

async function syncOneMcpTool(client, tools, options = {}) {
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const dryRun = options.dryRun === true;
  const tool = chooseTool(tools, options.toolName || process.env.SCYS_MCP_MATERIAL_TOOL);

  if (!tool) {
    return {
      success: false,
      tools: tools.map(t => ({ name: t.name, description: t.description })),
      replyText: `已连上 MCP，但没有找到像“资料搜索/列表”的工具。可用工具：${tools.map(t => t.name).join(', ') || '无'}`,
    };
  }

  const args = options.toolArgs || buildToolArgs(tool, { ...options, limit });
  const cleanedArgs = cleanArgsForSchema(args, tool);
  log('info', `调用生财 MCP 工具: ${tool.name} args=${JSON.stringify(cleanedArgs).slice(0, 200)}`);
  const result = await client.callTool(tool.name, cleanedArgs);
  const textPayload = flattenContentBlocks(result);
  const parsed = tryParseJson(textPayload);
  const rawItems = asArray(parsed);
  const materials = rawItems.slice(0, limit).map((item, index) => normalizeMaterial(item, index, tool.name));

  let created = 0;
  let updated = 0;
  let skippedDuplicate = 0;
  let skippedLowValue = 0;
  let failed = 0;
  const samples = [];

  for (const material of materials) {
    try {
      const persisted = await persistMcpMaterial(material, { dryRun });
      if (persisted.action === 'lowValue') {
        skippedLowValue++;
        samples.push(persisted.sample);
        continue;
      }
      if (persisted.action === 'created') created++;
      else if (persisted.action === 'updated') updated++;
      else skippedDuplicate++;
      samples.push(persisted.sample);
    } catch (err) {
      failed++;
      samples.push(`失败：${material.title}（${err.message.slice(0, 80)}）`);
      log('warn', `MCP资料处理失败 ${material.title}: ${err.message}`);
    }
  }

  const report = [
    `生财 MCP 同步完成`,
    `工具：${tool.name}`,
    `读取：${materials.length} 条`,
    `新增：${created} 条，更新：${updated} 条，重复跳过：${skippedDuplicate} 条，低价值跳过：${skippedLowValue} 条，失败：${failed} 条`,
    dryRun ? '当前为 dryRun 预览，未写入多维表格' : '',
    samples.slice(0, 8).join('\n'),
  ].filter(Boolean).join('\n');

  return {
    success: true,
    tool: tool.name,
    args,
    total: materials.length,
    created,
    updated,
    skippedDuplicate,
    skippedLowValue,
    failed,
    samples,
    replyText: report,
  };
}

export async function syncScysMcpMaterials(options = {}) {
  const client = createScysMcpClient();
  const dryRun = options.dryRun === true;
  const maxTotal = Number(options.limit || DEFAULT_LIMIT);
  const perQueryLimit = Number(options.perQueryLimit || process.env.SCYS_MCP_PER_QUERY_LIMIT || 5);

  if (!client.enabled) {
    return {
      success: false,
      error: 'SCYS_MCP_TOKEN 未配置',
      replyText: '还没有配置生财 MCP 密钥。请先在 .env 添加 SCYS_MCP_TOKEN。',
    };
  }

  let tools;
  try {
    tools = await client.listTools();
  } catch (err) {
    return {
      success: false,
      error: err.message,
      replyText: [
        '生财 MCP 暂时连接失败，资料还没有开始写入。',
        `原因：${err.message}`,
        '你可以稍后私聊我发送「同步MCP资料」重试。',
      ].join('\n'),
    };
  }

  if (options.toolArgs || options.query || options.toolName) {
    if (options.mode === 'manual_chapters') {
      return await syncManualChapterChain(client, tools, options);
    }
    return await syncOneMcpTool(client, tools, options);
  }

  if (options.mode === 'manual_chapters' || process.env.SCYS_MCP_SYNC_MANUAL_CHAPTERS === 'true') {
    const manualResult = await syncManualChapterChain(client, tools, options);
    if (options.mode === 'manual_chapters' || !manualResult.success) return manualResult;
  }

  const toolNames = getBatchToolNames(tools, options);
  const queries = getBatchQueries(options);
  if (!toolNames.length) {
    return {
      success: false,
      tools: tools.map(t => ({ name: t.name, description: t.description })),
      replyText: `已连上 MCP，但没有找到可用于资料同步的工具。可用工具：${tools.map(t => t.name).join(', ') || '无'}`,
    };
  }

  const aggregate = {
    success: true,
    mode: 'batch',
    tools: toolNames,
    queries,
    total: 0,
    created: 0,
    updated: 0,
    skippedDuplicate: 0,
    skippedLowValue: 0,
    failed: 0,
    samples: [],
  };

  for (const toolName of toolNames) {
    for (const query of queries) {
      const processed = aggregate.created + aggregate.updated + aggregate.skippedDuplicate + aggregate.skippedLowValue + aggregate.failed;
      if (processed >= maxTotal) break;

      const remaining = Math.max(1, Math.min(perQueryLimit, maxTotal - processed));
      try {
        const result = await syncOneMcpTool(client, tools, {
          ...options,
          toolName,
          query,
          limit: remaining,
          dryRun,
        });
        aggregate.total += result.total || 0;
        aggregate.created += result.created || 0;
        aggregate.updated += result.updated || 0;
        aggregate.skippedDuplicate += result.skippedDuplicate || 0;
        aggregate.skippedLowValue += result.skippedLowValue || 0;
        aggregate.failed += result.failed || 0;
        aggregate.samples.push(...(result.samples || []).map(sample => `${toolName}/${query}: ${sample}`));
      } catch (err) {
        aggregate.failed++;
        aggregate.samples.push(`${toolName}/${query}: 失败（${err.message.slice(0, 80)}）`);
        log('warn', `MCP批量同步失败 ${toolName}/${query}: ${err.message}`);
      }
    }
  }

  aggregate.replyText = [
    '生财 MCP 批量同步完成',
    `工具：${toolNames.join(', ')}`,
    `关键词：${queries.join('、')}`,
    `读取：${aggregate.total} 条`,
    `新增：${aggregate.created} 条，更新：${aggregate.updated} 条，重复跳过：${aggregate.skippedDuplicate} 条，低价值跳过：${aggregate.skippedLowValue} 条，失败：${aggregate.failed} 条`,
    dryRun ? '当前为 dryRun 预览，未写入多维表格' : '',
    aggregate.samples.slice(0, 10).join('\n'),
  ].filter(Boolean).join('\n');

  return aggregate;
}

export async function inspectScysMcpTools() {
  const client = createScysMcpClient();
  if (!client.enabled) {
    return {
      success: false,
      replyText: '还没有配置生财 MCP 密钥。请先在 .env 添加 SCYS_MCP_TOKEN。',
    };
  }
  let tools;
  try {
    tools = await client.listTools();
  } catch (err) {
    return {
      success: false,
      error: err.message,
      replyText: [
        '生财 MCP 暂时连接失败。',
        `原因：${err.message}`,
        '这通常是远端接口或本机网络短暂抖动，不是资料库写入问题。',
      ].join('\n'),
    };
  }
  return {
    success: true,
    tools,
    replyText: `生财 MCP 可用工具：\n${tools.map(t => `- ${t.name}${t.description ? `：${t.description}` : ''}`).join('\n') || '无'}`,
  };
}

export async function run(args = {}) {
  if (args.inspectOnly) return await inspectScysMcpTools();
  return await syncScysMcpMaterials(args);
}
