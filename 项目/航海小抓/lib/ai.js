/**
 * ai.js — AI 字段提取 + 查询理解
 *
 * 优化：
 *  1. 结构化 Prompt 模板，明确每个字段的定义和规则
 *  2. 严禁将飞书用户 ID 填入分享人
 *  3. 降级填充策略：内容不足时基于文件名合理推断
 *  4. 置信度规则更严谨
 */

import OpenAI from 'openai';
import 'dotenv/config';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
});



const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 从文件名和文件内容提取结构化字段
 *
 * @param {string} fileName - 文件名
 * @param {string} contextMessage - 群内上下文
 * @param {string} senderName - 上传者（可能是 open_id）
 * @param {string|null} fileContent - 文件内容文本（如有）
 */
export async function extractFields(fileName, contextMessage = '', senderName = '', fileContent = null) {
  const hasContent = fileContent && fileContent.trim().length > 30;
  const contentPreview = hasContent
    ? fileContent.slice(0, 4000)
    : null;

  const prompt = buildPrompt(fileName, contextMessage, senderName, contentPreview);

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    });

    const parsed = (() => {
      const raw = resp.choices[0].message.content;
      try {
        return JSON.parse(raw);
      } catch (e) {
        log('warn', `AI 返回非JSON，尝试提取: ${raw.slice(0, 80)}`);
        // 兜底：尝试提取 {...} 或 [...] 部分
        const jsonMatch = raw.match(/\{[\s\S]*\}/) || raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (e2) {
            log('warn', `JSON 提取后仍解析失败`);
          }
        }
        // 最后兜底：返回空对象
        log('warn', `AI 返回完全无法解析，使用默认值`);
        return {};
      }
    })();

    const result = {
      '活动名称': parsed.活动名称 || null,
      '分享人': parsed.分享人 || null,
      '主题标签': Array.isArray(parsed.主题标签) ? parsed.主题标签 : [],
      '航海期次': parsed.航海期次 || null,
      '置信度': typeof parsed.置信度 === 'number' ? parsed.置信度 : 0.3,

      // ====== 新增字段 ======
      '一句话摘要': parsed.一句话摘要 || null,
      '核心观点': Array.isArray(parsed.核心观点) ? parsed.核心观点 : [],
      '解决的问题': parsed.解决的问题 || null,
      '内容类型': parsed.内容类型 || null,
      '适合人群': Array.isArray(parsed.适合人群) ? parsed.适合人群 : [],
      '推荐优先级': parsed.推荐优先级 || null,
      '文档完整度': typeof parsed.文档完整度 === 'number' ? parsed.文档完整度 : 5,
      '是否有实操': !!parsed.是否有实操,
      '是否有案例': !!parsed.是否有案例,
      '归档理由': parsed.归档理由 || null,
      '内容长度': typeof parsed.内容长度 === 'number' ? parsed.内容长度 : (fileContent ? fileContent.length : 0),
    };

    // 降级策略：如果置信度低，用文件名补充
    return applyFallback(result, fileName, hasContent);

  } catch (err) {
    console.error('[AI] 字段提取失败:', err.message);
    return applyFallback({
      '活动名称': null,
      '分享人': null,
      '主题标签': [],
      '航海期次': null,
      '置信度': 0,
    }, fileName, false);
  }
}

/**
 * 构建结构化提取 Prompt
 */
