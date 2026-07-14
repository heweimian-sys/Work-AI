/**
 * tools/chat_scanner.js — 群聊历史消息扫描工具
 *
 * Agent 新加入群时，主动扫描历史消息中过往的文件/链接进行回溯归档。
 * 或者在查询不到资料时，主动去各运营群搜刮。
 *
 * 使用飞书 List Message API 翻页拉取历史消息，
 * 识别 file / image / link 类型的消息，自动归档到知识库。
 */

import 'dotenv/config';
import { client, log, fetchAPI } from '../lib/feishu.js';
import { isMonitoredChat } from '../memory/chat.js';
import { insertIfNotExist } from '../lib/bitable.js';
import { cleanupScannedRecords } from './cleanup.js';
import { shouldArchiveHistoricalText } from './relevance.js';

const SCAN_LIMIT = 200;       // 单次最多扫描的消息数
const PAGE_SIZE = 50;         // 每页拉取条数
const MIN_TEXT_ARCHIVE_CHARS = 80;
const ARCHIVE_TEXT_MESSAGES = process.env.ARCHIVE_CHAT_TEXT_MESSAGES === 'true';
const ARCHIVE_MERGE_FORWARD = process.env.ARCHIVE_MERGE_FORWARD_MESSAGES === 'true';

/**
 * 扫描群聊历史消息，查找文件/图片/链接
 * @param {string} chatId — 群聊 ID
 * @param {number} limit — 最多扫描多少条消息（默认 100）
 * @param {boolean} autoArchive — 扫描到的文件/链接是否自动归档
 * @returns {Promise<{filesFound: number, linksFound: number, archived: number, errors: string[]}>}
 */
