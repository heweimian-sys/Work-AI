/**
 * archive.js — 文件归档处理器
 *
 * 当运营群接收到文件消息时触发：
 *  1. 下载文件
 *  2. 上传到云空间归档文件夹
 *  3. AI 提取字段
 *  4. 写入多维表格
 *  5. 回复确认消息（置信度低时提示人工核查）
 */

import 'dotenv/config';
import crypto from 'crypto';
import { client, log, assertOk, fetchAPI, downloadResource, uploadToDrive, uploadToDriveDirect } from '../lib/feishu.js';
import { insertIfNotExist, findByFileName } from '../lib/bitable.js';
import { extractFields } from '../lib/ai.js';
import { diagnose } from '../tools/diagnose.js';
import { acquireLock, releaseLock } from '../lib/lock.js';
import { buildDocumentText } from '../lib/embedding.js';
import { getRecentContext } from '../memory/recent_context.js';
import { assessResourceRelevance } from '../tools/relevance.js';
import { appendLibraryFooter } from '../tools/reply_footer.js';

// 消息级去重：飞书可能推送两次相同事件
const processedMessages = new Set();

/**
 * 处理文件归档
 * @param {Object} event - 飞书 im.message.receive_v1 事件
 */
export async function handleArchive(event, options = {}) {
  const msg = event.message;
  const chatId = msg.chat_id;
  const { sendReply = true } = options;  // 是否发送确认消息，默认发送
  const { skipSendPrompt = false } = event;  // 兼容历史调用
  const content = JSON.parse(msg.content);
  const resourceKey = content.file_key ?? content.image_key ?? content.file_name ?? content.title ?? '';
  const processedKey = `${msg.message_id}:${resourceKey}`;

  // 消息ID级去重（防止飞书重复推送）
  if (processedMessages.has(processedKey)) {
    log('info', `消息已处理过，跳过重复: ${processedKey}`);
    return { action: 'skipped', reason: 'processed' };
  }
  processedMessages.add(processedKey);
  // 5分钟后自动释放，防止内存泄漏
  setTimeout(() => processedMessages.delete(processedKey), 300000);

  // 解析文件信息
  const fileKey = content.file_key ?? content.image_key;
  const fileName = content.file_name ?? content.title ?? `文件_${Date.now()}`;
  const msgType = msg.message_type; // file / image / media

  // 发送者名称
  const senderName = event.sender?.sender_type === 'user'
    ? (event.sender?.sender_id?.open_id ?? '运营')
    : '运营';

  log('info', `开始归档: ${fileName} (${msgType})`);

  // === Step 1: 下载文件 ===
  // 注：必须使用 /im/v1/messages/:message_id/resources/:file_key 才能下载用户发送的资源
  const messageId = msg.message_id;
  let fileBuffer;
  try {
    if (msgType === 'file') {
      const fileKey = content.file_key;
      fileBuffer = await downloadResource(messageId, fileKey, 'file', 30000);
      if (!fileBuffer || fileBuffer.length === 0) throw new Error('下载文件为空');
    } else if (msgType === 'image') {
      const imageKey = content.image_key;
      fileBuffer = await downloadResource(messageId, imageKey, 'image', 30000);
      if (!fileBuffer || fileBuffer.length === 0) throw new Error('下载图片为空');
    } else {
      log('warn', `暂不支持消息类型: ${msgType}`);
      return { action: 'skipped', reason: 'unsupported_type' };
    }
    log('ok', `文件下载成功，大小: ${fileBuffer.length} bytes`);
  } catch (err) {
    log('err', `文件下载失败: ${err.message}`);
    if (sendReply !== false) {
      await sendTextMessage(chatId, `归档失败：无法下载文件「${fileName}」，请检查 Bot 文件访问权限。`);
    }
    return { action: 'failed', reason: 'download_failed' };
  }

  // === Step 1.5: 计算文件指纹 + 云盘去重检查 ===
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fingerprint = 'file:' + fileHash;

  // 加锁防并发
  if (!acquireLock(fingerprint)) {
    log('info', '文件正在处理中，跳过重复请求: ' + fileName);
    return { action: 'skipped', reason: 'locked' };
  }

  // 查多维表格是否有相同文件名的旧记录 — 如果有且包含云盘链接，复用不上传
  let existingDriveUrl = null;
  let existingDriveToken = null;
  try {
    const existing = await findByFileName(fileName);
    if (existing) {
      const ef = existing.fields || {};
      const oldLink = ef['文件链接']?.link || ef['文件链接'] || '';
      // 只有旧记录有有效云盘文件链接才复用
      if (oldLink && (oldLink.includes('drive') || oldLink.includes('file/'))) {
        existingDriveUrl = oldLink;
        existingDriveToken = extractFileTokenFromUrl(oldLink) || ef['文件链接']?.text || '';
        log('ok', `云盘去重命中: ${fileName} → 复用旧链接`);
      }
    }
  } catch (err) {
    log('warn', `云盘去重查询失败（不影响主流程）: ${err.message}`);
  }

  // === Step 2: 上传到云空间（仅当没有复用旧链接时） ===
  let driveFileToken = null;
  let driveFileUrl = null;

  if (existingDriveUrl) {
    // 复用已有文件链接，跳过上传
    driveFileToken = existingDriveToken;
    driveFileUrl = existingDriveUrl;
  } else {
    try {
      const folderToken = process.env.DRIVE_FOLDER_TOKEN || '';
      const uploadResult = await uploadToDrive(fileName, fileBuffer, folderToken, 300000);
      driveFileToken = uploadResult.file_token;
      driveFileUrl = uploadResult.url;
      log('ok', '云空间上传成功，file_token=' + driveFileToken + ' 大小=' + fileBuffer.length + 'bytes');

      // 授予文件公开读权限
      try {
        const { client } = await import('../lib/feishu.js');
        await client.drive.permission.public.update({
          path: { token: driveFileToken, type: 'file' },
          data: {
            external_access_entity: 'open',
            security_entity: 'anyone_can_view',
            comment_entity: 'anyone_can_view',
            share_entity: 'anyone',
            link_share_entity: 'anyone_readable',
            invite_external: true,
          },
        });
        log('ok', '文件已设置为公开可读: ' + driveFileUrl);
      } catch (permErr) {
        log('warn', '设置文件公开权限失败（链接可能只对 Bot 可见）: ' + (permErr.message || ''));
      }
    } catch (err) {
      log('warn', '云空间上传失败: ' + err.message + '，尝试备用上传方案');
      
      // 备用方案1：对于 <20MB 的文件尝试直传
      if (fileBuffer.length <= 20 * 1024 * 1024) {
        try {
          const folderToken = process.env.DRIVE_FOLDER_TOKEN || '';
          // 直接用 uploadToDriveDirect（绕过 chunked 路径）
          const uploadResult = await uploadToDriveDirect(fileName, fileBuffer, folderToken, 30000);
          driveFileToken = uploadResult.file_token;
          driveFileUrl = uploadResult.url;
          log('ok', '备用直传成功，file_token=' + driveFileToken);
        } catch (fallbackErr) {
          log('warn', '备用直传也失败: ' + fallbackErr.message);
        }
      }
      
      // 如果还是拿不到有效链接，记录消息ID让用户可以从群消息找回
      if (!driveFileUrl) {
        driveFileUrl = '';
        log('warn', `文件上传失败，记录消息ID=${messageId} 备查`);
      }
    }
  }

  // === Step 3: 读取文件内容 + AI 提取字段 ===
  const mentionContext = msg.mentions?.map(m => m.name).join(' ') ?? '';
  const messageContext = content.text || '';
  const recentContext = getRecentContext(chatId, msg.message_id);
  const contextText = [mentionContext, messageContext, recentContext].filter(Boolean).join('\n');
  if (recentContext) log('info', `归档上下文: ${recentContext.slice(0, 160)}`);

  // 3a. 提取文件内容：优先从云空间下载，如果没上传则直接用 buffer
  let fileContent = null;
  if (driveFileToken) {
    try {
      // 已上传到云空间：从云空间下载并提取
      const { extractText } = await import('../tools/file_content_extractor.js');
      fileContent = await extractText(driveFileToken, fileName);
      if (fileContent && fileContent.length > 20) {
        log('info', '文件内容提取成功（云空间），' + fileContent.length + ' 字符');
        fileContent = fileContent.slice(0, 2000);
      }
    } catch (err) {
      log('warn', '云空间提取失败: ' + err.message);
      fileContent = null;
    }
  }

  // 3b. 如果云空间提取失败或未上传，直接用内存中的 buffer 提取
  if (!fileContent && fileBuffer) {
    try {
      const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
      if (ext === 'pdf') {
        // 对于 PDF，直接用 pdfjs-dist 从 buffer 提取文本
        const pdfjs = await import('pdfjs-dist');
        const data = fileBuffer.buffer || fileBuffer;
        const doc = await pdfjs.getDocument({ data }).promise;
        const maxPages = Math.min(doc.numPages, 10);
        let text = '';
        for (let i = 1; i <= maxPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          if (pageText.trim()) text += '\n--- 第 ' + i + ' 页 ---\n' + pageText.trim();
        }
        if (text.trim().length > 20) {
          fileContent = text.trim().slice(0, 2000);
          log('info', '文件内容提取成功（本地buffer-PDF），' + fileContent.length + ' 字符');
        }
      } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
        // 图片：用 GPT-4o 视觉提取文字（截图、海报等）
        try {
          const { extractImageText } = await import('../tools/file_content_extractor.js');
          const text = await extractImageText(fileBuffer, fileName, ext);
          if (text && text.trim().length > 10) {
            fileContent = text.trim().slice(0, 2000);
            log('info', '图片OCR提取成功（本地buffer），' + fileContent.length + ' 字符');
          }
        } catch (ocrErr) {
          log('warn', '图片OCR提取失败: ' + ocrErr.message);
        }
      }
    } catch (err) {
      log('warn', '本地 buffer 提取失败: ' + err.message);
    }
  }

  // 3b. 用文件名 + 文件内容（如有）一起打标
  const aiFields = await extractFields(fileName, contextText, senderName, fileContent);
  log('info', 'AI 提取结果:', aiFields);

  // === Step 4: 写入多维表格（22列完整索引） ===
  const recordFields = {
    '文件名': fileName,
    '活动名称': aiFields.活动名称 || '',
    '分享人': aiFields.分享人 || '',
    '主题标签': Array.isArray(aiFields.主题标签) ? aiFields.主题标签.join(', ') : (aiFields.主题标签 || ''),
    '航海期次': aiFields.航海期次 || '',
    '上传时间': new Date().toLocaleString('zh-CN', { hour12: false }),
    '一句话摘要': aiFields.一句话摘要 || '',
    '核心观点': Array.isArray(aiFields.核心观点) ? aiFields.核心观点.join('\\n') : '',
    '内容类型': aiFields.内容类型 || '其他',
    '适合人群': Array.isArray(aiFields.适合人群) ? aiFields.适合人群 : [],
    '推荐优先级': aiFields.推荐优先级 || '参考',
    '文档完整度': aiFields.文档完整度 || 5,
    'AI置信度': aiFields.置信度 || 0,
    // 只有真实上传成功拿到 /file/ 链接时才写链接字段。
    // 上传失败时写空，避免出现 https://.../file/test 或文件名被当成 URL。
    '文件链接': driveFileUrl && driveFileUrl.includes('/file/') ? { link: driveFileUrl, text: fileName } : '',
    '原文链接': driveFileUrl && driveFileUrl.includes('/file/') ? { link: driveFileUrl, text: fileName } : '',
    '归档时间': Date.now(),
    '是否有实操': !!aiFields.是否有实操,
    '是否有案例': !!aiFields.是否有案例,
    '归档理由': aiFields.归档理由 || 'AI自动归档',
    '文件大小': String(fileBuffer.length),
    '内容指纹': fingerprint,
    '_fileHash': fileHash,
  };

  const quality = assessResourceRelevance({
    ...recordFields,
    _fileContent: fileContent || '',
    _messageType: msgType,
  });
  if (!quality.keep) {
    log('warn', `跳过入库: ${fileName} reason=${quality.reason}`);
    releaseLock(fingerprint);
    if (sendReply !== false) {
      await sendTextMessage(chatId, `已收到「${fileName}」，但没有识别出可复用资料内容，已跳过入库。\n原因：${quality.reason}`);
    }
    return { action: 'skipped', reason: 'low_value', detail: quality.reason, driveFileToken, driveFileUrl, fileName };
  }

  let archiveResult = null;
  try {
    const result = await insertIfNotExist(recordFields);
    const action = result.action;
    const recordId = result.record_id || result.recordId;
    archiveResult = { action, recordId, driveFileToken, driveFileUrl, fileName };
    log('ok', `多维表格写入成功: ${action} record_id=${recordId}`);

    // 异步生成向量（不影响归档主流程）
    if (recordId && action !== 'skipped') {
      buildVectorForRecord(recordId, recordFields).catch(err =>
        log('warn', `向量生成失败(可忽略): ${err.message}`)
      );
    }
  } catch (err) {
    log('err', `多维表格写入失败: ${err.message}`);
    if (sendReply !== false) {
      await sendTextMessage(chatId, `文件已上传云空间，但写入索引失败，请手动补录：${driveFileUrl}`);
    }
    return { action: 'failed', reason: 'bitable_write_failed', driveFileToken, driveFileUrl };
  } finally {
    releaseLock(fingerprint);
  }

  // === Step 5: 回复确认消息（仅在非扫描模式下发） ===
  if (sendReply !== false) {
    const parts = [
      '✅ 已归档：' + fileName,
      aiFields.分享人 ? '·' + aiFields.分享人 : '',
      aiFields.主题标签?.length ? '·' + aiFields.主题标签.join('、') : '',
    ].filter(Boolean);
    let summary = parts.join(' ');
    if (driveFileUrl) {
      // 有具体文件链接时附上
      summary += ' ' + driveFileUrl;
    }
    // 置信度低提示
    if (aiFields.置信度 < 0.6) {
      summary += ' ⚠️标签需核查';
    }

    await sendTextMessage(chatId, summary);
  }

  return archiveResult;
}

