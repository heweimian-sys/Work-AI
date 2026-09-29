/**
 * 项目库机会模式：Raw → Radar Signal → Opportunity Lead。
 * 只做本地确定性筛选，不把关键词命中当成收入事实。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inbox = path.join(root, 'inbox');
const exportsDir = path.join(root, 'exports');
const now = new Date().toISOString();

const groups = {
  result_based: ['出单', '订单', '成交', '收入', '佣金', 'GMV', '已售', '利润', '结算', '到账'],
  platform_mechanism: ['官方活动', '招募', '激励', '奖励', '扶持', '分成', '内测', '新功能'],
  demand_based: ['求代做', '求推荐', '有偿', '报价', '咨询', '定制', '找人做', '需求', '多少钱', '收费'],
  supply_based: ['接单', '服务', '代做', '模板', '资料包', '课程', '自动化', 'AI服务', 'Agent', 'Skill'],
  ecosystem_change: ['平台规则', '新政策', '流量入口', '创作者计划', '生态']
};

const hit = (text, words) => words.filter((word) => text.includes(word));
const textOf = (record) => [record.title, record.text, record.detail?.body, record.comments?.map((item) => item.text).join(' ')].filter(Boolean).join('\n');
const sourceUrl = (record) => record.content_url || null;

async function readRecords() {
  const files = (await fs.readdir(inbox)).filter((file) => file.endsWith('.json'));
  const records = [];
  for (const file of files) {
    const value = JSON.parse(await fs.readFile(path.join(inbox, file), 'utf8'));
    if (Array.isArray(value)) records.push(...value);
    else records.push(value);
  }
  return [...new Map(records.map((record) => [record.dedupe_key || record.content_url || record.record_id, record])).values()];
}

function triage(record) {
  const text = textOf(record);
  const matches = Object.fromEntries(Object.entries(groups).map(([name, words]) => [name, hit(text, words)]));
  const commercial = [...matches.result_based, ...matches.demand_based, ...matches.supply_based];
  const hasAction = matches.supply_based.length > 0 || matches.demand_based.length > 0;
  const hasPayerSignal = matches.demand_based.length > 0 || matches.result_based.length > 0;
  const hasMoneyPath = matches.result_based.length > 0 || /卖|收费|付款|购买|订阅|佣金|广告|服务费/.test(text);
  const hasProcess = /流程|步骤|教程|实操|方法|怎么做|全流程|交付/.test(text);
  const hasOrdinaryEntry = /平台|AI|工具|模板|公开|零基础|低成本|代做|接单/.test(text);
  const facts = [
    {statement: `来源平台为 ${record.platform || 'unknown'}`, source_url: sourceUrl(record), source_id: record.record_id || record.content_id},
    {statement: `内容标题为：${record.title || '未提供'}`, source_url: sourceUrl(record), source_id: record.record_id || record.content_id},
    ...commercial.slice(0, 12).map((word) => ({statement: `原文出现商业相关词：${word}`, source_url: sourceUrl(record), source_id: record.record_id || record.content_id, evidence_type: 'keyword_signal'}))
  ];
  const unknowns = [];
  if (!record.author_name) unknowns.push({question: '作者身份和持续经营方向是什么？', next_possible_action: '打开作者主页并采集近期内容'});
  if (!hasPayerSignal) unknowns.push({question: '谁是付费方？', next_possible_action: '采集评论、商品页或服务入口'});
  if (!hasMoneyPath) unknowns.push({question: '钱通过什么路径进入？', next_possible_action: '采集商品、服务页、私域入口或平台分成规则'});
  if (!hasProcess) unknowns.push({question: '普通人具体如何交付？', next_possible_action: '采集详情、评论和作者历史内容'});
  const completeQuestions = hasAction && hasPayerSignal && hasMoneyPath;
  let triageStatus = 'signal_observation';
  let reason = '存在内容或商业信号，但三问未完整支持。';
  if (!commercial.length && !matches.platform_mechanism.length && !matches.ecosystem_change.length) {
    triageStatus = 'excluded';
    reason = '未发现可研究的供给、需求、平台机制或商业信号。';
  } else if (completeQuestions && hasOrdinaryEntry && hasProcess) {
    triageStatus = 'new_opportunity';
    reason = '已有具体动作、潜在付费方和收入路径信号，可进入 Research；收入仍需独立验证。';
  }
  return {
    opportunity_id: `opp-${record.record_id || record.content_id || Date.now()}`,
    source_ids: [record.record_id || record.content_id].filter(Boolean),
    source_urls: [sourceUrl(record)].filter(Boolean),
    platform: record.platform || 'unknown',
    title: record.title || '未命名机会信号',
    signal_types: Object.entries(matches).filter(([, values]) => values.length).map(([name]) => name),
    signal_terms: matches,
    three_questions: {
      what_to_do: hasAction ? '有供给、服务或需求动作信号' : 'unknown',
      payer: hasPayerSignal ? '出现需求方或结果/收入信号' : 'unknown',
      money_path: hasMoneyPath ? '出现成交、收费、佣金或收入路径信号' : 'unknown'
    },
    ordinary_person_fit: hasOrdinaryEntry ? 'possible_pending_validation' : 'unknown',
    current_stage: triageStatus === 'new_opportunity' ? 'research_queued' : 'radar_signal',
    triage: triageStatus,
    reason,
    facts,
    inferences: [{statement: completeQuestions ? '内容具备进入定向研究的商业线索' : '内容可能与机会有关，但不能仅凭本条升级为项目', based_on_source_ids: [record.record_id || record.content_id].filter(Boolean), status: 'hypothesis'}],
    unknowns,
    evidence: [{source_id: record.record_id || record.content_id, source_url: sourceUrl(record), raw_json_path: `inbox/${record.record_id || record.content_id}.json`, direct_or_inferred: 'direct'}],
    material_gaps: unknowns.map((item) => item.question),
    research_ready: false,
    income_verified: false,
    collected_at: record.collected_at || null,
    generated_at: now
  };
}

const records = await readRecords();
const leads = records.map(triage);
await fs.mkdir(exportsDir, {recursive: true});
await fs.writeFile(path.join(exportsDir, 'opportunity-radar.json'), JSON.stringify({generated_at: now, input_count: records.length, leads}, null, 2));
const summary = leads.reduce((result, lead) => { result[lead.triage] = (result[lead.triage] || 0) + 1; return result; }, {});
console.log(JSON.stringify({input_count: records.length, summary, output: 'exports/opportunity-radar.json'}, null, 2));