export async function scanChatHistory(chatId, limit = 100, autoArchive = true, options = {}) {
  const cleanupAfterScan = options.cleanupAfterScan !== false;
  log('info', `开始扫描群历史消息: chat=${chatId} limit=${limit} autoArchive=${autoArchive}`);

  const result = {
    filesFound: 0,
    linksFound: 0,
    textsFound: 0,
    archived: 0,
    alreadyArchived: 0,
    cleaned: 0,
    cleanFailed: 0,
    scannedRecordIds: [],
    errors: [],
  };

  // 检查群是否在监控范围内
  if (!isMonitoredChat(chatId)) {
    log('warn', `群 ${chatId} 不在监控范围内，跳过扫描`);
    return { ...result, error: '群不在监控范围内' };
  }

  // 1. 获取已有的文件名集合（用于去重，避免重复归档）
  const existingFiles = await getExistingFileNames();

  // 2. 翻页拉取历史消息
  let pageToken = null;
  let totalFetched = 0;

  try {
    while (totalFetched < limit) {
      const remaining = Math.min(PAGE_SIZE, limit - totalFetched);

      const resp = await client.im.message.list({
        params: {
          container_id_type: 'chat',
          container_id: chatId,
          page_size: remaining,
          page_token: pageToken,
          sort_type: 'ByCreateTimeDesc',
        },
      });

      if (resp.code !== 0) {
        result.errors.push(`拉取消息失败: code=${resp.code} msg=${resp.msg}`);
        break;
      }

      const items = resp.data?.items ?? [];
      if (items.length === 0) break;

      totalFetched += items.length;
      pageToken = resp.data?.page_token;

      // 3. 分析每条消息
      for (const msg of items) {
        const msgType = msg.msg_type;
        const content = parseMessageContent(msg);
        const senderName = msg.sender?.id || '未知';
        const text = extractMessageText(msg, content);

        if (['file', 'image', 'media'].includes(msgType)) {
          result.filesFound++;
          const fileKey = content?.file_key || content?.image_key;
          const fileName = content?.file_name || content?.title || `历史文件_${msg.message_id}`;

          // 历史消息中的文件可能已过期，file_key 为空时跳过下载
          if (!fileKey) {
            log('warn', `历史文件 ${fileName} file_key 为空，跳过（文件已过期）`);
            result.alreadyArchived++;
            continue;
          }

          // 去重：如果文件名已存在，跳过
          if (existingFiles.has(fileName)) {
            result.alreadyArchived++;
            continue;
          }

          if (autoArchive) {
            try {
              const archiveResult = await archiveHistoricalFile(msg, content, senderName);
              trackArchiveResult(result, archiveResult);
              result.archived++;
              existingFiles.add(fileName);
            } catch (err) {
              result.errors.push(`归档 ${fileName} 失败: ${err.message}`);
            }
          }
        }

        if (msgType === 'post') {
          const postImages = extractPostImages(content);
          for (let i = 0; i < postImages.length; i++) {
            result.filesFound++;
            const imageKey = postImages[i].image_key;
            const imageName = buildPostImageName(msg, i);
            if (!imageKey) {
              result.alreadyArchived++;
              continue;
            }
            if (existingFiles.has(imageName)) {
              result.alreadyArchived++;
              continue;
            }
            if (autoArchive) {
              try {
                const archiveResult = await archiveHistoricalFile(msg, {
                  image_key: imageKey,
                  title: imageName,
                  file_name: imageName,
                }, senderName, text, 'image');
                trackArchiveResult(result, archiveResult);
                result.archived++;
                existingFiles.add(imageName);
              } catch (err) {
                result.errors.push(`归档富文本图片 ${imageName} 失败: ${err.message}`);
              }
            }
          }
        }

        // 检测飞书链接
        const links = extractFeishuLinks(msg);
        if (links.length > 0) {
          result.linksFound += links.length;
          if (autoArchive) {
            for (const link of links) {
              // 链接去重
              const linkKey = `link:${link}`;
              if (existingFiles.has(linkKey)) {
                result.alreadyArchived++;
                continue;
              }

              try {
                const archiveResult = await archiveHistoricalLink(msg, link, senderName);
                trackArchiveResult(result, archiveResult);
                result.archived++;
                existingFiles.add(linkKey);
              } catch (err) {
                result.errors.push(`归档链接 ${link} 失败: ${err.message}`);
              }
            }
          }
        }

        if (ARCHIVE_TEXT_MESSAGES && shouldArchiveTextMessage(msg, text, links)) {
          result.textsFound++;
          const textKey = `text:${msg.message_id}`;
          if (existingFiles.has(textKey)) {
            result.alreadyArchived++;
          } else if (autoArchive) {
            try {
              const archiveResult = await archiveHistoricalText(msg, text, senderName);
              trackArchiveResult(result, archiveResult);
              result.archived++;
              existingFiles.add(textKey);
            } catch (err) {
              result.errors.push(`归档群聊文字 ${msg.message_id} 失败: ${err.message}`);
            }
          }
        }

        if (ARCHIVE_MERGE_FORWARD && msgType === 'merge_forward') {
          result.textsFound++;
          const forwardKey = `forward:${msg.message_id}`;
          if (existingFiles.has(forwardKey)) {
            result.alreadyArchived++;
          } else if (autoArchive) {
            try {
              const archiveResult = await archiveMergeForwardPlaceholder(msg, senderName);
              trackArchiveResult(result, archiveResult);
              result.archived++;
              existingFiles.add(forwardKey);
            } catch (err) {
              result.errors.push(`归档合并转发 ${msg.message_id} 失败: ${err.message}`);
            }
          }
        }
      }

      // 没有更多分页了
      if (!pageToken) break;
    }
  } catch (err) {
    result.errors.push(`扫描过程异常: ${err.message}`);
  }

  if (autoArchive && cleanupAfterScan && result.scannedRecordIds.length > 0) {
    try {
      const cleanup = await cleanupScannedRecords({
        recordIds: result.scannedRecordIds,
        deleteIrrelevant: true,
        deleteDriveFiles: true,
      });
      result.cleaned = cleanup.deletedRecords || 0;
      result.cleanFailed = cleanup.failed || 0;
      result.cleanupReport = cleanup.report;
    } catch (err) {
      result.cleanFailed++;
      result.errors.push(`扫描后清理失败: ${err.message}`);
      log('warn', `扫描后清理失败: ${err.message}`);
    }
  }

  log('ok', `历史扫描完成: 文件${result.filesFound}个, 链接${result.linksFound}个, 文字${result.textsFound}条, 归档${result.archived}个, 清理${result.cleaned}个`);

  return result;
}

function trackArchiveResult(result, archiveResult) {
  const action = archiveResult?.action;
  const recordId = archiveResult?.recordId || archiveResult?.record_id;
  if (recordId && action === 'created') result.scannedRecordIds.push(recordId);
}

/**
 * 获取多维表格中已有的文件名集合（用于去重）
 */
async function getExistingFileNames() {
  const names = new Set();
  try {
    const resp = await client.bitable.appTableRecord.list({
      path: {
        app_token: process.env.BITABLE_APP_TOKEN,
        table_id: process.env.BITABLE_TABLE_ID,
      },
      params: { page_size: 500 },
    });

    if (resp.code === 0) {
      for (const item of resp.data?.items ?? []) {
        const name = item.fields?.['文件名'];
        if (name) names.add(name);
        const link = item.fields?.['文件链接']?.link;
        if (link) names.add(`link:${link}`);
        const fingerprint = item.fields?.['内容指纹'];
        if (fingerprint) names.add(fingerprint);
      }
    }
  } catch (err) {
    log('warn', `获取已有文件名失败: ${err.message}`);
  }
  return names;
}

/**
 * 解析消息内容 JSON
 */