/**
 * 处理飞书链接归档（文本消息中的链接，无需下载文件）
 */
export async function handleLinkArchive(event, linkUrl, options = {}) {
  const msg = event.message;
  const chatId = msg.chat_id;
  const { sendReply = true } = options;

  // 消息ID级去重
  if (processedMessages.has(msg.message_id)) {
    log('info', `链接消息已处理过，跳过重复: ${msg.message_id}`);
    return { action: 'skipped', reason: 'processed' };
  }
  processedMessages.add(msg.message_id);
  setTimeout(() => processedMessages.delete(msg.message_id), 300000);

  const senderName = event.sender?.sender_type === 'user'
    ? (event.sender?.sender_id?.open_id ?? '运营')
    : '运营';

  log('info', `链接归档: ${linkUrl}`);

  // 尝试获取文档标题和内容
  let docTitle = linkUrl;
  let docContent = null;
  let fetchNote = '';
  let linkFingerprint = null;
  let linkDocToken = null;
  try {
    const mMinute = linkUrl.match(/minutes?\/([a-zA-Z0-9]+)/);
    const mDocx   = linkUrl.match(/docx\/([a-zA-Z0-9]+)/);
    const mWiki   = linkUrl.match(/wiki\/([a-zA-Z0-9]+)/);
    const mFile   = linkUrl.match(/\/file\/([a-zA-Z0-9]+)/);
    const mSheet  = linkUrl.match(/sheets?\/([a-zA-Z0-9]+)/);
    const mBase   = linkUrl.match(/base\/([a-zA-Z0-9]+)/);

    let data = null;

    if (mMinute) {
      // 飞书妙记：调用 minutes API 获取转录文字
      const minuteToken = mMinute[1];
      linkDocToken = minuteToken;
      log('info', '检测到飞书妙记链接，minute_token=' + minuteToken);
      docTitle = '飞书妙记';
      try {
        // Step 1: 获取妙记基本信息（标题、时长等）
        const minuteResp = await fetchAPI('GET', `/open-apis/minutes/v1/minutes/${minuteToken}`, 10000);
        if (minuteResp?.minute?.title) {
          docTitle = '飞书妙记：' + minuteResp.minute.title;
          log('ok', `妙记标题: ${docTitle}`);
        }

        // Step 2: 获取转录文本 — 支持分页读取全部内容
        let allSentences = [];
        let pageToken = null;
        const MAX_PAGES = 5;      // 最多读 5 页（每页 100 句 ≈ 500 句）
        const PAGE_SIZE = 100;

        for (let page = 0; page < MAX_PAGES; page++) {
          let url = `/open-apis/minutes/v1/minutes/${minuteToken}/transcript?page_size=${PAGE_SIZE}`;
          if (pageToken) url += `&page_token=${pageToken}`;

          const transcriptResp = await fetchAPI('GET', url, 15000);
          if (!transcriptResp) break; // 超时或返回空，结束分页

          if (transcriptResp?.sentences?.length > 0) {
            allSentences.push(...transcriptResp.sentences);
          }

          pageToken = transcriptResp?.page_token;
          if (!pageToken) break; // 没有下一页
        }

        if (allSentences.length > 0) {
          const texts = allSentences.slice(0, 200).map(s =>
            s.speaker ? `[${s.speaker}] ${s.text}` : s.text
          );
          docContent = texts.join('\n').slice(0, 5000);
          log('ok', `妙记转录成功: ${allSentences.length} 句, ${docContent.length} 字符`);
        } else {
          log('warn', '妙记转录返回空内容');
          fetchNote = '妙记转录内容为空';
        }
      } catch (e) {
        log('warn', '妙记读取失败: ' + (e.message?.substring(0, 80)));
        fetchNote = '妙记内容读取异常：' + (e.message?.substring(0, 40) || '未知错误');
      }
    } else if (mFile) {
      // 飞书云空间文件链接：走文件下载流程
      const fileToken = mFile[1];
      linkDocToken = fileToken;
      log('info', '检测到云空间文件链接，file_token=' + fileToken);
      docTitle = '飞书云空间文件';

      // 尝试下载文件并提取内容
      try {
        const { extractText } = await import('../tools/file_content_extractor.js');
        const downloaded = await downloadDriveFile(fileToken);
        if (downloaded) {
          docContent = await extractText(fileToken, 'cloud_file.pdf');
          if (docContent && docContent.length > 20) {
            docTitle = '云空间文件';
            log('ok', '云空间文件内容提取成功: ' + docContent.length + ' 字符');
          }
        }
      } catch (e) {
        log('warn', '云空间文件内容提取失败: ' + e.message);
      }

    } else if (mDocx) {
      linkDocToken = mDocx[1];
      data = await fetchAPI('GET', `/open-apis/docx/v1/documents/${linkDocToken}`, 10000);
      docTitle = data?.document?.title || '飞书文档';
      docContent = await fetchDocxContent(linkDocToken);
      if (!data?.document?.title && docContent) {
        docTitle = inferTitleFromContent(docContent) || '飞书文档';
      }
    } else if (mWiki) {
      data = await fetchAPI('GET', `/open-apis/wiki/v2/spaces/get_node?token=${mWiki[1]}`, 10000);
      docTitle = data?.node?.title;
      const objToken = data?.node?.obj_token;
      linkDocToken = objToken;
      if (objToken && data?.node?.obj_type === 'docx') {
        docContent = await fetchDocxContent(objToken);
        if (!docTitle && docContent) {
          docTitle = inferTitleFromContent(docContent) || '飞书文档';
        }
      }
    } else if (mSheet) {
      data = await fetchAPI('GET', `/open-apis/sheets/v3/spreadsheets/${mSheet[1]}`, 3000);
      docTitle = data?.spreadsheet?.title;
    } else if (mBase) {
      data = await fetchAPI('GET', `/open-apis/bitable/v1/apps/${mBase[1]}`, 3000);
      docTitle = data?.app?.name ?? data?.name ?? data?.title;
    }

    // 生成内容指纹：优先用文档 token，其次用标题+URL
    if (linkDocToken) {
      linkFingerprint = 'doc:' + linkDocToken;
    } else {
      linkFingerprint = 'url:' + linkUrl;
    }

    if (!data && docTitle === linkUrl) {
      fetchNote = '抓取超时，请手动查看';
    }
  } catch (e) {
    fetchNote = '抓取失败，请手动查看';
    log('warn', '标题获取异常: ' + (e.message?.substring(0,60)));
  }

  // 加锁防并发
  if (linkFingerprint && !acquireLock(linkFingerprint)) {
    log('info', '链接正在处理中，跳过重复请求: ' + linkUrl);
    return { action: 'skipped', reason: 'locked' };
  }

  // 去重：如果标题还是原始 URL，说明获取失败
  if (docTitle === linkUrl) {
    docTitle = '飞书链接';
  }

  // AI 提取字段（如有文档内容，一起传入）
  const currentText = JSON.parse(msg.content).text ?? '';
  const recentContext = getRecentContext(chatId, msg.message_id);
  const contextText = [currentText, recentContext].filter(Boolean).join('\n');
  if (recentContext) log('info', `链接上下文: ${recentContext.slice(0, 160)}`);
  let aiFields;
  try {
    const aiTimeoutMs = docContent && docContent.length > 1000 ? 25000 : 12000;
    aiFields = await Promise.race([
      extractFields(docTitle, contextText, senderName, docContent),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI提取超时')), aiTimeoutMs)
      ),
    ]);
  } catch {
    log('warn', 'AI 提取超时，使用内容兜底字段');
    aiFields = buildFallbackFieldsFromContent(docTitle, senderName, docContent);
  }
  log('info', 'AI 提取结果:', aiFields);

  // 写入多维表格（22列完整知识库索引）
  const recordFields = {
    '文件名': docTitle,
    '活动名称': aiFields.活动名称 || '',
    '分享人': aiFields.分享人 || '',
    '主题标签': Array.isArray(aiFields.主题标签) ? aiFields.主题标签.join(', ') : (aiFields.主题标签 || ''),
    '航海期次': aiFields.航海期次 || '',
    '上传时间': new Date().toLocaleString('zh-CN', { hour12: false }),
    '一句话摘要': aiFields.一句话摘要 || '',
    '核心观点': Array.isArray(aiFields.核心观点) ? aiFields.核心观点.join('\n') : '',
    '内容类型': aiFields.内容类型 || '其他',
    '适合人群': Array.isArray(aiFields.适合人群) ? aiFields.适合人群 : [],
    '推荐优先级': aiFields.推荐优先级 || '参考',
    '文档完整度': aiFields.文档完整度 || 5,
    'AI置信度': aiFields.置信度 || 0,
    '文件链接': { link: linkUrl, text: docTitle },
    '原文链接': { link: linkUrl, text: docTitle },
    '归档时间': Date.now(),
    '是否有实操': !!aiFields.是否有实操,
    '是否有案例': !!aiFields.是否有案例,
    '内容指纹': linkFingerprint || `url:${linkUrl}`,
    '归档理由': aiFields.归档理由 || (fetchNote ? '需人工核查' : 'AI自动归档'),
  };
  if (fetchNote) recordFields['归档理由'] = fetchNote;

  let archiveResult = null;
  try {
    const { action, recordId } = await insertIfNotExist(recordFields);
    archiveResult = { action, recordId, linkUrl, docTitle };
    log('ok', '链接归档写入成功: ' + action + ' record_id=' + recordId);

    // 异步生成向量（不影响归档主流程）
    if (recordId && action !== 'skipped') {
      buildVectorForRecord(recordId, recordFields).catch(err =>
        log('warn', `链接向量生成失败(可忽略): ${err.message}`)
      );
    }
  } catch (err) {
    log('err', '链接写入失败: ' + err.message);
    if (sendReply !== false) {
      await sendTextMessage(chatId, '链接归档失败：' + linkUrl);
    }
    return { action: 'failed', reason: 'bitable_write_failed', linkUrl };
  } finally {
    if (linkFingerprint) releaseLock(linkFingerprint);
  }

  // 紧凑确认（仅在非扫描模式下发）
  if (sendReply !== false) {
    const needsReview = aiFields.置信度 < 0.6;
    const reviewNote = needsReview ? ' ⚠️置信度低请核查' : '';
    const timeoutNote = fetchNote ? ` ⚠️${fetchNote}` : '';
    const tags = aiFields.主题标签?.length ? `·${aiFields.主题标签.join('、')}` : '';
    await sendTextMessage(chatId,
      `✅ 已归档：${docTitle} ${aiFields.分享人 ? '·'+aiFields.分享人 : ''}${tags} ${linkUrl}${reviewNote}${timeoutNote}`
    );
  }

  return archiveResult;
}

