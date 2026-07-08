/**
 * tools/chat.js — 闲聊/默认回复工具（增强版）
 *
 * 当用户意图不明确、打招呼或说"测试"时，给出一个友好的引导回复。
 * 增强：上下文感知——根据最近的对话历史提供差异化引导。
 */

import 'dotenv/config';

const botName = process.env.BOT_NAME || '航海资料小抓';

// 不再硬编码默认文本，改为从 intent 识别动态构建
const WELCOME_TEXT = `你好！👋 我是${botName}，你可以这样用：

📄 查资料：@我 并输入关键词
📁 发文件：自动归档到知识库
🔗 分享链接：自动收录到知识库
📋 扫群历史：说"扫描群消息"

试试对我说"找一下AI相关资料"吧～`;

const HELP_TEXT = `我能帮你做这些事：

📄 查资料 — 说"AI沙龙的PPT""张三老师的文档"
📁 归档文件 — 发文件给我，自动提取标签入库
🔗 收录链接 — 分享飞书文档/链接，自动归档
📋 扫群历史 — 说"扫描本群消息"，回溯归档
🗂️ 整理表格 — 说"清理重复记录"
🔁 翻页 — 查完资料后说"下一个""第3个"

直接开始吧～`;

const THANKS_RESPONSES = [
  '不客气，还有需要随时找我～',
  '客气啦，随时可以再问我',
  '应该的！还有其他资料需要找吗？',
];

/**
 * 执行闲聊回复
 * @param {Object} args - { event }
 */
export async function run(args) {
  const { event } = args;
  const text = event?.userText?.trim();

  // 打招呼
  if (/^(你好|您好|嗨|hello|hi|hey)$/i.test(text)) {
    return { text: WELCOME_TEXT };
  }

  // 感谢
  if (/^(谢谢|多谢|感谢|thanks|thank you|thx)$/i.test(text)) {
    const reply = THANKS_RESPONSES[Math.floor(Math.random() * THANKS_RESPONSES.length)];
    return { text: reply };
  }

  // 询问功能
  if (/^(你能做什么|你有什么功能|你会什么|help|功能|说明|怎么用)$/i.test(text)) {
    return { text: HELP_TEXT };
  }

  // 测试
  if (/^(测试|test|ping|在吗|在不在)$/i.test(text)) {
    return { text: `在的！👋 我可以帮你查资料、归档文件。试试说"找一下AI相关资料"～` };
  }

  // 模糊不清/无法理解的输入
  const fuzzyPattern = /^[。，！？、～~…]+$|^[嗯哦噢啊哈嘿]+$/;
  if (fuzzyPattern.test(text) || text.length <= 1) {
    return { text: `嗯？我没太理解，你可以试试说"找AI资料"或者直接发文件给我～` };
  }

  // 兜底：友好引导
  return { text: WELCOME_TEXT };
}