function parseMessageContent(msg) {
  try {
    return JSON.parse(msg.body?.content || msg.content || '{}');
  } catch {
    return {};
  }
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractMessageText(msg, content = parseMessageContent(msg)) {
  if (!content) return '';
  if (msg.msg_type === 'text') return normalizeText(content.text);
  if (msg.msg_type === 'post') {
    const parts = [];
    if (content.title) parts.push(content.title);
    for (const row of content.content || []) {
      for (const el of row || []) {
        if (el.tag === 'text') parts.push(el.text || '');
        if (el.tag === 'a') parts.push(el.href || el.text || '');
        if (el.tag === 'at') parts.push(el.user_name ? `@${el.user_name}` : '');
      }
    }
    return normalizeText(parts.join(' '));
  }
  return '';
}

function extractPostImages(content) {
  const images = [];
  for (const row of content?.content || []) {
    for (const el of row || []) {
      if (el.tag === 'img' && el.image_key) images.push(el);
    }
  }
  return images;
}

function buildPostImageName(msg, index) {
  return `富文本图片_${msg.message_id}_${index + 1}.png`;
}

function shouldArchiveTextMessage(msg, text, links) {
  if (!text || text.length < MIN_TEXT_ARCHIVE_CHARS) return false;
  if (links.length > 0) return false;
  if (msg.sender?.sender_type === 'app') return false;
  return shouldArchiveHistoricalText(text);
}

function buildMessageUrl(chatId, messageId) {
  const domain = process.env.FEISHU_DOMAIN || 'shengcaiyoushu01.feishu.cn';
  return `https://${domain}/messenger/${chatId}/${messageId}`;
}

/**
 * 从消息中提取飞书链接
 */
function extractFeishuLinks(msg) {
  const content = parseMessageContent(msg);
  const text = extractMessageText(msg, content);
  const links = [];

  const patterns = [
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/minutes?\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/docx\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/wiki\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/sheets\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/base\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/file\/([a-zA-Z0-9]+)/,
    /https:\/\/[a-z0-9-]+\.feishu\.cn\/drive\/folder\/([a-zA-Z0-9]+)/,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) links.push(match[0]);
  }

  // 也检查文本消息富文本 elements
  for (const el of (content?.elements ?? [])) {
    if (el.tag === 'a' && el.href) {
      for (const re of patterns) {
        if (re.test(el.href) && !links.includes(el.href)) {
          links.push(el.href);
        }
      }
    }
  }

  // 检查 post 富文本中的 a 标签和文本
  for (const row of (content?.content ?? [])) {
    for (const el of (row ?? [])) {
      const candidates = [el.href, el.text].filter(Boolean);
      for (const candidate of candidates) {
        for (const re of patterns) {
          const m = String(candidate).match(re);
          if (m && !links.includes(m[0])) links.push(m[0]);
        }
      }
    }
  }

  return links;
}

/**
 * 归档历史消息中的文件
 */
async function archiveHistoricalFile(msg, content, senderName, contextText = '', forcedMsgType = null) {
  const fileKey = content?.file_key || content?.image_key;
  const fileName = content?.file_name || content?.title || `历史文件_${msg.message_id}`;
  const msgType = forcedMsgType || msg.msg_type;

  log('info', `扫描到历史文件: ${fileName} (${msgType})`);

  const { handleArchive } = await import('../bot/archive.js');
  const event = {
    message: {
      message_id: msg.message_id,
      chat_id: msg.chat_id,
      message_type: msgType,
      content: JSON.stringify({
        file_key: fileKey,
        image_key: fileKey,
        file_name: fileName,
        title: fileName,
        text: contextText,
      }),
      mentions: [],
    },
    sender: {
      sender_type: 'user',
      sender_id: { open_id: senderName },
    },
  };

  return await handleArchive(event, { sendReply: false });
}

async function archiveHistoricalText(msg, text, senderName) {
  const title = inferTextTitle(text, msg);
  const messageUrl = buildMessageUrl(msg.chat_id, msg.message_id);
  const fields = {
    '文件名': title,
    '活动名称': inferActivityName(text),
    '分享人': senderName,
    '主题标签': inferTextTags(text).join(', '),
    '航海期次': inferPeriod(text),
    '上传时间': new Date(Number(msg.create_time) || Date.now()).toLocaleString('zh-CN', { hour12: false }),
    '一句话摘要': text.slice(0, 180),
    '核心观点': text,
    '内容类型': '群聊记录',
    '适合人群': ['运营', '全员'],
    '推荐优先级': '参考',
    '文档完整度': Math.min(8, Math.max(2, Math.ceil(text.length / 80))),
    'AI置信度': 0.55,
    '文件链接': { link: messageUrl, text: '群聊原消息' },
    '原文链接': { link: messageUrl, text: '群聊原消息' },
    '归档时间': Date.now(),
    '是否有实操': /步骤|方法|教程|指南|SOP|怎么|如何/.test(text),
    '是否有案例': /案例|复盘|示例|圈友|编号/.test(text),
    '归档理由': '历史扫描识别到有资料价值的群聊文字，作为上下文记录归档。',
    '内容指纹': `text:${msg.message_id}`,
  };
  const result = await insertIfNotExist(fields);
  log('ok', `群聊文字归档写入成功: ${result.action} record_id=${result.record_id || result.recordId}`);
  return { action: result.action, recordId: result.record_id || result.recordId };
}

