/**
 * tools/archive.js — 归档工具
 *
 * Phase 1 兼容方案：复用 bot/archive.js 中的处理逻辑。
 * 注意：现有 handler 内部会自行发送飞书消息，因此本工具只负责触发并返回状态。
 * 后续 Phase 可进一步把消息发送收拢到 agent/core.js 中。
 */

import { handleArchive, handleLinkArchive } from '../bot/archive.js';

/**
 * 执行归档
 * @param {Object} args - { event, ctx }
 */
export async function run(args) {
  const { event } = args;
  const sendReply = args.sendReply ?? args.sendConfirmation ?? event?.isP2P ?? true;

  try {
    if (event.hasFile) {
      await handleArchive(event, { sendReply });
      return { text: '已触发文件归档处理。' };
    }

    if (event.hasLink && event.links?.length) {
      // 同时归档消息中的所有链接
      for (const link of event.links) {
        await handleLinkArchive(event, link, { sendReply });
      }
      return { text: `已触发 ${event.links.length} 个链接的归档处理。` };
    }

    return { text: '没有找到需要归档的文件或链接。' };
  } catch (err) {
    console.error('[Tool:archive] 归档失败:', err);
    return { text: '归档过程出错，请检查日志或稍后重试。' };
  }
}
