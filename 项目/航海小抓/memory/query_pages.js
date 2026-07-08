/**
 * memory/query_pages.js — 查询卡片分页缓存
 *
 * 飞书卡片按钮回调只带 action.value，不会带完整查询结果。
 * 这里用短期内存缓存保存最近查询的 records，供上一页/下一页按钮更新卡片。
 */

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 200;
const cache = new Map();

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function saveQueryPageState({ query, records, chatId, userId }) {
  const queryId = makeId();
  cache.set(queryId, {
    query,
    records: records || [],
    chatId,
    userId,
    ts: Date.now(),
  });
  cleanupQueryPageState();
  return queryId;
}

export function getQueryPageState(queryId) {
  const item = cache.get(queryId);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL_MS) {
    cache.delete(queryId);
    return null;
  }
  item.ts = Date.now();
  return item;
}

export function cleanupQueryPageState() {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.ts > CACHE_TTL_MS) cache.delete(key);
  }
  if (cache.size <= MAX_CACHE) return;
  const keys = [...cache.keys()];
  keys.slice(0, cache.size - MAX_CACHE).forEach(key => cache.delete(key));
}
