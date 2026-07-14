/**
 * tools/send-message.js — 发送飞书消息工具
 */

import 'dotenv/config';
import { client, fetchAPI, uploadImage } from '../lib/feishu.js';
import { appendLibraryFooter } from './reply_footer.js';

// 默认机器人 emoji（Twemoji 机器人）
const DEFAULT_STICKER_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f916.png';
const stickerCache = new Map(); // url -> image_key

/**
 * 发送文本消息或卡片消息
 * @param {string} chatId
 * @param {string} text
 * @param {string} [messageType='text']
 * @param {Object} [card]
 */
export async function sendMessage(chatId, text, messageType = 'text', card) {
  try {
    const finalText = card ? text : appendLibraryFooter(text);
    const data = {
      receive_id: chatId,
      msg_type: card ? 'interactive' : messageType,
      content: card
        ? JSON.stringify(card)
        : JSON.stringify({ text: finalText }),
    };

    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data,
    });
  } catch (err) {
    console.error('[SendMessage] 发送失败:', err.message);
  }
}

/**
 * 给指定消息添加表情回复（Reaction）
 * @param {string} messageId - 飞书消息 ID
 * @param {string} [emojiType='DONE'] - Lark 表情类型，如 DONE, OK, THUMBSUP
 */
export async function addReaction(messageId, emojiType = 'DONE') {
  if (!messageId) return;
  try {
    const data = await fetchAPI('POST',
      `/open-apis/im/v1/messages/${messageId}/reactions`,
      3000,
      { reaction_type: { emoji_type: emojiType } }
    );
    if (data) {
      console.log(`[Reaction] 已添加 ${emojiType} → ${messageId}`);
    } else {
      console.warn(`[Reaction] 添加 ${emojiType} 失败 → ${messageId}`);
    }
  } catch (err) {
    console.error('[Reaction] 添加失败:', err.message);
  }
}

/**
 * 发送表情包（图片消息）
 * 先从 Twemoji CDN 下载机器人 emoji，上传到飞书换取 image_key，再发图片消息。
 * @param {string} chatId
 * @param {string} [stickerUrl] - 自定义图片 URL（默认机器人 emoji）
 */
export async function sendSticker(chatId, stickerUrl = DEFAULT_STICKER_URL) {
  try {
    let imageKey = stickerCache.get(stickerUrl);

    if (!imageKey) {
      const resp = await fetch(stickerUrl);
      if (!resp.ok) {
        throw new Error(`下载表情图片失败: HTTP ${resp.status}`);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      imageKey = await uploadImage(buf, 'message', 15000);
      stickerCache.set(stickerUrl, imageKey);
      console.log(`[Sticker] 已上传并缓存 image_key=${imageKey}`);
    }

    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    });
    console.log(`[Sticker] 已发送表情包到 ${chatId}`);
  } catch (err) {
    console.error('[Sticker] 发送失败:', err.message);
    // 降级：发送文本 emoji
    await sendMessage(chatId, '🤖');
  }
}

/**
 * Tool 接口：供 Agent 在特殊场景下显式调用发送消息
 */
export async function run(args) {
  const { chatId, text, messageType, card } = args;
  await sendMessage(chatId, text, messageType, card);
  return { text: '', suppressDefaultReply: true };
}