function buildFallbackFieldsFromContent(title, senderName, content) {
  const text = (content || '').replace(/\s+/g, ' ').trim();
  const summary = text
    ? text.slice(0, 180)
    : `${title || '飞书链接'}，内容暂未完成 AI 结构化提取。`;

  const isLiveNotes = /直播|纪要|复盘|会议|分享|课程|课堂/.test(`${title} ${text.slice(0, 500)}`);
  const tags = [];
  if (/直播/.test(`${title} ${text}`)) tags.push('直播纪要');
  if (/AI|人工智能|大模型/.test(`${title} ${text}`)) tags.push('AI');
  if (/出海|海外/.test(`${title} ${text}`)) tags.push('出海');
  if (/运营|增长|转化/.test(`${title} ${text}`)) tags.push('运营增长');
  if (!tags.length) tags.push(isLiveNotes ? '内容纪要' : '飞书文档');

  return {
    '活动名称': title && title !== '飞书链接' ? title : null,
    '分享人': senderName && !senderName.startsWith('ou_') ? senderName : null,
    '主题标签': [...new Set(tags)].slice(0, 5),
    '航海期次': null,
    '置信度': text ? 0.45 : 0.2,
    '一句话摘要': summary,
    '核心观点': text ? [summary] : [],
    '解决的问题': text ? '已抓取正文，但 AI 结构化提取超时，先保留内容摘要供检索与人工复核。' : null,
    '内容类型': isLiveNotes ? '会议/直播纪要' : '飞书文档',
    '适合人群': ['全员'],
    '推荐优先级': '参考',
    '文档完整度': text ? 6 : 3,
    '是否有实操': /实操|步骤|方法|案例|操作|流程/.test(text),
    '是否有案例': /案例|例子|示例|复盘/.test(text),
    '归档理由': '文档正文已抓取，AI 提取超时后使用内容兜底归档，建议后续人工补全字段。',
    '内容长度': content ? content.length : 0,
  };
}

