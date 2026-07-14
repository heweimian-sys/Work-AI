/**
 * tools/relevance.js — 资料库相关性判断
 *
 * 用高精度规则过滤“运营/客服/交易/寒暄”类记录，避免历史扫描污染资料库。
 * 规则偏保守：没有明显噪音信号时保留，避免误删真实资料。
 */

const RESOURCE_POSITIVE = [
  /资料|文档|课件|PPT|pdf|PDF|教程|指南|手册|SOP|清单|模板|案例|复盘|直播|纪要|回放|课程|分享|讲义|方法论|实操|实战|工具包|攻略/,
  /航海|高手领航|深海圈|新人营|训练营|共读|内测|AI|大模型|知识库|自动化|编程|短剧|视频号|小红书|公众号|TikTok|YouTube/,
  /怎么|如何|步骤|流程|打法|策略|路径|经验|拆解|总结|观点|要点|解决方案/,
];

const HARD_NOISE_PATTERNS = [
  /退款|退费|保证金|返钱|返还|支付|付款|收款|订单|交易|账单|发票|报销|对账|余额|扣款|信用卡|支付宝|微信支付|转账/,
  /报名进度|报名成功|报名失败|审核|资格|进群|入群|退群|换号|小号|微信号|编号|名单|权限|续费|到期|权益|客服|服务助手/,
  /志愿者申请|名单公布|申请结果|能不能报名|还能报名|是否可以报名|咨询时长|微咨询|老会员|早鸟价/,
];

const SOFT_NOISE_PATTERNS = [
  /圈友编号|星球编号|麻烦看一下|帮忙看下|辛苦看一下|辛苦解答|咨询一下|想问一下/,
  /收到|好的|谢谢|辛苦|稍等|可以的|已处理|麻烦|帮忙看下|看一下/,
];

const NOISE_PATTERNS = [...HARD_NOISE_PATTERNS, ...SOFT_NOISE_PATTERNS];

const STRONG_RESOURCE_HINTS = [
  /资料|文档|课件|PPT|pdf|PDF|教程|指南|手册|SOP|清单|模板|案例|数据表|原文链接|链接|复盘|直播|纪要|回放|课程|分享|讲义|工具包|攻略/,
];

const STRONG_RESOURCE_TYPES = [
  'PPT/幻灯片',
  '教程指南',
  '飞书文档',
  '会议/直播纪要',
  '直播纪要',
  '课程资料',
  '产品介绍',
];

const WEAK_TYPES = ['群聊记录', '合并转发', '访谈记录', '其他'];
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|bmp|webp)$/i;
const MATERIAL_FILE_RE = /\.(pdf|docx?|pptx?|xlsx?|csv|md|txt|zip|rar|7z)$/i;
const CHAT_SCREENSHOT_RE = /聊天记录|群聊记录|微信聊天|截图|朋友圈|对话|私信|收到|好的|谢谢|辛苦|麻烦看|咨询|报名|审核|付款|退款|转账|进群|小助手|客服/;

function normalize(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (value && typeof value === 'object') return [value.text, value.link].filter(Boolean).join(' ');
  return String(value || '');
}

function boolMatch(patterns, text) {
  return patterns.some(re => re.test(text));
}

function extractFieldsText(fields = {}) {
  return [
    fields['文件名'],
    fields['活动名称'],
    fields['主题标签'],
    fields['航海期次'],
    fields['一句话摘要'],
    fields['核心观点'],
    fields['解决的问题'],
    fields['内容类型'],
    fields['归档理由'],
    fields['_fileContent'],
  ].map(normalize).filter(Boolean).join('\n');
}

function extractUrl(value) {
  if (value && typeof value === 'object') return String(value.link || value.text || '');
  return String(value || '');
}

function hasUsableUrl(value) {
  const url = extractUrl(value).trim();
  return /^https?:\/\//i.test(url) && !url.includes('/file/test');
}

