/**
 * agent/core.js — Agent 主循环（Phase 3.5：真·多轮对话版）
 *
 * 核心原则：
 *   1. 文件/链接事件 → 直接归档，不走 LLM（省 token、省时间）
 *   2. 文本查询 → LLM 最多调 3 次工具，超限直接回复
 *   3. 注入最近 N 轮对话历史，让 LLM 感知上下文
 *   4. 首次对话发欢迎引导，不调 LLM
 *   5. 查询后保存上下文，查询结果优先用卡片集中展示
 */

import OpenAI from 'openai';
import 'dotenv/config';
import { log } from '../lib/feishu.js';
import { getToolSchemas, executeToolCall } from '../tools/index.js';
import {
  loadSession,
  saveSession,
  setSessionState,
  loadSessionState,
  formatConversation,
  isFirstInteraction,
  saveQueryContext,
  getQueryContext,
  getStatusDescription,
} from '../memory/session.js';
import { sendMessage } from '../tools/send-message.js';
import { handleArchive, handleLinkArchive } from '../bot/archive.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL ?? 'deepseek-v4-flash';
const MAX_ITERATIONS = 3;  // 最多 3 次 LLM 调用
const BOT_NAME = process.env.BOT_NAME || '航海资料小抓';
const GROUP_REPLIES_ENABLED = process.env.GROUP_REPLIES_ENABLED === 'true';

function shouldReplyInCurrentChat(event) {
  return event.isP2P || event.isAtBot || GROUP_REPLIES_ENABLED;
}

function parseMcpCommand(text = '') {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (/航海手册/.test(compact) && /同步|拉取|抓取|导入|入库|归档|更新|sync|import/.test(compact)) {
    const dryRun = /预览|测试|dryrun|dry-run/.test(compact);
    const limitMatch = text.match(/(\d+)\s*(条|个)?/);
    return {
      inspectOnly: false,
      mode: 'manual_chapters',
      dryRun,
      limit: limitMatch ? Number(limitMatch[1]) : 20,
      activityLimit: 3,
      chapterLimit: 10,
    };
  }
  if (!/mcp|生财/.test(compact)) return null;
  if (/检查|查看|工具|列表|有哪些|inspect|list/.test(compact)) {
    return { inspectOnly: true };
  }
  if (/同步|拉取|抓取|导入|入库|归档|更新|sync|import/.test(compact)) {
    const dryRun = /预览|测试|dryrun|dry-run/.test(compact);
    const limitMatch = text.match(/(\d+)\s*(条|个)?/);
    return {
      inspectOnly: false,
      dryRun,
      limit: limitMatch ? Number(limitMatch[1]) : 30,
      perQueryLimit: 5,
    };
  }
  return null;
}

function parseLibraryAuditCommand(text = '') {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (!/资料库|知识库|表格|库/.test(compact)) return null;
  if (!/体检|健康|检查|诊断|盘点|看看|查看|audit|doctor/.test(compact)) return null;

  const limitMatch = text.match(/(\d+)\s*(条|个)?/);
  return {
    limit: limitMatch ? Number(limitMatch[1]) : 1000,
  };
}

/**
 * 处理一次飞书事件
 * 文件/链接 → 直接归档（不走 LLM）
 * 文本查询 → Agent Loop（最多 3 次）
 */