async function archiveMergeForwardPlaceholder(msg, senderName) {
  let detailText = '';
  try {
    const detail = await client.im.message.get({
      path: { message_id: msg.message_id },
    });
    const item = detail.data?.items?.[0] || detail.data?.item || detail.data?.message || detail.data;
    detailText = extractMessageText(item || {}, parseMessageContent(item || {}));
  } catch (err) {
    log('warn', `读取合并转发详情失败: ${err.message}`);
  }

  const messageUrl = buildMessageUrl(msg.chat_id, msg.message_id);
  const title = detailText ? inferTextTitle(detailText, msg) : `合并转发消息_${msg.message_id}`;
  const fields = {
    '文件名': title,
    '活动名称': inferActivityName(detailText) || '合并转发资料',
    '分享人': senderName,
    '主题标签': detailText ? inferTextTags(detailText).join(', ') : '合并转发, 群聊记录',
    '上传时间': new Date(Number(msg.create_time) || Date.now()).toLocaleString('zh-CN', { hour12: false }),
    '一句话摘要': detailText ? detailText.slice(0, 180) : '历史扫描发现一条合并转发消息，飞书接口未返回可展开正文，已作为线索记录。',
    '核心观点': detailText || '合并转发消息暂无法自动展开，请从原群消息查看详情。',
    '内容类型': '合并转发',
    '适合人群': ['运营', '全员'],
    '推荐优先级': '参考',
    '文档完整度': detailText ? 4 : 1,
    'AI置信度': detailText ? 0.45 : 0.2,
    '文件链接': { link: messageUrl, text: '合并转发原消息' },
    '原文链接': { link: messageUrl, text: '合并转发原消息' },
    '归档时间': Date.now(),
    '是否有实操': /步骤|方法|教程|指南|SOP|怎么|如何/.test(detailText),
    '是否有案例': /案例|复盘|示例|圈友|编号/.test(detailText),
    '归档理由': detailText ? '历史扫描识别合并转发消息并提取到部分内容。' : '历史扫描识别合并转发消息，但当前接口未返回可展开正文。',
    '内容指纹': `forward:${msg.message_id}`,
  };
  const result = await insertIfNotExist(fields);
  log('ok', `合并转发归档写入成功: ${result.action} record_id=${result.record_id || result.recordId}`);
  return { action: result.action, recordId: result.record_id || result.recordId };
}

function inferTextTitle(text, msg) {
  const clean = normalizeText(text).replace(/^@[^ ]+\s*/, '');
  const title = clean.slice(0, 40) || `群聊记录_${msg.message_id}`;
  return title.length < clean.length ? `${title}...` : title;
}

function inferActivityName(text) {
  const m = String(text || '').match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:航海|深海圈|新手营|高手领航|直播|课程))/);
  return m?.[1] || '';
}

function inferPeriod(text) {
  const m = String(text || '').match(/第[一二三四五六七八九十\d]+(?:次|期)?航海|[一二三四五六七八九十\d]+月(?:份)?/);
  return m?.[0] || '';
}

function inferTextTags(text) {
  const source = String(text || '');
  const tags = ['群聊记录'];
  if (/AI|人工智能|大模型/.test(source)) tags.push('AI');
  if (/PPT|ppt|资料|文档|链接|pdf/i.test(source)) tags.push('资料线索');
  if (/报名|审核|退款|退费|进群|编号/.test(source)) tags.push('运营问题');
  if (/航海|高手领航|深海圈|新手营/.test(source)) tags.push('航海');
  if (/教程|指南|SOP|怎么|如何|方法/.test(source)) tags.push('教程指南');
  return [...new Set(tags)].slice(0, 6);
}

/**
 * 归档历史消息中的飞书链接
 */
async function archiveHistoricalLink(msg, linkUrl, senderName) {
  log('info', `扫描到历史链接: ${linkUrl}`);

  const { handleLinkArchive } = await import('../bot/archive.js');
  const event = {
    message: {
      message_id: msg.message_id,
      chat_id: msg.chat_id,
      message_type: 'text',
      content: JSON.stringify({ text: linkUrl }),
      mentions: [],
    },
    sender: {
      sender_type: 'user',
      sender_id: { open_id: senderName },
    },
  };

  return await handleLinkArchive(event, linkUrl, { sendReply: false });
}