export function assessResourceRelevance(input = {}) {
  const fields = input.fields || input;
  const text = extractFieldsText(fields);
  const contentType = normalize(fields['内容类型']);
  const fingerprint = normalize(fields['内容指纹']);
  const fileName = normalize(fields['文件名']);
  const link = normalize(fields['文件链接']);
  const attachmentLinks = normalize(fields['附件链接']);
  const confidence = Number(fields['AI置信度'] || fields['置信度'] || 0);
  const msgType = normalize(fields['_messageType']);
  const hasFileUrl = hasUsableUrl(fields['文件链接']) || hasUsableUrl(fields['原文链接']);
  const hasAttachmentUrl = hasUsableUrl(attachmentLinks);
  const isImageFile = msgType === 'image' || IMAGE_FILE_RE.test(fileName);
  const isMaterialFile = MATERIAL_FILE_RE.test(fileName);

  const hasPositive = boolMatch(RESOURCE_POSITIVE, text);
  const hasStrongResourceHint = boolMatch(STRONG_RESOURCE_HINTS, text);
  const hasHardNoise = boolMatch(HARD_NOISE_PATTERNS, text);
  const hasSoftNoise = boolMatch(SOFT_NOISE_PATTERNS, text);
  const hasNoise = hasHardNoise || hasSoftNoise;
  const isChatOnly = fingerprint.startsWith('text:') || fingerprint.startsWith('forward:') || WEAK_TYPES.includes(contentType);
  const isUploadedFile = fingerprint.startsWith('file:') || /富文本图片_|历史文件_|\.png$|\.jpg$|\.jpeg$/i.test(fileName);
  const isDocOrLink = fingerprint.startsWith('doc:') || fingerprint.startsWith('url:') || /\/docx\/|\/wiki\/|\/minutes?\/|\/file\//.test(link);
  const isStrongType = STRONG_RESOURCE_TYPES.includes(contentType);
  const isChatScreenshot = isImageFile && CHAT_SCREENSHOT_RE.test(text);

  let score = 0;
  if (hasPositive) score += 3;
  if (hasStrongResourceHint) score += 2;
  if (isStrongType) score += 2;
  if (isDocOrLink) score += 2;
  if (confidence >= 0.8) score += 1;
  if (hasHardNoise) score -= 4;
  if (hasSoftNoise) score -= 2;
  if (isChatOnly && hasHardNoise) score -= 2;
  if (isUploadedFile && hasHardNoise && !isStrongType) score -= 1;
  if (text.length < 80 && !isDocOrLink) score -= 1;
  if (isImageFile && !hasStrongResourceHint) score -= 2;
  if (isChatScreenshot) score -= 4;
  if (isUploadedFile && !hasFileUrl && !hasAttachmentUrl) score -= 3;

  if (isUploadedFile && !hasFileUrl && !hasAttachmentUrl) {
    return { keep: false, score, reason: '附件没有可打开链接，跳过不可用资料' };
  }

  if (isImageFile && isChatScreenshot && !hasStrongResourceHint) {
    return { keep: false, score, reason: '图片像聊天/运营截图，缺少可复用资料内容' };
  }

  if (isImageFile && !hasStrongResourceHint && !isStrongType && score < 3) {
    return { keep: false, score, reason: '图片未识别出教程/案例/复盘等资料信号' };
  }

  if (isUploadedFile && !isImageFile && !isMaterialFile && !hasStrongResourceHint && score < 2) {
    return { keep: false, score, reason: '文件类型和内容都缺少资料价值信号' };
  }

  if (hasStrongResourceHint && !hasHardNoise) {
    return { keep: true, score, reason: '包含明确资料线索，保守保留' };
  }

  if (hasHardNoise && !hasPositive) {
    return { keep: false, score, reason: '运营/客服/交易类信息，缺少资料价值信号' };
  }

  if (hasHardNoise && isChatOnly && score <= 1) {
    return { keep: false, score, reason: '群聊记录偏运营咨询，资料价值低' };
  }

  if (hasHardNoise && isUploadedFile && score <= 0) {
    return { keep: false, score, reason: '历史图片内容偏运营/交易/报名咨询，资料价值低' };
  }

  if (!hasPositive && isChatOnly && text.length < 160) {
    return { keep: false, score, reason: '短群聊记录且无资料关键词' };
  }

  return { keep: true, score, reason: hasPositive ? '包含资料相关信号' : '未命中高置信噪音，保守保留' };
}