export async function handleEvent(event) {
  const chatId = event.chatId;
  const userId = event.userId;

  console.log(`[Agent] 事件 | type=${event.msgType} | chat=${chatId}`);

  try {
    // ── 文件：直接归档，不走 LLM ──────────────────
    if (event.hasFile) {
      log('info', '检测到文件，直接归档');
      const sendReply = shouldReplyInCurrentChat(event);
      await handleArchive(event.rawEvent || event, { sendReply });
      await saveSession(chatId, userId, { role: 'user', text: '[上传文件]' });
      if (sendReply) {
        await saveSession(chatId, userId, { role: 'bot', text: '文件已归档' });
      }
      return;
    }

    // ── 链接：直接归档，不走 LLM ──────────────────
    if (event.hasLink && event.links?.length > 0) {
      log('info', '检测到链接，直接归档');
      const sendReply = shouldReplyInCurrentChat(event);
      for (const link of event.links) {
        await handleLinkArchive(event.rawEvent || event, link, { sendReply });
      }
      await saveSession(chatId, userId, { role: 'user', text: '[分享链接]' });
      if (sendReply) {
        await saveSession(chatId, userId, { role: 'bot', text: '链接已归档' });
      }
      return;
    }

    // ── 文本消息：Agent Loop ──────────────────────
    const userText = event.userText || '';
    if (!userText) {
      log('info', '空文本，跳过');
      return;
    }

    if (!event.isP2P && !event.isAtBot && !GROUP_REPLIES_ENABLED) {
      log('info', '群聊非@文字消息静默跳过');
      return;
    }

    const mcpCommand = event.isP2P ? parseMcpCommand(userText) : null;
    if (mcpCommand) {
      log('info', `命中 MCP 确定性指令: ${JSON.stringify(mcpCommand)}`);
      const result = await executeToolCall('sync_scys_mcp', { ...mcpCommand, _event: event });
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const replyText = parsed.replyText || (parsed.success ? '生财 MCP 处理完成。' : '生财 MCP 处理失败。');
      await saveSession(chatId, userId, { role: 'user', text: userText });
      await saveSession(chatId, userId, { role: 'bot', text: replyText });
      if (shouldReplyInCurrentChat(event)) {
        await sendMessage(chatId, replyText);
      }
      return;
    }

    const libraryAuditCommand = event.isP2P ? parseLibraryAuditCommand(userText) : null;
    if (libraryAuditCommand) {
      log('info', `命中资料库体检确定性指令: ${JSON.stringify(libraryAuditCommand)}`);
      const result = await executeToolCall('audit_library', { ...libraryAuditCommand, _event: event });
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const replyText = parsed.replyText || (parsed.success ? '资料库体检完成。' : '资料库体检失败。');
      await saveSession(chatId, userId, { role: 'user', text: userText });
      await saveSession(chatId, userId, { role: 'bot', text: replyText });
      if (shouldReplyInCurrentChat(event)) {
        await sendMessage(chatId, replyText);
      }
      return;
    }

    // 保存用户消息到会话
    const history = await formatConversation(chatId, userId, 4);  // 最近 4 轮
    const statusDesc = await getStatusDescription(chatId, userId);
    const qCtx = await getQueryContext(chatId, userId);

    // 只传查询相关的工具，省 token
    const toolSchemas = getToolSchemas().filter(s =>
      ['query_knowledge', 'continue_query', 'record_feedback', 'cleanup_table', 'organize_by_group', 'scan_chat_history',
       'archive_link', 'archive_file', 'sync_scys_mcp', 'audit_library'].includes(s.function.name)
    );

    // 构建 system prompt（含上下文感知）
    let systemContent = `你是「${BOT_NAME}」，飞书群知识管理助手。你能用自然语言和用户对话，理解意图并调用对应工具。

## 你能做的事
- 查资料：用户说「找AI资料」「有编程文档吗」→ 调 query_knowledge
- 多轮对话：用户说「第3个」「下一个」「再发一个」→ 调 continue_query
- 反馈：用户说「有用」「谢谢」「不对」「不是这个」→ 调 record_feedback
- 扫群历史：用户说「扫描群消息」「把群里资料整理一下」→ 调 scan_chat_history
- 清理表格：用户说「清理重复记录」「去重」→ 调 cleanup_table
- 资料库体检：用户说「资料库体检」「检查资料库」「看看资料库健康度」→ 调 audit_library
- 整理群标签：用户说「整理这个群的记录」→ 调 organize_by_group
- 生财MCP：管理员私聊说「检查MCP工具」「同步MCP资料」「从生财MCP拉资料」→ 调 sync_scys_mcp
- 航海手册MCP：管理员私聊说「同步航海手册」「拉取航海手册」「更新航海手册」→ 调 sync_scys_mcp，并传 mode=manual_chapters
- 归档链接：用户发了飞书链接（docx/wiki/sheets/base/minutes）→ **调 archive_link** 把链接内容归档
- 归档文件：用户发了文件（PDF/PPT/图片）→ **调 archive_file** 把文件归档

## ⚠️ 关键规则
- 用户发了飞书链接（URL 包含 feishu.cn）→ **必须调 archive_link**，不要当成查询
- 用户发了文件（PDF/PPT/图片等）→ **必须调 archive_file**，不要当成查询
- 纯名词/短词一律视作搜索 → 调 query_knowledge
- MCP 同步只允许私聊/管理员主动触发；群里普通用户提 MCP 时不要同步，只说明需要管理员私聊操作。
- **群聊自持规则**：如果用户在群里没有@你，只有明显的搜索/询问（如问资料、找文档）才回复。闲聊、打招呼、群友之间的对话不要回复。不确定时，优先沉默。

## 多轮对话规则
- 用户说「你好」「在吗」→ 热情打招呼，介绍一下你能做什么
- 用户说「换个关键词」「换一个搜法」→ 引导用户输入新的搜索词
- 用户说「还有吗」「还有别的吗」「更多」→ 如果上次查询有多条结果，重新展示结果卡片或提示换更具体关键词
- 用户问「你能做什么」「你有什么功能」→ 列出你的能力
- 用户表示感谢 → 回复「不客气，还有需要随时找我～」
- 含糊不清的输入 → 友好地请用户说清楚需求

## 回复格式
- 不要用 # * ** > 等 Markdown 符号
- 用 emoji：📄 👤 🏷️ 🔗 👋 ✅
- 链接单独一行
- 回复简洁友好，像真人客服
- 不要在回复中包含 JSON`;

    // 追加对话历史上下文（如果有）
    if (history) {
      systemContent += `\n\n## 近期的对话历史\n${history}`;
    }

    // 追加状态上下文（如果有查询上下文）
    if (qCtx) {
      systemContent += `\n\n## 当前对话状态\n${statusDesc}`;
    }

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userText },
    ];

    let finalResponse = null;
    let finalCard = null;
    let queryResult = null;
    let calledQueryKnowledge = false;  // 跟踪是否调用了查询工具

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      log('info', `LLM 调用 #${i + 1}`);

      const resp = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: toolSchemas,
        tool_choice: 'auto',
        temperature: 0.1,
        max_tokens: 1200,
      });

      const msg = resp.choices[0].message;
      process.stderr.write(`[LLM_DEBUG] call #${i+1}: tool_calls=${msg.tool_calls?.length || 0} content_len=${(msg.content||'').length}\n`);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalResponse = msg.content || '处理完成。';
        break;
      }

      // 执行工具
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* skip */ }
        args._event = event;

        const result = await executeToolCall(tc.function.name, args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

        // 检查是否有格式化 replyText
        let parsed;
        try { parsed = JSON.parse(resultStr); } catch { parsed = null; }

        if (parsed?.replyText && parsed.replyText.length > 10) {
          finalResponse = parsed.replyText;
          finalCard = parsed.replyCard || null;
          // 如果是查询工具，保存查询上下文
          if (tc.function.name === 'query_knowledge') {
            queryResult = { query: args.query, resultCount: parsed.count || 0, hasResults: (parsed.count || 0) > 0 };
            calledQueryKnowledge = true;
          }
          break;
        }

        messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
      }

      if (finalResponse) break;
    }

    // 兜底回复
    if (!finalResponse) {
      // 如果在群里没被@，且查询不到结果，保持静默
      if (!event.isAtBot && !event.isP2P && !queryResult?.hasResults) {
        log('info', '群聊未提及且无结果，静默跳过');
        return;
      }
      finalResponse = '你可以@我并输入关键词来查找资料，比如"AI编程的资料"。';
    }

    // 如果在群里没被@且LLM回复非常短（纯问候/闲聊），也静默
    if (!event.isAtBot && !event.isP2P && finalResponse && finalResponse.length < 15) {
      log('info', '群聊未提及且回复过短，静默跳过');
      return;
    }

    // 保存查询上下文，用于下一轮的跟进引导
    if (queryResult) {
      await saveQueryContext(chatId, userId, queryResult);

    } else if (calledQueryKnowledge && !queryResult) {
      // 调用了查询工具但未获取到结果
      await saveQueryContext(chatId, userId, { query: '', resultCount: 0, hasResults: false });
    }

    // 更新对话状态
    if (queryResult?.hasResults && queryResult.resultCount > 1) {
      await setSessionState(chatId, userId, { name: 'results_shown' });
    } else if (queryResult && !queryResult.hasResults) {
      await setSessionState(chatId, userId, { name: 'no_results' });
    } else {
      await setSessionState(chatId, userId, { name: 'idle' });
    }

    await saveSession(chatId, userId, { role: 'user', text: userText });
    await saveSession(chatId, userId, { role: 'bot', text: finalResponse });
    if (shouldReplyInCurrentChat(event)) {
      await sendMessage(chatId, finalResponse, 'text', finalCard);
    }

  } catch (err) {
    process.stderr.write(`[AGENT_ERROR] ${err.stack || err.message}\n`);
    console.error('[Agent] 错误:', err);
    if (shouldReplyInCurrentChat(event)) {
      await sendMessage(chatId, `抱歉，我遇到了一点小问题，请稍后重试或@运营同学。`);
    }
  }
}
