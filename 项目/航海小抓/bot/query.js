/**
 * query.js — 自然语言查询处理器（Phase 2：关键词 + 语义混合检索）
 *
 * 流程：
 *  1. 提取关键词
 *  2. 关键词匹配（Bitable 多字段 contains）
 *  3. 语义匹配（Embedding 余弦相似度）
 *  4. 合并去重、按置信度排序
 *  5. 紧凑格式回复
 */

import 'dotenv/config';
import { client, log } from '../lib/feishu.js';
import { searchMultiField, searchMultiKeywords, getByRecordIds } from '../lib/bitable.js';
import { extractSearchKeywords, expandQueryKeywords } from '../lib/ai.js';
import { embed, buildQueryText } from '../lib/embedding.js';
import { assessResourceRelevance, classifyLibraryMaterial } from '../tools/relevance.js';
import { recordNoResultSearch } from '../memory/search_feedback.js';
import { appendLibraryFooter, getLibraryLinks } from '../tools/reply_footer.js';

const KEYWORD_WEIGHT = 1.0;
const SEMANTIC_WEIGHT = 1.2;
const REQUIRED_SEARCH_FIELDS = ['文件名', '主题标签', '一句话摘要'];

function extractValidUrl(value) {
  const url = value?.link ?? value ?? '';
  if (typeof url !== 'string') return '';
  if (!/^https?:\/\//.test(url)) return '';
  if (url.includes('/file/test')) return '';
  return url;
}

function normalize(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (value && typeof value === 'object') return [value.text, value.link].filter(Boolean).join(' ');
  return String(value || '');
}

function isMarkedBad(fields = {}) {
  const confidence = Number(fields['AI置信度'] || 0);
  const name = normalize(fields['文件名']);
  const reason = normalize(fields['归档理由']);
  return confidence < 0 || /^\[已清理\]/.test(name) || /待审核|低价值|无关|垃圾/.test(reason);
}

function isSearchReady(fields = {}) {
  if (isMarkedBad(fields)) return false;
  if (!assessResourceRelevance(fields).keep) return false;
  const libraryClass = classifyLibraryMaterial(fields);
  if (libraryClass.status !== '可用') return false;
  return REQUIRED_SEARCH_FIELDS.every(name => normalize(fields[name]).trim());
}

function qualityBoost(fields = {}) {
  const relevance = assessResourceRelevance(fields);
  if (!relevance.keep) return -999;
  const libraryClass = classifyLibraryMaterial(fields);
  if (libraryClass.status !== '可用') return -999;

  let score = 0;
  if (normalize(fields['一句话摘要'])) score += 0.15;
  if (normalize(fields['核心观点'])) score += 0.2;
  if (normalize(fields['解决的问题'])) score += 0.25;
  if (normalize(fields['内容类型']) && normalize(fields['内容类型']) !== '其他') score += 0.15;
  if (normalize(fields['推荐优先级']) === '推荐') score += 0.15;
  if (extractValidUrl(fields['文件链接'])) score += 0.1;
  if (String(fields['内容指纹'] || '').startsWith('mcp:')) score += 0.05;
  return score + Math.max(-0.4, Math.min(0.4, relevance.score * 0.05));
}

function includesText(source, keyword) {
  return source.toLowerCase().includes(String(keyword || '').toLowerCase());
}

function keywordMatchScore(fields = {}, cleaned = '', keywords = []) {
  const name = normalize(fields['文件名']);
  const tags = normalize(fields['主题标签']);
  const summary = normalize(fields['一句话摘要']);
  const points = normalize(fields['核心观点']);
  const problem = normalize(fields['解决的问题']);
  const type = normalize(fields['内容类型']);
  const candidates = [...new Set([cleaned, ...keywords].map(k => String(k || '').trim()).filter(k => k.length >= 2))];

  let score = 0;
  for (const keyword of candidates) {
    if (includesText(name, keyword)) score += keyword === cleaned ? 1.2 : 0.65;
    if (includesText(tags, keyword)) score += 0.35;
    if (includesText(summary, keyword)) score += 0.22;
    if (includesText(problem, keyword)) score += 0.22;
    if (includesText(points, keyword)) score += 0.18;
    if (includesText(type, keyword)) score += 0.12;
  }

  const coreTerms = candidates.filter(k => cleaned.includes(k) && k !== cleaned);
  const titleHitCount = coreTerms.filter(k => includesText(name, k)).length;
  if (coreTerms.length >= 2 && titleHitCount >= 2) score += 1.0;
  if (includesText(name, cleaned)) score += 1.0;
  return score;
}

function deriveQueryHints(text = '') {
  const hints = [];
  const rules = [
    /小红书/g,
    /视频号/g,
    /抖音/g,
    /B站|B 站/g,
    /AI|人工智能|大模型/g,
    /硬件/g,
    /约拍/g,
    /电商/g,
    /私域/g,
    /直播/g,
    /短视频/g,
    /短剧/g,
    /诊断/g,
    /陪跑/g,
    /SOP/g,
    /复盘/g,
    /高手领航/g,
    /航海手册/g,
  ];
  for (const re of rules) {
    const matches = text.match(re);
    if (matches) hints.push(...matches);
  }
  if (/^[\u4e00-\u9fa5]{4,}$/.test(text)) {
    for (let i = 0; i < text.length - 1; i++) {
      const token = text.slice(i, i + 2);
      if (!/资料|文档|帮我|查找|搜索/.test(token)) hints.push(token);
    }
  }
  return hints;
}

/**
 * 处理查询请求
 * @param {Object} event - 飞书事件对象
 * @param {string} userText - 用户查询文本
 * @param {Object} [options] - 可选参数
 * @param {boolean} [options.skipSend] - 为 true 时不调用 sendText，仅返回 records
 */
export async function handleQuery(event, userText, options = {}) {
  const chatId = event.message.chat_id;
  const startTime = Date.now();

  const cleaned = userText.trim().replace(/^[@\s]+/, '').trim();
  if (!cleaned || cleaned.length < 2) {
    await sendText(chatId, '请输入关键词，如「AI沙龙」「张三」');
    return;
  }

  // === Step 1: 提取关键词 + 语义扩展 ===
  const [keywords, expanded] = await Promise.all([
    extractSearchKeywords(cleaned),
    expandQueryKeywords(cleaned),
  ]);

  // 合并去重：本地关键词 + LLM 同义扩展
  const allKeywords = [...new Set([...keywords, ...expanded, ...deriveQueryHints(cleaned), cleaned])].filter(Boolean);
  console.log('[Query] 搜索关键词:', allKeywords.join(' | '));

  // === Step 2: 并行检索 ===
  // 2a. 合并关键词一次检索，避免并发 Data not ready
  const keywordPromise = searchMultiKeywords(allKeywords);

  // 2b. 语义检索
  const semanticPromise = searchSemantic(cleaned, allKeywords);

  const [keywordRecords, semanticResults] = await Promise.all([
    keywordPromise,
    semanticPromise,
  ]);

  // === Step 3: 合并去重并打分 ===
  const scored = new Map();

  // 关键词命中：score = 1.0
  for (const item of keywordRecords) {
    const id = item.record_id;
    const lexicalScore = keywordMatchScore(item.fields || {}, cleaned, allKeywords);
    if (!scored.has(id)) {
      scored.set(id, { record: item, score: KEYWORD_WEIGHT + lexicalScore });
    } else {
      const existing = scored.get(id);
      existing.score = Math.max(existing.score, KEYWORD_WEIGHT + lexicalScore);
    }
  }

  // 语义命中：score = 相似度 * 权重（最高可超过 1.0，因此排在前面）
  for (const s of semanticResults) {
    const id = s.record_id;
    const semanticScore = s.score * SEMANTIC_WEIGHT;
    if (!scored.has(id)) {
      scored.set(id, { record: s.record, score: semanticScore });
    } else {
      const existing = scored.get(id);
      existing.score = Math.max(existing.score, semanticScore);
    }
  }

  // 按分数排序
  let records = Array.from(scored.values())
    .map(item => {
      const fields = item.record.fields || {};
      return { ...item, score: item.score + qualityBoost(fields) };
    })
    .filter(item => item.score > -100)
    .sort((a, b) => b.score - a.score)
    .map(x => x.record)
    .filter(r => !String(r.fields['文件名'] ?? '').includes('【测试行'))
    .filter(r => isSearchReady(r.fields || {}));

  log('info', `命中 ${records.length} 条记录 (关键词+语义) (${Date.now() - startTime}ms)`);

  // === Step 4: 紧凑格式回复 ===
  if (records.length === 0) {
    recordNoResultSearch({
      query: cleaned,
      chatId,
      userId: event?.sender?.sender_id?.open_id || event?.userId || '',
      keywords: allKeywords,
    });
    const link = getLibraryLinks().find(item => item.label === '多维表格资料库')?.url || '';
    if (!options.skipSend) {
      await sendText(chatId,
        `没找到「${cleaned}」\n· 发文件到群里 → 自动归档\n· 发飞书链接 → 自动录入${link ? `\n📎 全部资料：${link}` : ''}`
      );
    }
    return records;
  }

  // 一行一条：文件名 ·分享人 [标签] 期次 链接
  const lines = records.slice(0, 5).map((r, i) => {
    const f = r.fields;
    const name = f['文件名'] ?? '未知';
    const person = f['分享人'] ? ` ·${f['分享人']}` : '';
    const tags = f['主题标签'] ? ` [${String(f['主题标签'])}]` : '';
    const period = f['航海期次'] ? ` 🚢${f['航海期次']}` : '';
    const link = extractValidUrl(f['文件链接']);
    return `${i + 1}. ${name}${person}${tags}${period}${link ? `\n   ${link}` : ''}`;
  });

  if (!options.skipSend) {
    await sendText(chatId,
      `「${cleaned}」→ ${records.length}条\n${lines.join('\n')}`
    );
  }

  return records;
}

/**
 * 语义检索：用 embedding + 本地向量库找最相似文档
 * @returns {Promise<Array<{record_id, record, score}>>}
 */
async function searchSemantic(userText, keywords) {
  // 语义检索：本地 BM25 相关性评分
  // 用文件名、标签、摘要、分享人等字段的文本做 BM25 匹配
  // 返回按相关性排序的记录列表

  try {
    const queryText = buildQueryText(userText, keywords);
    if (!queryText) return [];

    // embed() 现在直接返回 BM25 相似结果 [{recordId, score}]
    const hits = await withTimeout(embed(queryText), 5000);
    if (!hits || !hits.length) return [];

    // 取 BM25 前 20 条，供卡片分页展示
    const topHits = hits.slice(0, 20);

    // 从 Bitable 获取完整记录
    const recordIds = topHits.map(h => h.recordId).filter(Boolean);
    const records = await getByRecordIds(recordIds);
    const recordMap = new Map(records.map(r => [r.record_id, r]));

    return topHits
      .filter(h => recordMap.has(h.recordId))
      .map(h => ({ record_id: h.recordId, record: recordMap.get(h.recordId), score: h.score }));
  } catch (err) {
    log('warn', `语义检索失败: ${err.message}`);
    return [];
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ── 工具函数 ──────────────────────────────────────

async function sendText(chatId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: appendLibraryFooter(text) }),
      },
    });
  } catch (err) {
    log('err', `发送失败: ${err.message}`);
  }
}
