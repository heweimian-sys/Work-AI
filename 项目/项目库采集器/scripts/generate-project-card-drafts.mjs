import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const inbox = path.join(root, 'inbox');
const out = path.join(root, 'exports', '待审核项目卡.json');

const textOf = (r) => [r.title, r.text, r.transcript, r.ocr_text].filter(Boolean).join(' ');
const hasAny = (text, words) => words.filter((w) => text.includes(w));
const safe = (s, n = 500) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

const files = (await fs.readdir(inbox)).filter((f) => f.endsWith('.json') && f !== 'sample-record.json');
const records = [];
for (const file of files) records.push(JSON.parse(await fs.readFile(path.join(inbox, file), 'utf8')));

const cards = records.map((record) => {
  const text = textOf(record);
  const commercial = hasAny(text, ['带货', '佣金', 'CPS', '联盟', '接单', '服务费', '课程', '会员', '订阅', '资料包', '代做', '撮合', '广告', '获客', '线索']);
  const result = hasAny(text, ['收入', '赚', '成交', '订单', '客户', '案例', '时薪', '美元', 'GMV', '利润', '佣金']);
  const process = hasAny(text, ['教程', '流程', '步骤', '实操', '全流程', '保姆级', '怎么做', '方法']);
  const score = Math.min(100, commercial.length * 18 + result.length * 12 + process.length * 10 + (record.project_relevance === 'high' ? 15 : record.project_relevance === 'medium' ? 8 : 0));
  const relevance = score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';
  const name = safe(record.title || '未命名采集内容', 80);
  return {
    name,
    externalId: `collector-${record.record_id}`,
    incomeMin: 0,
    incomeMax: 0,
    highlightText: `${record.platform || '未知平台'}|${commercial.join('、') || '待判断'}|待验证`,
    summary: safe(record.text || record.title, 300),
    images: [],
    description: `<p>来源平台：${record.platform || 'unknown'}</p><p>原始标题：${safe(record.title, 500)}</p><p>当前仅为采集初筛草稿，不能视为已验证项目。</p>`,
    content: [
      { key: 'worth_reason', order: 1, value: `初筛命中：${commercial.join('、') || '暂无明确商业信号'}；结果信号：${result.join('、') || '暂无'}；流程信号：${process.join('、') || '暂无'}。` },
      { key: 'revenue_model', order: 2, value: '待从原文和作者主页进一步核验，不把内容中的报价或累计金额直接当作收入。' },
      { key: 'income_estimate', order: 3, value: '暂无可验证收入数据，当前保留为 0—0，仅代表未核验。' },
      { key: 'action_guide', order: 4, value: '核验作者身份、最近内容持续性、商业入口、真实结果和普通人可复制步骤。' }
    ],
    cases: [],
    resources: [{ type: 'external_content', order: 1, title: safe(record.title, 200), author: record.author_name || '', platform: record.platform || '', url: record.content_url || '' }],
    platformMenuIds: [],
    monetizeMenuIds: [],
    crowdMenuIds: [],
    isPublished: false,
    isShow: false,
    review_status: 'pending',
    source_record_id: record.record_id,
    source_url: record.content_url,
    source_platform: record.platform,
    ai_score: score,
    project_relevance: relevance,
    evidence_level: record.evidence_level || 'L1',
    screening_signals: { commercial, result, process }
  };
});

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(cards, null, 2));
console.log(`已生成 ${cards.length} 张待审核项目卡：${out}`);
