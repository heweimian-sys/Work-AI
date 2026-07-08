/**
 * tools/query.js — 查询工具（Phase 3）
 *
 * 调用 bot/query.js 的 handleQuery 执行实际检索（skipSend=true 防止重复发消息）。
 * 本工具自行构造格式化文本作为 replyText，供 agent/core.js 统一发送。
 * 这样回复格式完全由硬编码控制，LLM 不参与文本生成，根除 #** 污染。
 */

import { handleQuery } from '../bot/query.js';
import { log } from '../lib/feishu.js';
import { saveQueryPageState } from '../memory/query_pages.js';

const BOT_NAME = process.env.BOT_NAME || '航海资料小抓';
export const QUERY_PAGE_SIZE = 5;

function extractValidUrl(value) {
  const url = value?.link ?? value ?? '';
  if (typeof url !== 'string') return '';
  if (!/^https?:\/\//.test(url)) return '';
  if (url.includes('/file/test')) return '';
  return url;
}

function cleanText(value, fallback = '') {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || fallback;
  if (value && typeof value === 'object') return value.text || value.link || fallback;
  return String(value || fallback).trim();
}

function truncate(text, max = 120) {
  const value = cleanText(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function groupRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const type = cleanText(record.fields?.['内容类型'], '资料');
    const key = type && type !== '其他' ? type : '资料';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups.entries());
}

export function buildQueryCard(query, records, options = {}) {
  const pageSize = options.pageSize || QUERY_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(Math.max(Number(options.page || 0), 0), pageCount - 1);
  const start = page * pageSize;
  const shown = records.slice(start, start + pageSize);
  const queryId = options.queryId || null;
  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `共找到 **${records.length}** 条资料，当前第 **${page + 1}/${pageCount}** 页。`,
      },
    },
  ];

  let globalIndex = start + 1;
  for (const [groupName, groupRecordsList] of groupRecords(shown)) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**${groupName}**` },
    });

    for (const record of groupRecordsList) {
      const f = record.fields || {};
      const index = globalIndex++;
      const name = truncate(f['文件名'] || '未知资料', 70);
      const person = cleanText(f['分享人']);
      const tags = truncate(f['主题标签'], 80);
      const period = cleanText(f['航海期次']);
      const summary = truncate(f['一句话摘要'] || f['解决的问题'], 120);
      const link = extractValidUrl(f['文件链接']);

      const lines = [
        `**${index}. ${name}**`,
        person ? `👤 ${person}` : '',
        period ? `🚢 ${period}` : '',
        tags ? `🏷️ ${tags}` : '',
        summary ? `📝 ${summary}` : '',
      ].filter(Boolean);

      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: lines.join('\n') },
      });

      if (link) {
        elements.push({
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: `打开 ${index}` },
              type: 'primary',
              url: link,
            },
          ],
        });
      }
    }
  }

  if (pageCount > 1 && queryId) {
    const actions = [];
    if (page > 0) {
      actions.push({
        tag: 'button',
        text: { tag: 'plain_text', content: '上一页' },
        type: 'default',
        value: { action: 'query_page', queryId, page: page - 1 },
      });
    }
    if (page < pageCount - 1) {
      actions.push({
        tag: 'button',
        text: { tag: 'plain_text', content: '下一页' },
        type: 'primary',
        value: { action: 'query_page', queryId, page: page + 1 },
      });
    }
    elements.push({ tag: 'action', actions });
  } else if (records.length > shown.length) {
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `还有 ${records.length - shown.length} 条未展示，可以换更具体的关键词缩小范围。`,
        },
      ],
    });
  }

  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `🔍 ${BOT_NAME}：${truncate(query, 28)}` },
    },
    elements,
  };
}

/**
 * 执行查询
 * @param {Object} args - { event, ctx, query? }
 */
export async function run(args) {
  const { event, ctx, query } = args;
  const userText = query ?? event.userText ?? '';
  // 强制写入 stderr（不被飞书 SDK 拦截）
  process.stderr.write(`[QUERY_DEBUG] run() called query="${userText}" chatId=${event?.message?.chatId || '?'}\n`);

  try {
    // skipSend=true: bot/query.js 不再自行发消息，只返回 records
    const records = await handleQuery(event, userText, { skipSend: true });

    // 自行构造格式化文本（完全硬编码，避开 LLM 文本生成）
    let replyText = '';
    if (records && records.length > 0) {
      const lines = records.slice(0, QUERY_PAGE_SIZE).map((r, i) => {
        const f = r.fields;
        const name = f['文件名'] ?? '未知';
        const person = f['分享人'] ? `\n👤 ${f['分享人']}` : '';
        const tags = f['主题标签'] ? `  🏷️ ${f['主题标签']}` : '';
        const period = f['航海期次'] ? `  🚢 ${f['航海期次']}` : '';
        const summary = f['一句话摘要'] ? `\n📝 ${f['一句话摘要']}` : '';
        const link = extractValidUrl(f['文件链接']);
        return `${i + 1}. 📄 ${name}${person}${period}\n${tags}${summary}\n${link ? `🔗 ${link}` : '⚠️ 文件链接暂不可用，可能是早期上传失败记录'}`;
      });
      const count = records.length;
      const more = count > QUERY_PAGE_SIZE ? `\n\n还有 ${count - QUERY_PAGE_SIZE} 条，可点击卡片「下一页」继续看。` : '';
      replyText = `共 ${count} 条结果，第 1 页：\n\n${lines.join('\n\n')}${more}`;
    } else {
      const bitableLink = `https://bytedance.feishu.cn/base/${process.env.BITABLE_APP_TOKEN}`;
      replyText = `没找到「${userText}」的相关资料\n可以试试其他关键词\n📎 全部资料：${bitableLink}`;
    }

    const queryId = records && records.length > 0
      ? saveQueryPageState({
          query: userText,
          records,
          chatId: event?.message?.chat_id || event?.chatId,
          userId: event?.sender?.sender_id?.open_id || event?.userId,
        })
      : null;

    return {
      text: replyText,
      suppressDefaultReply: false,  // 让 agent/core.js 统一发送
      _records: records || [],
      replyText: replyText,
      replyCard: records && records.length > 0 ? buildQueryCard(userText, records, { queryId, page: 0 }) : null,
    };
  } catch (err) {
    log('err', `查询失败: ${err.stack || err.message}`);
    return { text: '查询过程出错，请稍后重试。' };
  }
}