function inferTitleFromContent(content) {
  const firstLine = (content || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length >= 4 && line.length <= 80);
  return firstLine || null;
}

function extractFileTokenFromUrl(url) {
  const m = String(url || '').match(/\/file\/([a-zA-Z0-9]+)/);
  return m?.[1] || null;
}

// ── 工具函数 ──────────────────────────────────────

async function sendTextMessage(chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: appendLibraryFooter(text) }),
    },
  });
}

/**
 * 为已写入多维表格的记录建立 BM25 搜索索引
 * 该步骤异步执行，失败不影响归档主流程
 * @param {string} recordId — Bitable record_id
 * @param {Object} fields — 记录字段
 */
async function buildVectorForRecord(recordId, fields) {
  const text = buildDocumentText(fields);
  if (!text) {
    log('warn', `record ${recordId} 没有可索引文本，跳过`);
    return;
  }

  // 本地 BM25 索引：直接添加到文本索引
  const { addToIndex } = await import('../lib/embedding.js');
  addToIndex(recordId, text);
  log('ok', `BM25 索引已更新: ${recordId}`);
}

/**
 * 获取飞书文档的正文内容（通过 blocks API）
 * 调用 docx/v1/documents/{docToken}/blocks 获取文档所有块，
 * 递归提取文本内容。
 *
 * @param {string} docToken — 飞书文档 token（obj_token）
 * @returns {Promise<string|null>} 文档纯文本内容（前 3000 字）
 */