function buildPrompt(fileName, contextMessage, senderName, contentPreview) {
  const cleanName = fileName
    .replace(/\(\d+\)/g, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-\\s]+/g, ' ')
    .trim();

  let prompt = `你是一个航海活动知识库整理专家。请从以下文档信息中提取结构化字段。

## 文件信息
- 文件名：${fileName}
- 发送者上下文：${contextMessage || '无'}
`;

  if (contentPreview) {
    prompt += `\n## 文档内容（前 4000 字）\n${contentPreview}\n`;
  } else {
    prompt += `\n## 文档内容\n（无法读取文件内容，仅基于文件名和上下文推断）\n`;
  }

  prompt += `
## 提取要求

请严格按照以下字段定义输出 JSON。**宁多勿漏，不能确定时合理推断，不要留空**：

{
  "活动名称": "活动完整名称。如'AI工具航海'、'小红书运营航海'。不确定则从文件名和上下文推断",
  "分享人": "文档作者或分享人真实姓名。**绝对不能填飞书用户ID(ou_开头)**",
  "主题标签": ["提取3-6个具体关键词", "如：小红书选品", "虚拟电商", "定位"],
  "航海期次": "如'第8次航海'。优先从上下文提取",
  "一句话摘要": "50字内概括核心内容，让别人快速知道这篇文档讲什么",
  "核心观点": ["观点1", "观点2", "观点3"],
  "解决的问题": "这篇文档主要解决了什么问题或适合什么场景",
  "内容类型": "直播纪要 | 教程指南 | 案例拆解 | 复盘总结 | 产品介绍 | 访谈记录 | 行业报告 | 工具推荐 | PPT/幻灯片 | 教程视频 | 思维导图 | 模板工具 | 其他",
  "适合人群": ["新手", "进阶", "运营", "产品", "开发", "设计", "全员"],
  "推荐优先级": "必读 | 推荐 | 选读 | 参考",
  "置信度": 0.85,
  "文档完整度": 8,
  "是否有实操": true,
  "是否有案例": false,
  "归档理由": "一句话说明归档决定",
  "内容长度": 8848
}

## 规则
1. 优先从文档正文提取。有正文就用正文的信息。
2. 分享人：看到 ou_ 开头的绝对不能填，找不到真实姓名就留空。
3. 标签要具体（"小红书虚拟电商选品"好过"电商"）。
4. 一句话摘要不超过50字。
5. 核心观点必须从文档中提炼，不要编造。
6. **如果没有文档内容（或内容很少），则根据文件名和上下文合理推断。对于文件名如"AI视频第一课"这种有明显含义的，置信度不低于0.7，标签要丰富，摘要要具体。**
7. 内容类型从"直播纪要/教程指南/案例拆解/复盘总结/产品介绍/访谈记录/行业报告/工具推荐/其他"中选一个最匹配的。
8. 包含实操步骤时，推荐优先级自动提升。
9. **优先根据文件名后缀或关键词判断内容类型**：文件名含 ".ppt"/".pptx"/"PPT"/"幻灯片" → 内容类型选"PPT/幻灯片"；含 "视频"/"mp4"/"录播" → 选"教程视频"；含 "xmind"/"脑图"/"思维导图" → 选"思维导图"。不要被文件名中的无关词干扰（如"AI视频PPT"是 PPT 不是视频）。
10. **只输出 JSON，不要包含任何解释、问候语或其他文字。不要用 markdown 包裹 JSON。直接输出纯 JSON 对象。**`;

  return prompt;
}

/**
 * 降级填充策略：当 AI 提取结果置信度低时，用文件名补充
 */
function applyFallback(result, fileName, hasContent) {
  // 如果置信度太低，且活动名称为空，用文件名补充
  if (result['置信度'] < 0.5) {
    const cleanName = fileName
      .replace(/\(\d+\)/g, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_\-\s]+/g, ' ')
      .trim();

    if (!result['活动名称']) {
      result['活动名称'] = cleanName;
    }

    // 如果标签为空，从文件名提取有意义的词
    if (!result['主题标签'] || result['主题标签'].length === 0) {
      const words = cleanName
        .split(/[_\-,，\s]+/)
        .filter(w => w.length >= 2 && !/^\d+$/.test(w));
      if (words.length > 0) {
        result['主题标签'] = words.slice(0, 4);
      }
    }

    // 确保置信度至少为 0.2（有内容）或 0.1（无内容）
    if (result['置信度'] < 0.1) {
      result['置信度'] = hasContent ? 0.2 : 0.1;
    }
  }

  // 安全过滤：分享人不能是飞书用户 ID
  if (result['分享人'] && (result['分享人'].startsWith('ou_') || result['分享人'].startsWith('uid_'))) {
    result['分享人'] = null;
  }

  // 根据文件名智能提升：如果文件名有意义，即使内容少也要给出丰富内容
  const hasMeaningfulName = fileName.replace(/\.[^.]+$/, '').replace(/[_\\-\\s()（）\\d]+/g, '').length >= 4;
  if (hasMeaningfulName && result['置信度'] < 0.6) {
    result['置信度'] = Math.max(result['置信度'], 0.7);
    // 如果内容类型为空，根据文件后缀判断
    if (!result['内容类型'] || result['内容类型'] === '其他') {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      if (['ppt', 'pptx'].includes(ext)) result['内容类型'] = 'PPT/幻灯片';
      else if (['docx', 'doc'].includes(ext)) result['内容类型'] = '教程指南';
      else if (['xlsx', 'xls'].includes(ext)) result['内容类型'] = '模板工具';
    }
  }

  return result;
}

