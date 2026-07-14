/**
 * index.js — 飞书 Bot 主入口（WebSocket 长连接模式）
 *
 * Phase 3 改造：
 *  - 保留双重去重、URL 检测
 *  - 把消息解析为统一事件后直接交给 Agent Loop
 *  - Agent 自己决定调哪个工具、如何处理
 *  - 去掉旧的路由逻辑和分类器
 */

import 'dotenv/config';
import * as lark from '@larksuiteoapi/node-sdk';
import { log, fetchAPI } from '../lib/feishu.js';
import { handleEvent } from '../agent/core.js';
import { isMonitoredChat } from '../memory/chat.js';
import { addReaction } from '../tools/send-message.js';
import { syncFieldMapping } from '../lib/bitable.js';
import { rememberMessage } from '../memory/recent_context.js';
import { handleCardAction } from '../tools/card_actions.js';
import { startMcpAutoSync } from '../tools/mcp_scheduler.js';
import { appendLibraryFooter } from '../tools/reply_footer.js';

const GROUP_REPLIES_ENABLED = process.env.GROUP_REPLIES_ENABLED === 'true';

/* ─────────────────────────────────────────
   双重去重
─────────────────────────────────────────── */
const processedIds = new Set();
const recentQueries = new Map();
const DEDUP_WINDOW_MS = 15000;
const MAX_CACHE = 500;

function isDuplicate(chatId, text, msgId) {
  if (processedIds.has(msgId)) return true;
  processedIds.add(msgId);
  if (processedIds.size > MAX_CACHE) {
    const arr = [...processedIds];
    arr.slice(0, Math.floor(arr.length / 2)).forEach(k => processedIds.delete(k));
  }

  const key = `${chatId}::${text}`;
  const lastTime = recentQueries.get(key);
  if (lastTime && Date.now() - lastTime < DEDUP_WINDOW_MS) {
    log('info', `去重(时间窗口): ${text.slice(0, 40)}`);
    return true;
  }
  recentQueries.set(key, Date.now());
  if (recentQueries.size > 100) {
    const now = Date.now();
    for (const [k, t] of recentQueries) {
      if (now - t > DEDUP_WINDOW_MS) recentQueries.delete(k);
    }
  }
  return false;
}

/* ─────────────────────────────────────────
   URL 检测
─────────────────────────────────────────── */
const URL_PATTERNS = [
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/minutes?\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/docx\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/wiki\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/sheets\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/base\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/file\/([a-zA-Z0-9]+)/,
  /https:\/\/[a-z0-9-]+\.feishu\.cn\/drive\/folder\/([a-zA-Z0-9]+)/,
];

function extractURLs(text, contentObj) {
  const urls = [];
  const plainText = text ?? '';

  for (const re of URL_PATTERNS) {
    const m = plainText.match(re);
    if (m) urls.push({ url: m[0], token: m[1], source: 'plain_text' });
  }

  for (const el of (contentObj?.elements ?? [])) {
    if (el.tag === 'a' && el.href) {
      for (const re of URL_PATTERNS) {
        const m = el.href.match(re);
        if (m) urls.push({ url: m[0], token: m[1], source: 'rich_element' });
      }
    }
  }

  for (const row of (contentObj?.content ?? [])) {
    for (const el of (row ?? [])) {
      const candidates = [el.href, el.text].filter(Boolean);
      for (const candidate of candidates) {
        for (const re of URL_PATTERNS) {
          const m = String(candidate).match(re);
          if (m) urls.push({ url: m[0], token: m[1], source: 'post_element' });
        }
      }
    }
  }

  return urls;
}

/* ─────────────────────────────────────────
   事件解析
─────────────────────────────────────────── */
function parseEvent(event) {
  const msg = event.message;
  const msgType = msg.message_type;
  const chatId = msg.chat_id;
  const messageId = msg.message_id;
  const userId = event.sender?.sender_id?.open_id ?? 'unknown';
  const isP2P = msg.chat_type === 'p2p';

  const mentions = msg.mentions ?? [];
  const botName = process.env.BOT_NAME || '航海资料小抓';
  const isAtBot = isP2P || mentions.some(m => {
    if (!m.name) return false;
    return m.name === botName || m.name.includes(botName) || botName.includes(m.name);
  });

  let contentObj = {};
  let userText = '';

  if (msgType === 'text' || msgType === 'post') {
    try {
      contentObj = JSON.parse(msg.content);
    } catch { /* ignore */ }
  }

  if (msgType === 'text') {
    userText = contentObj.text ?? '';
    // 去掉 @机器人 的 @ 文本
    mentions.forEach(m => {
      userText = userText.replace(m.key ?? '', '');
      userText = userText.replace(`@${m.name}`, '');
    });
    userText = userText.trim();
  }

  const hasFile = ['file', 'image', 'media'].includes(msgType);

  // 提取链接：从文本 + 富文本元素
  let foundURLs = [];
  if (msgType === 'text' || msgType === 'post') {
    const postText = (contentObj?.content ?? [])
      .flat()
      .map(el => el?.text || el?.href || '')
      .join(' ');
    foundURLs = extractURLs(contentObj?.text ?? postText, contentObj);
  }
  const hasLink = foundURLs.length > 0;

  log('info', `[Parse] type=${msgType} isP2P=${isP2P} isAtBot=${isAtBot} hasFile=${hasFile} hasLink=${hasLink} text="${userText.slice(0, 50)}"`);

  return {
    rawEvent: event,
    message: msg,
    chatId,
    messageId,
    userId,
    msgType,
    isP2P,
    isAtBot,
    userText,
    hasFile,
    hasLink,
    links: foundURLs.map(u => u.url),
    mentions,
  };
}

