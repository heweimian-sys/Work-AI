const STAGES = ['开营', '航行', '中期', '结营', '高手领航'];

const TYPE_RULES = [
  [/\.pptx?$|PPT|幻灯片/i, 'PPT'],
  [/回放|录播|视频|\.mp4$/i, '回放'],
  [/作业|练习|打卡/, '作业模板'],
  [/SOP|流程|操作手册/i, 'SOP'],
  [/海报|宣传图|招募图/, '海报'],
  [/飞书|文档|docx?|wiki/i, '飞书文档'],
];

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function inferVoyageMetadata(input = {}) {
  const source = [
    input.fileName,
    input.contextText,
    input.activityName,
    input.period,
    input.contentType,
  ].map(clean).filter(Boolean).join(' ');

  const monthMatch = source.match(/(?:20\d{2}[年/-])?\s*(1[0-2]|0?[1-9])\s*月/);
  const month = monthMatch ? `${Number(monthMatch[1])}月` : '';
  const stage = STAGES.find(item => source.includes(item)) || '';
  const materialType = TYPE_RULES.find(([rule]) => rule.test(source))?.[1] || clean(input.materialType);

  let project = clean(input.activityName)
    .replace(/(?:20\d{2}[年/-])?\s*(?:1[0-2]|0?[1-9])\s*月/g, '')
    .replace(/航海/g, '')
    .replace(new RegExp(STAGES.join('|'), 'g'), '')
    .trim();

  if (!project) {
    const projectMatch = source.match(/([A-Za-z0-9\u4e00-\u9fa5]{2,20})航海/);
    project = clean(projectMatch?.[1])
      .replace(/(?:20\d{2}[年/-])?\s*(?:1[0-2]|0?[1-9])\s*月/g, '')
      .trim();
  }

  const required = { month, project, stage, materialType };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  const confidence = Math.max(0, Math.min(1, Number(input.confidence || 0)));

  return {
    month,
    project,
    stage,
    materialType,
    missing,
    needsClassification: missing.length > 0 || confidence < 0.6,
  };
}

function value(fields, name) {
  const raw = fields?.[name];
  if (raw && typeof raw === 'object') return raw.link || raw.text || '';
  return raw;
}

export function isQueryableVoyageRecord(fields = {}) {
  const archiveStatus = clean(value(fields, '归档状态'));
  const validity = clean(value(fields, '有效状态'));
  const currentVersion = value(fields, '当前版本');
  const link = clean(value(fields, '文件链接') || value(fields, '原文链接'));

  if (archiveStatus && archiveStatus !== '已归档') return false;
  if (validity === '失效') return false;
  if (currentVersion === false || clean(currentVersion) === '否') return false;
  return /^https?:\/\//i.test(link) && !link.includes('/file/test');
}

export function buildArchiveLifecycle(metadata, { backedUp = false } = {}) {
  return {
    '航海月份': metadata.month,
    '航海项目': metadata.project,
    '航海阶段': metadata.stage,
    '资料类型': metadata.materialType || '其他',
    '归档状态': metadata.needsClassification ? '待补分类' : '已归档',
    '备份状态': backedUp ? '已备份' : '未备份',
    '有效状态': '有效',
    '当前版本': true,
  };
}

