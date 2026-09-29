import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const inboxDir = resolve(projectRoot, 'collector_mvp/inbox');
const apiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
const limit = Number(process.env.JEV_LIMIT || 20);

if (!apiKey) {
  console.error('缺少 TYPESAFE_API_KEY。请先设置 JEV API Key，再运行 npm run collector:jev。');
  process.exit(2);
}

const files = (await readdir(inboxDir)).filter((name) => name.endsWith('.json')).slice(0, limit);
if (!files.length) {
  console.log('收件箱里还没有 JSON 记录。');
  process.exit(0);
}

const questions = {
  high_potential: { type: 'noul', instructions: '这条内容是否值得进入项目库重点人工核验？必须同时考虑是否存在具体动作/交付、付费方或收入路径线索；纯热点、纯工具介绍、只有互动量不能算高潜。', criteria: { true: '有明确可研究的项目或商业机会线索', false: '只是趋势、教程、工具资讯或证据不足' } },
  ordinary_person_fit: { type: 'choice', instructions: '普通人是否能在没有现成工厂、牌照、门店、供应链或特殊关系的情况下开始？', criteria: { yes: '可依托公开平台、AI/软件、模板或可复制服务开始', no: '明显依赖特殊资源、牌照、重资产或既有关系', unknown: '来源不足，无法判断' } },
  triage: { type: 'choice', instructions: '这条内容当前应该如何分流？', criteria: { new_opportunity: '有独立供给/付费方/变现路径线索，值得作为新机会研究', existing_opportunity_case: '更像已有项目的新案例或新平台证据', signal_observation: '有信号但商业链路不完整，暂不立项', excluded: '纯趋势、纯教程、纯工具资讯或明显不可复制' } },
  has_payer_and_money_path: { type: 'noul', instructions: '来源是否同时提供了足够线索，让人能回答谁付费以及钱通过什么路径进入？不要把点赞、播放或作者自称收入当成完整证据。' }
};

for (const file of files) {
  const path = resolve(inboxDir, file);
  const record = JSON.parse(await readFile(path, 'utf8'));
  const state = { platform: record.platform, title: record.title, author: record.author_name, url: record.content_url, text: record.text, detail: record.detail, comments: record.comments, metrics: record.metrics };
  const response = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', state, questions }) });
  if (!response.ok) throw new Error(`Jev 请求失败 ${response.status}: ${await response.text()}`);
  const result = await response.json();
  record.ai_analysis = { ...(record.ai_analysis || {}), model: result.model || 'jev-latest', raw_judgment: result.answers, high_potential_probability: result.answers?.high_potential?.noul ?? null, ordinary_person_fit: result.answers?.ordinary_person_fit?.choice || 'unknown', triage: result.answers?.triage?.choice || 'unknown', facts: record.ai_analysis?.facts || [], inferences: record.ai_analysis?.inferences || [], unknowns: record.ai_analysis?.unknowns || [] };
  record.ai_score = Math.round((record.ai_analysis.high_potential_probability || 0) * 100);
  record.project_relevance = record.ai_score >= 70 ? 'high' : record.ai_score >= 40 ? 'medium' : 'low';
  await writeFile(path, JSON.stringify(record, null, 2) + '\n');
  console.log(`已分析 ${file}: ${record.ai_score} 分, ${record.ai_analysis.triage}`);
}
