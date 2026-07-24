/**
 * tools/card_actions.js — 飞书交互卡片按钮处理
 */

import { client, fetchAPI, log } from '../lib/feishu.js';
import { getQueryPageState } from '../memory/query_pages.js';
import { recordQueryFeedback } from '../memory/search_feedback.js';
import { buildQueryCard } from './query.js';
import { update } from '../lib/bitable.js';

const recentPageClicks = new Map();
const DEDUP_MS = 600;

function parseActionValue(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

function normalizeCardActionEvent(event = {}) {
  const value = parseActionValue(event.action?.value);
  const messageId =
    event.messageId ||
    event.open_message_id ||
    event.context?.open_message_id ||
    event.message_id ||
    '';
  const chatId =
    event.chatId ||
    event.open_chat_id ||
    event.context?.open_chat_id ||
    event.chat_id ||
    '';
  const operatorOpenId =
    event.operator?.openId ||
    event.operator?.open_id ||
    event.operator_id?.open_id ||
    '';

  return { value, messageId, chatId, operatorOpenId };
}

function cleanupClicks() {
  const now = Date.now();
  for (const [key, ts] of recentPageClicks) {
    if (now - ts > DEDUP_MS) recentPageClicks.delete(key);
  }
}

function buildNoticeCard(title, content) {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'yellow',
      title: { tag: 'plain_text', content: title },
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content },
      },
    ],
  };
}

async function patchCardMessage(messageId, card) {
  if (!messageId) throw new Error('messageId 缺失');

  try {
    const resp = await client.im.v1.message.patch({
      path: { message_id: messageId },
      data: { content: JSON.stringify(card) },
    });
    if (resp?.code && resp.code !== 0) {
      throw new Error(`SDK patch code=${resp.code} msg=${resp.msg || ''}`);
    }
    return;
  } catch (err) {
    log('warn', `SDK patch 卡片失败，尝试 HTTP patch: ${err.message}`);
  }

  const data = await fetchAPI(
    'PATCH',
    `/open-apis/im/v1/messages/${messageId}`,
    5000,
    { content: JSON.stringify(card) }
  );
  if (!data) throw new Error('HTTP patch 返回空结果');
}

function schedulePatchFallback(messageId, card, meta) {
  if (!messageId) {
    log('warn', `卡片 patch 兜底跳过：messageId 缺失 queryId=${meta.queryId || ''}`);
    return;
  }

  setTimeout(() => {
    patchCardMessage(messageId, card)
      .then(() => {
        log('ok', `查询卡片 patch 兜底成功: queryId=${meta.queryId} page=${meta.page + 1}`);
      })
      .catch((err) => {
        log('err', `查询卡片 patch 兜底失败: queryId=${meta.queryId} page=${meta.page + 1} err=${err.message}`);
      });
  }, 120);
}

export async function handleCardAction(event) {
  const { value, messageId, chatId, operatorOpenId } = normalizeCardActionEvent(event);
  if (!['query_page', 'query_feedback', 'archive_confirm'].includes(value.action)) return false;

  cleanupClicks();

  if (value.action === 'archive_confirm') {
    const allowedIds = [
      process.env.OPS_USER_OPEN_ID,
      process.env.ADMIN_OPEN_IDS,
    ].filter(Boolean).join(',').split(/[,，;\s]+/).filter(Boolean);
    if (allowedIds.length === 0) {
      return buildNoticeCard('尚未配置负责人', '请先配置 OPS_USER_OPEN_ID 或 ADMIN_OPEN_IDS。');
    }
    if (!allowedIds.includes(operatorOpenId)) {
      return buildNoticeCard('无权确认', '只有运营负责人可以确认资料分类。');
    }
    if (!value.recordId) return buildNoticeCard('确认失败', '资料记录 ID 缺失，请到多维表格处理。');
    await update(value.recordId, {
      '归档状态': '已归档',
      '有效状态': '有效',
      '当前版本': true,
    });
    const confirmed = buildNoticeCard('分类已确认', '资料已经进入正式资料库，可以被客服查询。');
    schedulePatchFallback(messageId, confirmed, { queryId: value.recordId, page: 0 });
    log('ok', `资料分类确认成功: recordId=${value.recordId} operator=${operatorOpenId}`);
    return confirmed;
  }

  const queryId = value.queryId || '';
  const page = Number(value.page || 0);

  if (value.action === 'query_feedback') {
    const state = getQueryPageState(queryId);
    const labels = {
      useful: '有用',
      irrelevant: '不相关',
      broken_link: '链接失效',
      need_more: '需要补充',
    };
    const feedback = value.feedback || '';
    recordQueryFeedback({
      type: feedback,
      query: state?.query || '',
      chatId: chatId || state?.chatId || '',
      userId: operatorOpenId || state?.userId || '',
      queryId,
      page,
    });

    const noticeCard = buildNoticeCard('已收到反馈', `反馈类型：${labels[feedback] || feedback || '未知'}\n我会把这条记录放进运营反馈日志里。`);
    schedulePatchFallback(messageId, noticeCard, { queryId, page });
    log('ok', `查询反馈已记录: queryId=${queryId} feedback=${feedback || 'unknown'}`);
    return noticeCard;
  }

  const clickKey = `${messageId || chatId}:${operatorOpenId || 'unknown'}:${queryId}:${page}`;
  const last = recentPageClicks.get(clickKey);
  if (last && Date.now() - last < DEDUP_MS) {
    log('info', `重复卡片翻页点击，仍返回目标页卡片: ${clickKey}`);
  }
  recentPageClicks.set(clickKey, Date.now());

  log('info', `卡片回调触发: messageId=${messageId || 'missing'} chatId=${chatId || 'missing'} queryId=${queryId} page=${page + 1}`);

  const state = getQueryPageState(queryId);
  if (!state) {
    const expiredCard = buildNoticeCard('查询结果已过期', '这组查询结果已经过期啦，请重新输入关键词查询。');
    schedulePatchFallback(messageId, expiredCard, { queryId, page });
    log('warn', `查询分页缓存过期: queryId=${queryId} chatId=${chatId || 'missing'}`);
    return expiredCard;
  }

  const card = buildQueryCard(state.query, state.records, {
    queryId,
    page,
  });

  // 长连接回调返回新卡片在部分客户端上不稳定；同时做一次后台 patch，且卡片已声明 update_multi=true。
  schedulePatchFallback(messageId, card, { queryId, page });

  log('ok', `查询卡片回调返回: queryId=${queryId} page=${page + 1} elements=${card.elements?.length || 0}`);
  return card;
}
