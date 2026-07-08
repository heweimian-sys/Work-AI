/**
 * tools/index.js — 工具注册表（Phase 3：LLM Function Calling 格式）
 *
 * 每个工具输出 JSON schema，供 LLM 自主决定调用。
 * 统一执行入口：executeToolCall(name, args)
 *
 * 支持的 tools：
 *   - archive_file    下载群文件 → 上传云空间 → AI 提取 → 写入多维表格
 *   - archive_link    读取飞书链接 → 提取 metadata → 写入多维表格
 *   - query_knowledge 根据自然语言查询多维表格资料
 *   - read_file_content  提取 PDF/图片中的文字（用于更精准的 AI 分类）
 *   - feedback        记录用户反馈
 *   - diagnose        自诊断操作失败的原因
 *   - scan_chat_history  扫描群历史消息中的文件/链接（主动搜集）
 *   - sync_scys_mcp   从生财 MCP 同步外部资料
 *   - send_reply      发送回复消息
 */

import * as archiveTool from './archive.js';
import * as queryTool from './query.js';
import * as continueTool from './continue.js';
import * as sendMessageTool from './send-message.js';
import * as feedbackTool from './feedback.js';
import * as chatTool from './chat.js';
import * as diagnoseTool from './diagnose.js';
import * as mcpSyncTool from './mcp_sync.js';
import { getDefaultMonitoredChatId } from '../memory/chat.js';