/* ─────────────────────────────────────────
   事件处理器
─────────────────────────────────────────── */
const eventDispatcher = new lark.EventDispatcher({
  encryptKey: process.env.FEISHU_ENCRYPT_KEY ?? '',
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN ?? '',
}).register({

  'im.message.receive_v1': async (event) => {
    const msg = event.message;
    const chatId = msg.chat_id;
    const msgType = msg.message_type;
    const isP2P = msg.chat_type === 'p2p';

    // 双重去重
    if (isDuplicate(chatId, JSON.stringify(msg.content || ''), msg.message_id)) return;

    // 解析为统一事件对象
    const parsedEvent = parseEvent(event);

    log('info', `收到消息 type=${msgType} chat=${chatId}`);
    rememberMessage(event);

    // 群里非 @ 的普通文字只作为归档上下文记忆，不触发回复。
    // 文件/图片/飞书链接仍会静默归档；私聊和 @bot 会进入 Agent 对话。
    if (!parsedEvent.isAtBot && !parsedEvent.isP2P && !parsedEvent.hasFile && !parsedEvent.hasLink) {
      log('info', `群聊非@文字仅记忆上下文: chat=${chatId}`);
      return;
    }

    // 私聊或群里 @bot 时，用 DONE 表情确认收到指令
    if (parsedEvent.isAtBot && parsedEvent.messageId) {
      addReaction(parsedEvent.messageId, 'DONE').catch(err => {
        log('warn', `表情回复失败: ${err.message}`);
      });
    }

    // 交给 Agent Loop 处理
    await handleEvent(parsedEvent).catch(err => {
      log('err', `Agent 处理异常: ${err.message}`);
      // 兜底回复
      if (parsedEvent.isP2P || parsedEvent.isAtBot || GROUP_REPLIES_ENABLED) {
        sendFallbackMessage(chatId);
      }
    });
  },

  'card.action.trigger': async (event) => {
    try {
      const result = await handleCardAction(event);
      if (!result) {
        log('info', '未处理的卡片按钮事件');
        return undefined;
      }
      // 飞书 SDK 支持在卡片回调中直接返回新卡片；这比事后 patch 更不容易被客户端回滚。
      return typeof result === 'object' ? result : undefined;
    } catch (err) {
      log('err', `卡片按钮处理异常: ${err.message}`);
      return undefined;
    }
  },
});

// 兜底：Agent 挂了时发一条简单提示
async function sendFallbackMessage(chatId) {
  try {
    const { client } = await import('../lib/feishu.js');
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: appendLibraryFooter('我遇到技术问题，已通知开发者。请稍后重试或@运营同学。') }),
      },
    });
  } catch { /* last resort */ }
}

/* ─────────────────────────────────────────
   启动前授权 + 连接
─────────────────────────────────────────── */
const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'BITABLE_APP_TOKEN', 'BITABLE_TABLE_ID'];
const missing = required.filter(k => !process.env[k] || process.env[k].includes('xxx'));
if (missing.length) {
  log('err', `未设置: ${missing.join(', ')}`);
  process.exit(1);
}

async function grantUserAccess() {
  const userId = process.env.OPS_USER_OPEN_ID;
  if (!userId) {
    log('warn', 'OPS_USER_OPEN_ID 未设置，跳过自动授权');
    return;
  }

  const appToken = process.env.BITABLE_APP_TOKEN;
  log('info', `尝试授予 ${userId} 编辑权限...`);

  try {
    const result = await fetchAPI('POST',
      `/open-apis/drive/v1/permissions/${appToken}/members?type=bitable&need_notification=false`,
      5000,
      { member_type: 'openid', member_id: userId, perm: 'full_access' }
    );
    if (result) {
      log('ok', `已授予 ${userId} 访问权限`);
      return;
    }
  } catch (err) {
    log('warn', `自动授权失败: ${err.message?.slice(0, 60)}`);
  }

  log('warn', `自动授权失败。请手动在飞书多维表格右上角点击「分享」，把 ${userId} 添加为协作者。`);
}

await grantUserAccess();

// 同步多维表格字段映射（自适应列名）
await syncFieldMapping();

// 后台自动从生财 MCP 同步外部资料（不会在群里主动发消息）
startMcpAutoSync();

const wsClient = new lark.WSClient({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  domain: lark.Domain.Feishu,
});

wsClient.start({ eventDispatcher }).then(() => {
  log('ok', '✅ 航海资料小抓已启动（真 Agent 模式 · Tool-Use Loop）');
  log('ok', '📌 能力：主动搜集历史文件 · 自动归档 · 语义查询 · 内容读取 · 自诊断');
}).catch(err => {
  log('err', `WS 连接失败: ${err.message}`);
  process.exit(1);
});


