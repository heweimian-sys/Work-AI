/**
 * vector-store.js — 本地向量存储（基于 JSON 文件）
 *
 * 提供：
 *   - upsert(id, recordId, text, vector) 写入/更新向量
 *   - search(queryVector, topK=5) 按余弦相似度检索
 *   - listAll() 列出全部向量
 *   - remove(id) 删除向量
 *
 * 存储位置：data/vectors.json
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'vectors.json');

let cache = null;
let lastLoad = 0;
const CACHE_TTL = 5000; // 5s

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  const now = Date.now();
  if (cache && now - lastLoad < CACHE_TTL) return cache;

  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    cache = { vectors: [], updatedAt: now };
    lastLoad = now;
    return cache;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    cache = JSON.parse(raw);
    if (!cache || !Array.isArray(cache.vectors)) {
      cache = { vectors: [], updatedAt: now };
    }
  } catch (err) {
    console.error('[VectorStore] 加载失败:', err.message);
    cache = { vectors: [], updatedAt: now };
  }

  lastLoad = now;
  return cache;
}

function save() {
  ensureDir();
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
    cache.updatedAt = Date.now();
  } catch (err) {
    console.error('[VectorStore] 保存失败:', err.message);
  }
}

/**
 * 余弦相似度
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 写入或更新向量
 * @param {string} id — 唯一标识（推荐用 Bitable record_id）
 * @param {string} recordId — Bitable record_id
 * @param {string} text — 用于生成向量的文本
 * @param {number[]} vector — 向量
 */
export function upsert(id, recordId, text, vector) {
  const store = load();
  const idx = store.vectors.findIndex(v => v.id === id);
  const item = {
    id,
    recordId,
    text,
    vector,
    updatedAt: Date.now(),
  };

  if (idx >= 0) {
    store.vectors[idx] = item;
  } else {
    store.vectors.push(item);
  }

  save();
}

/**
 * 按余弦相似度检索最接近的向量
 * @param {number[]} queryVector
 * @param {number} topK
 * @returns {Array<{id, recordId, text, score}>}
 */
export function search(queryVector, topK = 5) {
  const store = load();
  if (!store.vectors.length) return [];

  return store.vectors
    .map(v => ({
      id: v.id,
      recordId: v.recordId,
      text: v.text,
      score: cosineSimilarity(queryVector, v.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * 列出所有向量（用于重建）
 * @returns {Array}
 */
export function listAll() {
  return load().vectors;
}

/**
 * 删除向量
 * @param {string} id
 */
export function remove(id) {
  const store = load();
  const before = store.vectors.length;
  store.vectors = store.vectors.filter(v => v.id !== id);
  if (store.vectors.length !== before) save();
}

/**
 * 清空全部向量（谨慎使用）
 */
export function clear() {
  cache = { vectors: [], updatedAt: Date.now() };
  save();
}

/**
 * 统计数量
 * @returns {number}
 */
export function count() {
  return load().vectors.length;
}