async function fetchDocxContent(docToken) {
  try {
    log('info', `读取文档内容: ${docToken}`);

    // 获取文档的 blocks（第一页，最多 500 个 block）
    const resp = await fetchAPI('GET',
      `/open-apis/docx/v1/documents/${docToken}/blocks?page_size=500`,
      10000
    );

    if (!resp || !resp.items) {
      log('warn', `文档 ${docToken} 无内容`);
      return null;
    }

    // 提取所有 block 的 text 内容
    const textParts = [];
    for (const block of resp.items) {
      const blockText = extractTextFromBlock(block);
      if (blockText) textParts.push(blockText);
    }

    const fullText = textParts.join('\n').trim();
    if (fullText.length > 20) {
      log('ok', `文档内容提取成功: ${fullText.length} 字符`);
      return fullText.slice(0, 3000); // 取前 3000 字
    }

    return null;
  } catch (err) {
    log('warn', `读取文档内容失败: ${err.message}`);
    return null;
  }
}

/**
 * 从飞书 block 对象中提取纯文本
 * 飞书文档由各种 block 类型组成：text, heading, bullet 等
 */
function extractTextFromBlock(block) {
  if (!block || !block.text) return null;

  // 飞书 block.text 结构：{ elements: [{ text_run: { content: "..." } }] }
  const elements = block.text.elements || [];
  const text = elements
    .map(el => {
      if (el.text_run?.content) return el.text_run.content;
      if (el.link?.text?.content) return el.link.text.content;
      return '';
    })
    .join('');

  return text || null;
}

/**
 * 从飞书云空间下载文件（用于处理云空间文件分享链接）
 */
async function downloadDriveFile(fileToken) {
  let token = null;
  try {
    const { client } = await import('../lib/feishu.js');
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  if (!token) {
    try {
      const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: process.env.FEISHU_APP_ID,
          app_secret: process.env.FEISHU_APP_SECRET,
        }),
      });
      const json = await resp.json();
      token = json?.tenant_access_token;
    } catch { /* skip */ }
  }
  if (!token) return null;

  try {
    const resp = await fetch(
      'https://open.feishu.cn/open-apis/drive/v1/files/' + fileToken + '/download',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}
