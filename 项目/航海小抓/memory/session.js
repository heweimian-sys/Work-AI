/**
 * session.js — 会话记忆 + 多轮对话状态 (Phase 3.5：增强版)
 *
 * 以 chatId + userId 为 key，保留最近 N 轮对话 + 当前状态。
 * 状态机：
 *   - idle: 空闲
 *   - awaiting_clarify: 等待用户澄清查询意图
 *   - query_context: 已有一个查询上下文，等待后续指令
 *   - results_shown: 最近一次查询有结果，可继续翻页/选结果
 *   - no_results: 最近一次查询无结果，建议换词
 *
 * 扩展功能：
 *   - formatConversation() — 将历史对话格式化为 LLM 可用的文本
 *   - saveQueryContext() — 保存最近一次查询上下文
 *   - getLastQueryContext() — 获取上次查询信息用于跟进引导
 */

const MAX_HISTORY = 10;

// 内存存储：key -> { messages: Array, updatedAt: number, state: Object, queryContext: Object }
const sessions = new Map();

function key(chatId, userId) {
  return `${chatId}:${userId}`;
}

/**
 * 加载会话历史（原始消息数组）
 * @param {string} chatId
 * @param {string} userId
 */
export async function loadSession(chatId, userId) {
  const k = key(chatId, userId);
  const session = sessions.get(k);
  return session ? session.messages : [];
}

/**
 * 将会话历史格式化为 LLM 可用的对话文本
 * 返回最近几轮的对话文本，用于注入到 LLM system prompt 中
 * @param {string} chatId
 * @param {string} userId
 * @param {number} maxRounds - 最多取最近多少轮对话（一轮 = 用户+机器人各一条）
 */
export async function formatConversation(chatId, userId, maxRounds = 3) {
  const messages = await loadSession(chatId, userId);
  if (!messages || messages.length === 0) return '';

  // 取最近 N 轮（每轮 2 条：user + bot）
  const recent = messages.slice(-maxRounds * 2);
  const lines = [];

  for (const msg of recent) {
    const tag = msg.role === 'user' ? '用户说' : '你回复';
    // 截断过长文本
    const text = (msg.text || '').length > 200 ? msg.text.slice(0, 200) + '...' : msg.text;
    lines.push(`${tag}: ${text}`);
  }

  return lines.join('\n');
}

/**
 * 判断是否为首次对话（无历史记录）
 * @param {string} chatId
 * @param {string} userId
 */
export async function isFirstInteraction(chatId, userId) {
  const messages = await loadSession(chatId, userId);
  return messages.length === 0;
}

/**
 * 保存查询上下文——记录最近一次查询的信息，用于跟进引导
 * @param {string} chatId
 * @param {string} userId
 * @param {Object} queryCtx - { query: string, resultCount: number, hasResults: boolean }
 */
export async function saveQueryContext(chatId, userId, queryCtx) {
  const k = key(chatId, userId);
  if (!sessions.has(k)) {
    sessions.set(k, { messages: [], state: { name: 'idle' }, updatedAt: Date.now() });
  }
  sessions.get(k).queryContext = { ...queryCtx, ts: Date.now() };
}

/**
 * 获取上次查询上下文
 * @param {string} chatId
 * @param {string} userId
 * @returns {Object|null} { query, resultCount, hasResults, ts }
 */
export async function getQueryContext(chatId, userId) {
  const k = key(chatId, userId);
  const session = sessions.get(k);
  if (!session?.queryContext) return null;

  // 超过 10 分钟，上下文过期
  if (Date.now() - session.queryContext.ts > 10 * 60 * 1000) {
    session.queryContext = null;
    return null;
  }
  return session.queryContext;
}

/**
 * 获取适合 LLM 理解的当前状态描述
 * @param {string} chatId
 * @param {string} userId
 * @returns {string}
 */
export async function getStatusDescription(chatId, userId) {
  const state = await loadSessionState(chatId, userId);
  const qCtx = await getQueryContext(chatId, userId);

  let desc = `当前对话状态：${state.name}`;

  if (qCtx) {
    desc += `\n上次查询：「${qCtx.query}」`;
    desc += `\n查询结果：${qCtx.hasResults ? `找到 ${qCtx.resultCount} 条` : '无结果'}`;
    if (qCtx.hasResults && qCtx.resultCount > 1) {
      desc += '\n用户可以继续问「下一个」「第3个」来查看其他结果';
    }
  }

  return desc;
}

/**
 * 加载会话状态
 * @param {string} chatId
 * @param {string} userId
 */
export async function loadSessionState(chatId, userId) {
  const k = key(chatId, userId);
  const session = sessions.get(k);
  return session?.state ?? { name: 'idle' };
}

/**
 * 保存一条消息到会话
 * @param {string} chatId
 * @param {string} userId
 * @param {Object} message - { role: 'user' | 'bot', text: string }
 */
export async function saveSession(chatId, userId, message) {
  const k = key(chatId, userId);
  if (!sessions.has(k)) {
    sessions.set(k, { messages: [], state: { name: 'idle' }, updatedAt: Date.now() });
  }

  const session = sessions.get(k);
  session.messages.push({ ...message, ts: Date.now() });

  // 只保留最近 N 轮
  if (session.messages.length > MAX_HISTORY * 2) {
    session.messages = session.messages.slice(-MAX_HISTORY * 2);
  }

  session.updatedAt = Date.now();
}

/**
 * 设置会话状态
 * @param {string} chatId
 * @param {string} userId
 * @param {Object} state - { name: 'idle'|'awaiting_clarify'|'query_context', ...其他字段 }
 */
export async function setSessionState(chatId, userId, state) {
  const k = key(chatId, userId);
  if (!sessions.has(k)) {
    sessions.set(k, { messages: [], state, updatedAt: Date.now() });
  } else {
    sessions.get(k).state = state;
    sessions.get(k).updatedAt = Date.now();
  }
}

/**
 * 清理过期会话（可选，防止内存无限增长）
 * @param {number} maxAgeMs - 默认 24 小时
 */
export function clearExpiredSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [k, session] of sessions) {
    if (now - session.updatedAt > maxAgeMs) {
      sessions.delete(k);
    }
  }
}
