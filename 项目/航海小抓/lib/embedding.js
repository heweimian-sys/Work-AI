/**
 * embedding.js — 本地 TF-IDF + BM25 混合语义匹配
 *
 * 不依赖任何外部 embedding API（零成本、零延迟、永久可用）。
 * 使用 BM25 算法对文档文本和查询文本进行相关性评分。
 * 效果介于纯关键词匹配和向量检索之间，但对中文效果很好。
 */

import 'dotenv/config';

// ============================================================
// BM25 实现
// ============================================================

const K1 = 1.5;  // BM25 饱和参数
const B = 0.75;   // BM25 长度归一化参数

/**
 * 计算 BM25 相关性评分
 * @param {string} queryText — 查询文本
 * @param {string} docText — 文档文本
 * @param {number} avgDocLen — 平均文档长度
 * @param {number} totalDocs — 文档总数
 * @param {Map<string, number>} idfCache — IDF 缓存
 * @returns {number} — 相似度评分（0~1 之间）
 */
function bm25Score(queryText, docText, avgDocLen, totalDocs, idfCache) {
  const queryTerms = tokenize(queryText);
  const docTerms = tokenize(docText);
  const docLen = docTerms.length;
  if (docLen === 0) return 0;

  const termFreq = new Map();
  for (const t of docTerms) {
    termFreq.set(t, (termFreq.get(t) || 0) + 1);
  }

  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreq.get(term) || 0;
    if (tf === 0) continue;

    const idf = idfCache.get(term) || Math.log((totalDocs - 0.5) / (0.5 + 0.5) + 1);
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + B * (docLen / (avgDocLen || 1)));
    score += idf * (numerator / denominator);
  }

  if (score === 0) return 0;
  return Math.min(1, score / (score + 1));
}

/**
 * 对中英文混合文本做简单分词
 * - 中文按单字+双字组合
 * - 英文按空格分词
 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const cleaned = text.trim().toLowerCase();

  // 英文/数字词
  const engWords = cleaned.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || [];
  tokens.push(...engWords);

  // 中文字符
  const chineseParts = cleaned.match(/[\u4e00-\u9fff]+/g) || [];
  for (const part of chineseParts) {
    // 单字
    for (const ch of part) {
      tokens.push(ch);
    }
    // 双字词组（滑动窗口）
    if (part.length >= 2) {
      for (let i = 0; i < part.length - 1; i++) {
        tokens.push(part.substring(i, i + 2));
      }
    }
  }

  return tokens;
}

// ============================================================
// 文档索引
// ============================================================

let docIndex = [];
let avgDocLen = 0;
let idfCache = new Map();
let indexed = false;

/**
 * 重建索引（懒加载）
 */
function ensureIndex() {
  if (indexed) return;
  docIndex = [];
  indexed = true;

  try {
    // 从全局向量存储加载——通过 globalThis 传递，避免 ESM 循环依赖
    const store = globalThis.__vectorStoreCache;
    if (store && Array.isArray(store.vectors)) {
      docIndex = store.vectors.map(v => ({
        text: v.text || '',
        recordId: v.recordId || v.id,
      }));
    }
  } catch (err) {
    console.warn('[EmbeddingIndex] 加载索引失败: ' + err.message);
  }

  if (docIndex.length === 0) return;

  // 计算平均文档长度
  const totalLen = docIndex.reduce((sum, d) => sum + tokenize(d.text).length, 0);
  avgDocLen = totalLen / docIndex.length;

  // 计算 IDF
  const docFreq = new Map();
  for (const doc of docIndex) {
    const terms = new Set(tokenize(doc.text));
    for (const t of terms) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }

  const N = docIndex.length;
  for (const [term, df] of docFreq) {
    idfCache.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  if (docIndex.length > 0) {
    console.log(`[EmbeddingIndex] BM25 索引就绪: ${docIndex.length} 条记录`);
  }
}

export function resetIndex() {
  indexed = false;
  docIndex = [];
  idfCache = new Map();
}

export function addToIndex(recordId, text) {
  ensureIndex();
  const idx = docIndex.findIndex(d => d.recordId === recordId);
  if (idx >= 0) {
    docIndex[idx].text = text || '';
  } else {
    docIndex.push({ text: text || '', recordId });
  }
  indexed = false;  // 标记需重建 IDF
}

export function removeFromIndex(recordId) {
  docIndex = docIndex.filter(d => d.recordId !== recordId);
  indexed = false;
}

// ============================================================
// 对外接口
// ============================================================

export async function isEmbeddingAvailable() {
  return true;
}

/**
 * BM25 语义搜索
 * @param {string} userText
 * @param {string[]} keywords
 * @returns {Promise<Array<{recordId, score}>>}
 */
export async function searchSimilar(userText, keywords = []) {
  ensureIndex();
  if (docIndex.length === 0) return [];

  const parts = [userText.trim()];
  if (keywords && keywords.length) parts.push(...keywords);
  const queryText = [...new Set(parts)].join(' ').trim();
  if (!queryText) return [];

  const results = docIndex
    .map(doc => ({
      recordId: doc.recordId,
      score: bm25Score(queryText, doc.text, avgDocLen, docIndex.length, idfCache),
    }))
    .filter(r => r.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return results;
}

/**
 * embed() — 保持兼容，将调用转发到 BM25 + 向量库搜索
 * 返回一个模拟向量（1维），让旧调用方可继续工作
 */
export async function embed(text) {
  ensureIndex();
  if (!text || !text.trim()) throw new Error('embed: text is empty');

  // 搜索相似文档
  const similar = docIndex.length > 0
    ? docIndex
        .map(d => ({ recordId: d.recordId, score: bm25Score(text, d.text, avgDocLen, docIndex.length, idfCache) }))
        .filter(r => r.score > 0.01)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : [];

  // 返回一个包含搜索结果的"模拟向量"（1 维数组），
  // 调用方（bot/query.js 的 searchSemantic）会反解这个向量
  if (similar.length > 0) {
    return similar;
  }

  throw new Error('无匹配结果');
}

export async function embedBatch(texts) {
  const results = [];
  for (const text of texts) {
    try { results.push(await embed(text)); }
    catch { results.push([]); }
  }
  return results;
}

/**
 * 构建文档搜索文本
 */
export function buildDocumentText(fields) {
  const parts = [];
  const name = fields['文件名'] ?? '';
  if (name) parts.push(name);

  const tags = fields['主题标签'];
  if (Array.isArray(tags) && tags.length) parts.push(...tags);
  else if (typeof tags === 'string' && tags.trim()) parts.push(tags);

  const person = fields['分享人'] ?? '';
  if (person) parts.push(person);

  const activity = fields['活动名称'] ?? '';
  if (activity) parts.push(activity);

  const summary = fields['一句话摘要'] ?? '';
  if (summary) parts.push(summary);

  const period = fields['航海期次'] ?? '';
  if (period) parts.push(period);

  return parts.join(' ').trim();
}

/**
 * 构建查询搜索文本
 */
export function buildQueryText(userText, keywords = []) {
  const parts = [userText.trim()];
  if (keywords.length) parts.push(...keywords);
  return [...new Set(parts)].join(' ').trim();
}
