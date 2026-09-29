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
const monetizationSignals = {
  storefront: ['橱窗', '小黄车', '商品链接', '购买链接', '商品卡'],
  advertising: ['广告', '赞助', '品牌合作', '商务合作', '推广'],
  private_domain: ['加微信', '微信', '私域', '社群', '朋友圈', '公众号', '二维码'],
  service: ['咨询', '代做', '定制', '接单', '服务费', '课程', '训练营', '会员', '订阅'],
  affiliate: ['联盟', '分佣', '佣金', '推广链接', 'affiliate']
};

const hit = (text, words) => words.filter((word) => text.includes(word));
const textOf = (record) => [record.title, record.text, record.detail?.body, record.comments?.map((item) => item.text).join(' ')].filter(Boolean).join('\n');
const sourceUrl = (record) => record.content_url || null;
const tokens = (text) => {
  const normalized = String(text || '').toLowerCase().replace(/[^\u4e00-\u9fff\w]+/g, ' ');
  const parts = normalized.split(/\s+/).filter(Boolean);
  const grams = [];
  for (const part of parts) {
    if (/^[\u4e00-\u9fff]+$/.test(part)) for (let i = 0; i < part.length - 1; i += 1) grams.push(part.slice(i, i + 2));
    else grams.push(part);
  }
  return new Set(grams);
};
const similarity = (left, right) => {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
};

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
  const monetizationEvidence = Object.fromEntries(Object.entries(monetizationSignals).map(([type, words]) => [type, hit(text, words)]));
  const monetizationTypes = Object.entries(monetizationEvidence).filter(([, words]) => words.length).map(([type]) => type);
  const hasMonetizationEvidence = monetizationTypes.length > 0;
  const reproducibility = hasProcess && hasOrdinaryEntry ? 'possible' : hasProcess || hasOrdinaryEntry ? 'needs_review' : 'unknown';
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
  const completeQuestions = hasAction && hasPayerSignal && hasMoneyPath && hasMonetizationEvidence;
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
      money_path: hasMoneyPath ? '出现成交、收费、佣金或收入路径信号' : 'unknown',
      monetization_evidence: hasMonetizationEvidence ? `发现变现线索：${monetizationTypes.join('、')}` : '未发现橱窗、广告、服务或私域证据'
    },
    ordinary_person_fit: reproducibility,
    monetization_evidence: { types: monetizationTypes, terms: monetizationEvidence, verified: false },
    screening_action: completeQuestions ? '进入人工审核' : '先保留，补采评论区、商品/广告/私域证据后再判断',
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

function clusterLeads(leads) {
  const clusters = [];
  for (const lead of leads) {
    const candidate = clusters.find((cluster) => {
      const sameSignal = lead.signal_types.some((type) => cluster.signal_types.includes(type));
      return sameSignal && similarity(lead.title, cluster.title) >= 0.22;
    });
    if (candidate) {
      candidate.lead_ids.push(lead.opportunity_id);
      candidate.source_ids.push(...lead.source_ids);
      candidate.source_urls.push(...lead.source_urls);
      candidate.platforms.push(lead.platform);
      candidate.signal_types = [...new Set([...candidate.signal_types, ...lead.signal_types])];
    } else {
      clusters.push({cluster_id: `cluster-${clusters.length + 1}`, title: lead.title, lead_ids: [lead.opportunity_id], source_ids: [...lead.source_ids], source_urls: [...lead.source_urls], platforms: [lead.platform], signal_types: [...lead.signal_types]});
    }
  }
  return clusters.map((cluster) => ({...cluster, source_ids: [...new Set(cluster.source_ids)], source_urls: [...new Set(cluster.source_urls)], platforms: [...new Set(cluster.platforms)], independent_source_count: new Set(cluster.source_ids).size}));
}

const records = await readRecords();
const leads = records.map(triage);
const clusters = clusterLeads(leads);
for (const lead of leads) {
  const cluster = clusters.find((item) => item.lead_ids.includes(lead.opportunity_id));
  lead.cluster_id = cluster.cluster_id;
  lead.independent_source_count = cluster.independent_source_count;
  lead.priority_score = Math.min(100, (lead.triage === 'new_opportunity' ? 45 : lead.triage === 'signal_observation' ? 20 : 0) + Math.min(25, lead.signal_types.length * 5) + Math.min(20, cluster.independent_source_count * 10) + (lead.ordinary_person_fit === 'possible_pending_validation' ? 10 : 0));
  lead.priority_reason = cluster.independent_source_count > 1 ? '多个独立来源或记录聚合，优先复核。' : '当前只有单一来源，不能作为趋势或收入证明。';
}
leads.sort((a, b) => b.priority_score - a.priority_score);
await fs.mkdir(exportsDir, {recursive: true});
await fs.writeFile(path.join(exportsDir, 'opportunity-radar.json'), JSON.stringify({generated_at: now, input_count: records.length, cluster_count: clusters.length, clusters, leads}, null, 2));
await fs.writeFile(path.join(exportsDir, 'opportunity-daily.md'), [
  '# 项目机会日报', '', `生成时间：${now}`, `输入记录：${records.length}`, `机会簇：${clusters.length}`, '',
  ...leads.slice(0, 20).map((lead, index) => `## ${index + 1}. ${lead.title}\n- 分流：${lead.triage}\n- 优先级：${lead.priority_score}\n- 三问：做什么=${lead.three_questions.what_to_do}；谁付费=${lead.three_questions.payer}；钱怎么进=${lead.three_questions.money_path}\n- 来源：${lead.source_urls.join('、') || '未提供'}\n- 下一步：${lead.unknowns.map((item) => item.next_possible_action).join('；') || '进入定向 Research'}`)
].join('\n\n'));
const summary = leads.reduce((result, lead) => { result[lead.triage] = (result[lead.triage] || 0) + 1; return result; }, {});
console.log(JSON.stringify({input_count: records.length, cluster_count: clusters.length, summary, outputs: ['exports/opportunity-radar.json', 'exports/opportunity-daily.md']}, null, 2));
