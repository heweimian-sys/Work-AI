/**
 * tools/mcp_shell.js - Productized metadata shell for Shengcai MCP records.
 */

function normalizeText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return [value.text, value.link, value.name, value.title, value.label].map(normalizeText).filter(Boolean).join(' ');
  }
  return String(value).trim();
}

function uniqueList(items) {
  return [...new Set(items.map(normalizeText).filter(Boolean))];
}

function inferTags(text = '') {
  const rules = [
    ['AI', /AI|人工智能|大模型|Claude|ChatGPT|数字人|POD/i],
    ['小红书', /小红书|红书/i],
    ['短视频', /短视频|抖音|视频号|B站|B 站|微电影|短剧|动漫化/i],
    ['电商', /电商|带货|跨境|POD|Etsy|选品|店铺/i],
    ['私域', /私域|社群|微信|朋友圈/i],
    ['本地生活', /同城|团购|探店|景点|约拍/i],
    ['内容IP', /IP|账号|内容|引流|获客/i],
    ['服务变现', /服务|咨询|陪跑|代做|诊断/i],
    ['项目案例', /项目|案例|收入|变现|商业/i],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

function extractRawTags(raw = {}) {
  const values = [
    raw.platformMenus,
    raw.monetizeMenus,
    raw.crowdMenus,
    raw.label,
    raw.labels,
    raw.tags,
  ].flatMap(value => Array.isArray(value) ? value : [value]);

  return values.flatMap(item => {
    if (!item) return [];
    if (typeof item === 'string') return item.split(/[,，/、\s]+/);
    return [item.name, item.label, item.title, item.text, item.menuName].filter(Boolean);
  });
}

function formatIncome(raw = {}) {
  const min = Number(raw.incomeMin || 0);
  const max = Number(raw.incomeMax || 0);
  if (!min && !max) return '';
  if (min && max) return `参考月收入区间：${min}-${max} 元`;
  return `参考月收入：${min || max} 元`;
}

function inferContentType(material = {}) {
  if (material.sourceTool === 'activityManualSearch') return '航海手册';
  if (material.sourceTool === 'activityPilotSearch') return '高手领航';
  if (['projectLibSearch', 'projectLibList'].includes(material.sourceTool)) return '项目库案例';
  if (['searchTopic', 'contentSearch'].includes(material.sourceTool)) return '生财帖子';
  const type = normalizeText(material.type);
  return type && type !== '其他' ? type : '项目库案例';
}

export function mergeMcpTags(aiTags, shellTags) {
  const fromAi = Array.isArray(aiTags) ? aiTags : normalizeText(aiTags).split(/[,，/、\s]+/);
  return uniqueList([...fromAi, ...shellTags]).join(', ');
}

export function buildMcpShell(material = {}) {
  const raw = material.raw || {};
  const title = normalizeText(material.title || material.name || raw.name || raw.title || 'MCP资料');
  const summary = normalizeText(material.summary || raw.summary || raw.description || raw.highlightText);
  const content = normalizeText(material.content || raw.content || raw.highlightArticleContent);
  const text = [title, summary, content, material.tags, normalizeText(raw.highlightText)].filter(Boolean).join('\n');
  const contentType = inferContentType(material);
  const tags = uniqueList([...extractRawTags(raw), ...inferTags(text), contentType]);
  const income = formatIncome(raw);
  const proof = [
    raw.caseCount ? `实战案例：${raw.caseCount} 个` : '',
    raw.resourceCount ? `学习资源：${raw.resourceCount} 个` : '',
    raw.dailyMinutes ? `建议投入：每天 ${raw.dailyMinutes} 分钟` : '',
    raw.estimatedCost ? `启动资金参考：${raw.estimatedCost} 元` : '',
  ].filter(Boolean);

  const corePoints = uniqueList([
    summary,
    income,
    ...proof,
    raw.isInActivity ? '该项目关联航海，可作为航海项目资料线索' : '',
    raw.isSuper ? '生财项目库标记为重点项目，建议优先评估' : '',
  ]).slice(0, 5);

  const problem =
    contentType === '项目库案例'
      ? `帮助客服/运营快速判断「${title}」这个项目的适用场景、变现路径和可推荐人群。`
      : contentType === '航海手册'
        ? `提供「${title}」相关执行步骤、SOP 或操作手册线索。`
        : contentType === '高手领航'
          ? `沉淀「${title}」相关高手经验、案例和实战观点。`
          : `补充「${title}」相关外部资料线索。`;

  const audience = uniqueList([
    /新手|入门|低成本|小本/.test(text) ? '新手' : '',
    /运营|小红书|抖音|视频号|私域|社群/.test(text) ? '运营' : '',
    /电商|店铺|选品|跨境/.test(text) ? '电商' : '',
    /AI|编程|自动化|大模型/.test(text) ? 'AI工具使用者' : '',
    '客服',
  ]);

  const priority = raw.isSuper || raw.resourceCount || raw.caseCount ? '推荐' : '参考';
  const completeness = content.length > 300 ? 8 : contentType === '项目库案例' ? 6 : 5;

  return {
    contentType,
    tags,
    summary: summary || content.slice(0, 80) || `${title} 的生财 MCP 资料线索。`,
    corePoints,
    problem,
    audience,
    priority,
    completeness,
    archiveReason: [
      `来源工具：${material.sourceTool || 'scys-mcp'}`,
      contentType === '项目库案例' ? '项目库案例可补充客服找资料时的项目/案例答案' : '',
      priority === '推荐' ? '包含案例、资源或重点项目信号' : '作为外部资料线索入库，后续可按反馈继续筛选',
    ].filter(Boolean).join('\n'),
  };
}

export function buildShellFromExistingFields(fields = {}) {
  const title = normalizeText(fields['文件名'] || fields['活动名称']);
  const summary = normalizeText(fields['一句话摘要']);
  const content = [summary, fields['核心观点'], fields['解决的问题'], fields['主题标签']].map(normalizeText).filter(Boolean).join('\n');
  return buildMcpShell({
    title,
    summary,
    content,
    type: fields['内容类型'],
    sourceTool: 'projectLibSearch',
    tags: fields['主题标签'],
    raw: {},
  });
}