/**
 * 理解用户查询意图，提取关键搜索词
 */
export async function extractSearchKeywords(userMessage) {
  const cleaned = userMessage.trim();

  if (cleaned.length <= 6) {
    return localTokenize(cleaned);
  }

  const cacheKey = cleaned.toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.log('[AI] 命中缓存:', cached.keywords);
    return cached.keywords;
  }

  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: '提取搜索关键词，返回JSON数组。\n查询："' + cleaned + '"\n只返回：["词1","词2"]' }],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 100,
  });

  try {
    const raw = resp.choices[0].message.content;
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.keywords ?? Object.values(parsed)[0]);
    const keywords = Array.isArray(arr) ? arr.slice(0, 3) : [cleaned.slice(0, 10)];
    queryCache.set(cacheKey, { keywords, time: Date.now() });
    if (queryCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of queryCache) {
        if (now - v.time > CACHE_TTL) queryCache.delete(k);
      }
    }
    return keywords;
  } catch {
    return localTokenize(cleaned);
  }
}

function localTokenize(text) {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const stopwords = [
    '的', '了', '吗', '呢', '啊', '吧', '老师', '那个', '这个', '一下', '帮我', '请', '麻烦',
    '查找', '搜索', '找', '查', '要', '想', '获取', '看看', '有没有', '文档', '资料', '文件',
    '我', '你', '他', '她', '它', '我们', '你们', '他们', '给我', '发给', '需要', '想要',
    '哪个', '哪些', '什么', '怎么', '怎样', '如何', '一下', '看看', '发给', '发', '给'
  ];
  let processed = cleaned;
  const sortedStop = [...stopwords].sort((a, b) => b.length - a.length);
  for (const sw of sortedStop) {
    processed = processed.replace(new RegExp(sw, 'g'), '');
  }

  processed = processed
    .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2')
    .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');

  const tokens = processed
    .split(/[\s,，。、；;:：!！?？@]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);

  return tokens.length > 0 ? tokens.slice(0, 3) : [cleaned];
}

/**
 * 语义扩展
 */
export async function expandQueryKeywords(userText) {
  if (!userText || !userText.trim()) return [];
  const cleaned = userText.trim();
  if (cleaned.length <= 4) return [];
  if (/^[a-zA-Z0-9]+$/.test(cleaned) && cleaned.length <= 3) return [];

  const cacheKey = 'expand:' + cleaned.toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.keywords;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是一个关键词扩展助手。把查询拆分为核心词并扩展同义词，返回 JSON 数组。' },
        { role: 'user', content: '查询："' + cleaned + '"\n返回 JSON 数组。' },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    const raw = resp.choices[0].message.content || '';
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed?.keywords ?? parsed?.words ?? Object.values(parsed || {})[0]);
    const keywords = Array.isArray(arr) ? arr.filter(k => typeof k === 'string' && k.trim()).slice(0, 6) : [];
    if (keywords.length) queryCache.set(cacheKey, { keywords, time: Date.now() });
    return keywords;
  } catch {
    return [];
  }
}