// ============================================================
// 工具定义（LLM Function Calling JSON Schema）
// ============================================================

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'archive_file',
      description: '下载飞书群内的文件（PDF/PPT/图片等），上传到云空间归档文件夹，用 AI 提取文件名、分享人、活动名称、主题标签，写入多维表格索引。适合运营群中上传的文件。',
      parameters: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: '飞书消息 ID，用于下载文件资源' },
          fileKey: { type: 'string', description: '文件的 file_key 或 image_key' },
          fileName: { type: 'string', description: '原始文件名' },
          msgType: { type: 'string', enum: ['file', 'image', 'media'], description: '消息类型' },
          senderName: { type: 'string', description: '上传者名称或 open_id' },
          sendConfirmation: { type: 'boolean', description: '归档完成后是否在群内发送确认消息', default: true },
        },
        required: ['messageId', 'fileKey', 'fileName', 'msgType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'archive_link',
      description: '将飞书文档/知识库/表格链接归档到多维表格。自动获取文档标题和 metadata，用 AI 提取标签后写入索引。适合运营群中分享的飞书文档/知识库链接。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '飞书文档/知识库链接完整 URL' },
          contextText: { type: 'string', description: '包含该链接的消息上下文文本' },
          senderName: { type: 'string', description: '分享者名称' },
          sendConfirmation: { type: 'boolean', description: '归档完成后是否在群内发送确认消息', default: true },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_knowledge',
      description: '根据自然语言查询多维表格中的归档资料。支持关键词、同义词扩展、主题标签匹配。客服 @机器人 时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户的自然语言查询，如"AI沙龙PPT""张三老师大模型文档"等' },
          userId: { type: 'string', description: '查询者的 open_id，用于多轮对话状态管理' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'continue_query',
      description: '处理用户的延续指令，如"上一个""再发一个""第三个""换一个"等。基于上一次查询结果继续返回。',
      parameters: {
        type: 'object',
        properties: {
          userText: { type: 'string', description: '用户的延续指令文本' },
          chatId: { type: 'string', description: '群聊 ID' },
          userId: { type: 'string', description: '用户 ID' },
        },
        required: ['userText', 'chatId', 'userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_chat_history',
      description: '扫描群聊历史消息，查找过往的文件、图片和飞书链接并自动归档。自动识别当前群聊，无需传入群ID。适合群成员说"扫描这个群""整理这个群的资料"时调用。',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: '群聊 ID（通常不需要传，会自动从当前会话识别）' },
          limit: { type: 'number', description: '最多扫描多少条历史消息（默认 500）', default: 500 },
          autoArchive: { type: 'boolean', description: '扫描到的文件/链接是否自动归档', default: true },
          cleanupAfterScan: { type: 'boolean', description: '扫描完成后是否自动清理低价值/无关记录，默认 true', default: true },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose',
      description: '自诊断工具。当某个操作失败时（如上传云空间失败、下载文件失败），调用此工具分析错误原因并给出排查建议。',
      parameters: {
        type: 'object',
        properties: {
          error: { type: 'string', description: '错误信息' },
          operation: { type: 'string', description: '出错的操作名称' },
          context: { type: 'object', description: '上下文信息（如文件名、文件大小、token 等）' },
        },
        required: ['error', 'operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_feedback',
      description: '记录用户对查询结果的反馈（有用/没用）。用户说"不对""有用""谢谢"等时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          feedback: { type: 'string', enum: ['positive', 'negative'], description: '反馈类型' },
          queryText: { type: 'string', description: '用户当时的查询文本' },
          note: { type: 'string', description: '用户的原始反馈文本' },
        },
        required: ['feedback'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file_content',
      description: '读取已归档文件的内容（PDF/Word/Excel/PPT/图片），提取文字用于更精准的 AI 分类或回答。传入 fileToken 和 fileName，返回文件文字内容（最多 5000 字）。',
      parameters: {
        type: 'object',
        properties: {
          fileToken: { type: 'string', description: '飞书云空间文件 token 或 file_key' },
          fileName: { type: 'string', description: '文件名（用于判断文件类型，选择对应解析器）' },
        },
        required: ['fileToken', 'fileName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cleanup_table',
      description: '整理多维表格：自动补全空字段、标记低质量/疑似重复记录；只有用户明确要求删除重复时才删除。只操作表格，不影响群消息。',
      parameters: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean', description: '确认整理，防止误操作', default: false },
          deleteDuplicates: { type: 'boolean', description: '是否真的删除内容指纹重复记录。默认 false，只标记不删除。', default: false },
          enrichEmpty: { type: 'boolean', description: '是否自动补全空字段/低质量摘要。默认 true。', default: true },
          limit: { type: 'number', description: '最多自动补全多少条，默认 30。', default: 30 },
        },
        required: ['confirm'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'organize_by_group',
      description: '按群聊ID整理多维表格中的归档记录，批量添加群标签等，不删除群消息',
      parameters: {
        type: 'object',
        properties: {
          groupChatId: { type: 'string', description: '飞书群聊ID，如 oc_f0ff546e...' },
          groupLabel: { type: 'string', description: '可选群标签，默认自动生成' },
        },
        required: ['groupChatId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_scys_mcp',
      description: '管理员工具：连接生财有术 MCP，列出可用工具或同步 MCP 资料到多维表格。适合用户说“检查MCP工具”“同步MCP资料”“从生财MCP拉资料”。需要 .env 配置 SCYS_MCP_TOKEN。',
      parameters: {
        type: 'object',
        properties: {
          inspectOnly: { type: 'boolean', description: '只检查并列出 MCP 可用工具，不同步资料', default: false },
          query: { type: 'string', description: '同步时传给 MCP 搜索/列表工具的关键词' },
          limit: { type: 'number', description: '最多处理多少条 MCP 返回资料，默认 20', default: 20 },
          toolName: { type: 'string', description: '可选，指定 MCP 工具名；不填则自动选择最像资料搜索的工具' },
          dryRun: { type: 'boolean', description: '预览模式，只判断不写入多维表格', default: false },
        },
        required: [],
      },
    },
  },
];

// ============================================================
// 工具执行映射
// ============================================================

const TOOL_HANDLERS = {
  archive_file: async (args) => {
    const { messageId, fileKey, fileName, msgType, senderName, sendConfirmation, _event } = args;
    // 构造与原有 archive.js 兼容的事件对象
    const archiveEvent = _event || {
      message: {
        message_id: messageId,
        chat_id: args._ctx?.chatId,
        message_type: msgType,
        content: JSON.stringify({
          file_key: fileKey,
          image_key: fileKey,
          file_name: fileName,
          title: fileName,
        }),
        mentions: [],
      },
      sender: {
        sender_type: 'user',
        sender_id: { open_id: senderName || '运营' },
      },
    };
    await archiveTool.run({ event: archiveEvent });
    return JSON.stringify({ success: true, fileName, note: '已触发归档处理' });
  },

  archive_link: async (args) => {
    const { url, contextText, senderName, sendConfirmation, _event } = args;
    const archiveEvent = _event || {
      message: {
        chat_id: args._ctx?.chatId,
        message_type: 'text',
        content: JSON.stringify({ text: contextText || url }),
        mentions: [],
      },
      sender: {
        sender_type: 'user',
        sender_id: { open_id: senderName || '运营' },
      },
    };
    // 直接调用 bot/archive.js 的 handleLinkArchive
    const { handleLinkArchive } = await import('../bot/archive.js');
    await handleLinkArchive(archiveEvent, url);
    return JSON.stringify({ success: true, url, note: '链接已归档' });
  },

  query_knowledge: async (args) => {
    const { query, userId, _event } = args;
    const event = _event || { message: { chat_id: args._ctx?.chatId }, sender: { sender_id: { open_id: userId } } };
    const result = await queryTool.run({ event, ctx: args._ctx, query });
    return JSON.stringify({
      success: true,
      records: result._records || [],
      count: (result._records || []).length,
      replyText: result.text || '',
      replyCard: result.replyCard || null,
    });
  },

  continue_query: async (args) => {
    const { userText, chatId, userId, _event } = args;
    const event = _event || {
      message: { chat_id: chatId, message_id: 'continue' },
      userText,
      sender: { sender_id: { open_id: userId } },
    };
    const ctx = { chatId, userId, state: args._ctx?.state || {} };
    const result = await continueTool.run({ event, ctx });
    return JSON.stringify({ success: true, replyText: result.text, _records: result._records });
  },

  scan_chat_history: async (args) => {
    // 自动从事件中获取 chatId；私聊发起时默认扫描配置的第一个监听群
    const eventChatId = args._event?.message?.chat_id || args._ctx?.chatId;
    const eventIsP2P = args._event?.isP2P === true || args._event?.message?.chat_type === 'p2p';
    const chatId = args.chatId || (eventIsP2P ? getDefaultMonitoredChatId() : eventChatId);
    if (!chatId) {
      return JSON.stringify({
        success: false,
        error: '无法确定要扫描的群。请在 .env 配置 MONITORED_CHAT_IDS，或在工具参数里传 chatId。',
        replyText: '我还不知道要扫描哪个群。请先在 .env 里配置 MONITORED_CHAT_IDS，或告诉我群 chat_id。',
      });
    }
    const limit = args.limit ?? 500;
    const autoArchive = args.autoArchive !== false;
    const cleanupAfterScan = args.cleanupAfterScan !== false;
    const scanner = await import('./chat_scanner.js');
    const result = await scanner.scanChatHistory(chatId, limit, autoArchive, { cleanupAfterScan });
    return JSON.stringify(result);
  },

  read_file_content: async (args) => {
    const { fileToken, fileName } = args;
    // 通过飞书 API 下载文件内容
    // 调用 file_content_extractor.js 来提取文字
    try {
      const extractor = await import('./file_content_extractor.js');
      const text = await extractor.extractText(fileToken, fileName);
      return JSON.stringify({ success: true, text: text.slice(0, 5000), charCount: text.length });
    } catch (err) {
      // 兜底：尝试下载 raw 文件
      return JSON.stringify({ success: false, error: `无法读取文件内容: ${err.message}`, note: '文件已归档但内容未提取，可后续补充' });
    }
  },

  diagnose: async (args) => {
    const { error, operation, context } = args;
    const result = await diagnoseTool.diagnose({ error, operation, context });
    return JSON.stringify(result);
  },

  record_feedback: async (args) => {
    const { feedback, queryText, note } = args;
    // 记录到本地或飞书，暂时返回确认
    console.log(`[Feedback] ${feedback} | query="${queryText}" | note="${note}"`);
    return JSON.stringify({ success: true, message: feedback === 'positive' ? '感谢反馈！' : '已记录反馈，后续会改进。' });
  },

  send_reply: async (args) => {
    const { chatId, text } = args;
    await sendMessageTool.sendMessage(chatId, text);
    return JSON.stringify({ success: true });
  },

  cleanup_table: async (args) => {
    if (!args.confirm) {
      return JSON.stringify({ success: false, error: '需要 confirm=true 才会整理多维表，避免误操作' });
    }
    const cleanupTool = await import('./cleanup.js');
    const result = await cleanupTool.cleanupTable({
      deleteDuplicates: args.deleteDuplicates === true,
      enrichEmpty: args.enrichEmpty !== false,
      limit: args.limit || 30,
    });
    return JSON.stringify(result);
  },

  organize_by_group: async (args) => {
    const organizer = await import('./group_organizer.js');
    const result = await organizer.organizeByGroup(args.groupChatId, args.groupLabel);
    return JSON.stringify(result);
  },

  sync_scys_mcp: async (args) => {
    const result = await mcpSyncTool.run(args || {});
    return JSON.stringify(result);
  },
};

// ============================================================
// 导出接口
// ============================================================

/**
 * 获取 LLM Function Calling 格式的工具定义列表
 */
export function getToolSchemas() {
  return TOOL_DEFINITIONS;
}

/**
 * 执行一个工具调用
 * @param {string} name — 工具名
 * @param {Object} args — 参数
 * @returns {Promise<string>} JSON 字符串
 */
export async function executeToolCall(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`未知工具: ${name}。可用工具: ${Object.keys(TOOL_HANDLERS).join(', ')}`);
  }
  return await handler(args);
}
