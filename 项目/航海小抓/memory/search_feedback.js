/**
 * memory/search_feedback.js — local query feedback log.
 *
 * Stores no-result searches as JSONL so运营 can review what资料 users need.
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const NO_RESULT_PATH = path.join(DATA_DIR, 'no-result-searches.jsonl');
const QUERY_FEEDBACK_PATH = path.join(DATA_DIR, 'query-feedback.jsonl');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function recordNoResultSearch(input = {}) {
  try {
    ensureDir();
    const item = {
      ts: Date.now(),
      query: String(input.query || '').trim(),
      chatId: input.chatId || '',
      userId: input.userId || '',
      keywords: input.keywords || [],
      source: input.source || 'query',
    };
    if (!item.query) return;
    fs.appendFileSync(NO_RESULT_PATH, JSON.stringify(item) + '\n', 'utf-8');
  } catch (err) {
    console.warn(`[SearchFeedback] 记录无结果搜索失败: ${err.message}`);
  }
}

export function getNoResultLogPath() {
  return NO_RESULT_PATH;
}

export function recordQueryFeedback(input = {}) {
  try {
    ensureDir();
    const item = {
      ts: Date.now(),
      type: String(input.type || '').trim(),
      query: String(input.query || '').trim(),
      chatId: input.chatId || '',
      userId: input.userId || '',
      queryId: input.queryId || '',
      page: Number.isFinite(Number(input.page)) ? Number(input.page) : 0,
      source: input.source || 'query_card',
    };
    if (!item.type) return;
    fs.appendFileSync(QUERY_FEEDBACK_PATH, JSON.stringify(item) + '\n', 'utf-8');
  } catch (err) {
    console.warn(`[SearchFeedback] 记录查询反馈失败: ${err.message}`);
  }
}

export function getQueryFeedbackLogPath() {
  return QUERY_FEEDBACK_PATH;
}