export function classifyLibraryMaterial(input = {}) {
  const fields = input.fields || input;
  const assessment = assessResourceRelevance(fields);
  const fileName = normalize(fields['文件名']);
  const contentType = normalize(fields['内容类型']);
  const fingerprint = normalize(fields['内容指纹']);
  const fileLink = extractUrl(fields['文件链接']);
  const sourceLink = extractUrl(fields['原文链接']);
  const attachmentLinks = normalize(fields['附件链接']);
  const extractedText = normalize(fields['抽取正文'] || fields['_fileContent'] || fields['核心观点'] || fields['一句话摘要']);
  const linkText = [fileLink, sourceLink, attachmentLinks].join('\n');
  const hasStableLink = /https?:\/\//i.test(linkText) && !/\/file\/test/.test(linkText);
  const hasDriveFile = /\/file\/[a-zA-Z0-9]+|\/docx\/|\/wiki\/|\/minutes?\//.test(linkText);
  const hasExtractedText = extractedText.replace(/\s+/g, '').length >= 80;
  const isImageOnly = IMAGE_FILE_RE.test(fileName) || contentType.includes('图片') || contentType.includes('截图');
  const isChatRecord = fingerprint.startsWith('text:') || fingerprint.startsWith('forward:') || WEAK_TYPES.includes(contentType);
  const isMcp = fingerprint.startsWith('mcp:') || /生财MCP/.test(normalize(fields['归档理由']));

  let status = '可用';
  let materialType = contentType || '资料';
  let confidence = '中';
  let suggestion = '可进入网页资料库和 AI 问答。';

  if (!assessment.keep) {
    status = '低价值';
    confidence = '低';
    suggestion = assessment.reason;
  } else if (!hasStableLink) {
    status = '待补源';
    confidence = '低';
    suggestion = '缺少可打开的原文或文件链接，需要补来源后再上架。';
  } else if (isChatRecord) {
    status = hasExtractedText ? '待审核' : '低价值';
    materialType = '聊天线索';
    confidence = '低';
    suggestion = hasExtractedText ? '聊天内容需人工确认是否可沉淀为资料。' : '仅聊天记录，不进入正式资料库。';
  } else if (isImageOnly && !hasExtractedText) {
    status = '仅图片';
    materialType = '图片线索';
    confidence = '低';
    suggestion = '只有图片/截图链接，缺少 OCR 正文，需补抽取正文。';
  } else if (isMcp && !hasDriveFile && !hasExtractedText) {
    status = '待补源';
    materialType = 'MCP线索';
    confidence = '中';
    suggestion = 'MCP 只返回图片或摘要，需补可引用原文或正文后上架。';
  } else if (!hasExtractedText && !hasDriveFile) {
    status = '待补正文';
    confidence = '中';
    suggestion = '已有链接，但缺少抽取正文，网页可展示，AI 问答暂不使用。';
  }

  if (/pdf|PPT|文档|docx|课程|手册|指南|SOP|复盘|案例/i.test(`${fileName} ${contentType}`)) {
    materialType = materialType === '资料' ? '文档资料' : materialType;
  }

  return {
    keep: status === '可用' || status === '待审核' || status === '待补正文',
    status,
    materialType,
    sourceConfidence: confidence,
    suggestion,
    hasStableLink,
    hasExtractedText,
    score: assessment.score,
    reason: assessment.reason,
  };
}

export function shouldArchiveHistoricalText(text = '') {
  const source = normalize(text);
  if (!source || source.length < 30) return false;
  if (/^(谢谢|收到|好的|辛苦|稍等|滴滴|来啦|可以|会的)[呀哈哦～~，,\s]*$/i.test(source)) return false;

  const hasPositive = boolMatch(RESOURCE_POSITIVE, source);
  const hasNoise = boolMatch(NOISE_PATTERNS, source);

  if (hasNoise && !hasPositive) return false;
  if (hasNoise && source.length < 120) return false;
  return hasPositive || source.length >= 100;
}

export function extractDriveFileToken(fields = {}) {
  const link = normalize(fields['文件链接']);
  const m = link.match(/\/file\/([a-zA-Z0-9]+)/);
  return m?.[1] || null;
}

