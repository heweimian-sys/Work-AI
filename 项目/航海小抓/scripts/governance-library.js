/**
 * scripts/governance-library.js
 *
 * One-shot knowledge base governance:
 * - Mark obvious low-value records as pending review.
 * - Fill missing "resource shell" fields for searchable useful records.
 * - Rename generic file names when the summary is good enough.
 *
 * Safe by default: no deletion.
 */

import 'dotenv/config';
import { client, log } from '../lib/feishu.js';
import { syncFieldMapping, update } from '../lib/bitable.js';
import { assessResourceRelevance } from '../tools/relevance.js';

const APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.BITABLE_TABLE_ID;

const GENERIC_NAME_RE = /^(图\.png|图片|云空间文件|飞书云空间文件|飞书链接|历史文件_|富文本图片_|合并转发消息_)/i;
const NOISE_RE = /退款|退费|付款|报名|报名进来|进群|入群|权限|编号|客服|谢谢|收到|辛苦|麻烦看|帮忙看|退群|发票|保证金|返还/;
const RESOURCE_RE = /资料|文档|课件|PPT|教程|指南|手册|SOP|案例|复盘|直播|纪要|课程|分享|方法|步骤|流程|AI|小红书|电商|短视频|私域|航海|高手领航|工具|项目/;

function text(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (value && typeof value === 'object') return [value.text, value.link].filter(Boolean).join(' ');
  return String(value || '').trim();
}

function empty(value) {
  return !text(value);
}

function appendReason(oldReason, line) {
  const oldText = text(oldReason);
  if (oldText.includes(line)) return oldText;
  return [oldText, line].filter(Boolean).join('\n');
}

async function listAllRecords() {
  const records = [];
  let pageToken;
  for (let i = 0; i < 50; i++) {
    const params = { page_size: 500 };
    if (pageToken) params.page_token = pageToken;
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: APP_TOKEN, table_id: TABLE_ID },
      params,
    });
    if (resp.code !== 0) throw new Error(`读取多维表失败 code=${resp.code} msg=${resp.msg}`);
    records.push(...(resp.data?.items || []));
    if (!resp.data?.has_more || !resp.data?.page_token) break;
    pageToken = resp.data.page_token;
  }
  return records;
}

function inferTags(source) {
  const tags = [];
  const rules = [
    ['AI', /AI|人工智能|大模型|Claude|ChatGPT|提示词|知识库|编程/i],
    ['小红书', /小红书|红书/i],
    ['电商', /电商|带货|店铺|选品|跨境/i],
    ['短视频', /短视频|视频号|抖音|B站|B 站|短剧|微电影/i],
    ['私域', /私域|社群|微信|朋友圈/i],
    ['直播', /直播|回放|纪要/i],
    ['案例', /案例|拆解|复盘|实战/i],
    ['教程', /教程|指南|手册|SOP|步骤|流程|方法/i],
  ];
  for (const [tag, re] of rules) {
    if (re.test(source)) tags.push(tag);
  }
  return [...new Set(tags)];
}

function inferType(fields) {
  const source = [fields['文件名'], fields['一句话摘要'], fields['核心观点'], fields['主题标签']].map(text).join('\n');
  const name = text(fields['文件名']);
  if (/\.pptx?$|PPT|幻灯片/i.test(name)) return 'PPT/幻灯片';
  if (/直播|纪要|回放/.test(source)) return '直播纪要';
  if (/案例|拆解|复盘/.test(source)) return '案例拆解';
  if (/手册|SOP|教程|指南|步骤|流程|方法/.test(source)) return '教程指南';
  if (/项目|变现|收入|商业/.test(source)) return '项目库案例';
  if (/产品|工具|浏览器|服务/.test(source)) return '产品介绍';
  return '资料线索';
}

function inferAudience(source) {
  const audience = ['客服'];
  if (/新手|入门|从零|普通人/.test(source)) audience.push('新手');
  if (/运营|小红书|抖音|视频号|私域|社群/.test(source)) audience.push('运营');
  if (/电商|店铺|选品|跨境/.test(source)) audience.push('电商');
  if (/AI|编程|自动化|大模型|提示词/.test(source)) audience.push('AI工具使用者');
  return [...new Set(audience)];
}

function inferProblem(fields) {
  const name = text(fields['文件名']) || '这份资料';
  const type = text(fields['内容类型']);
  if (/教程|指南|手册|SOP/.test(type)) return `帮助用户按步骤学习和执行「${name}」相关方法。`;
  if (/案例|项目/.test(type)) return `帮助客服/运营判断「${name}」的适用场景、变现路径和可推荐人群。`;
  if (/直播|纪要/.test(type)) return `沉淀「${name}」中的关键观点、方法和可复用经验。`;
  if (/PPT|幻灯片/.test(type)) return `提供「${name}」对应活动或课程的可转发课件资料。`;
  return `帮助客服/运营快速理解「${name}」是什么、适合谁、能解决什么问题。`;
}

function inferCorePoints(fields) {
  const summary = text(fields['一句话摘要']);
  const name = text(fields['文件名']);
  const tags = text(fields['主题标签']);
  const points = [];
  if (summary) points.push(summary);
  if (tags) points.push(`关键词：${tags}`);
  points.push(`可用于检索和判断「${name || '该资料'}」是否适合推荐给用户。`);
  return points.filter(Boolean).slice(0, 3).join('\n');
}

function makeReadableName(fields) {
  const oldName = text(fields['文件名']);
  if (!GENERIC_NAME_RE.test(oldName)) return '';
  const summary = text(fields['一句话摘要']);
  if (summary.length < 12) return '';
  const source = [summary, fields['主题标签'], fields['内容类型']].map(text).join(' ');
  const tags = inferTags(source).slice(0, 3);
  if (!tags.length) return '';
  return `${tags.join('·')}资料线索`;
}

function shouldMarkPending(fields) {
  const name = text(fields['文件名']);
  const type = text(fields['内容类型']);
  const all = JSON.stringify(fields);
  const confidence = Number(fields['AI置信度'] || 0);
  const relevance = assessResourceRelevance(fields);
  const hasResourceSignal = RESOURCE_RE.test(all);
  const hasNoise = NOISE_RE.test(all);

  if (confidence < 0) return '';
  if (type === '群聊记录' && (confidence < 0.65 || hasNoise || /@_user_|辛苦|圈友|报名|进来|过期|回复/.test(all))) {
    return '群聊记录不是资料本体，先标记待审核，避免污染检索';
  }
  if (type === '合并转发' && confidence < 0.65) {
    return '合并转发未展开正文，资料价值不确定';
  }
  if (/^<p>|@_user_|圈友想问|辛苦看|报名了|还未回复/.test(name)) {
    return '文件名来自聊天原文，偏请求/咨询，不是稳定资料标题';
  }
  if (!relevance.keep) return relevance.reason;
  if (type === '群聊记录' && hasNoise && !hasResourceSignal) return '群聊记录偏客服/交易/寒暄，资料价值低';
  if (GENERIC_NAME_RE.test(name) && hasNoise && !hasResourceSignal) return '泛文件名且内容偏客服/交易/寒暄';
  return '';
}

function buildPatch(record) {
  const fields = record.fields || {};
  const patch = {};
  const source = [fields['文件名'], fields['一句话摘要'], fields['核心观点'], fields['解决的问题'], fields['主题标签']].map(text).join('\n');

  const pendingReason = shouldMarkPending(fields);
  if (pendingReason) {
    patch['AI置信度'] = -1;
    patch['归档理由'] = appendReason(fields['归档理由'], `待审核：${pendingReason}`);
    const name = text(fields['文件名']);
    if (name && !name.startsWith('[待审核]')) patch['文件名'] = `[待审核] ${name}`;
    return { patch, action: 'mark_pending', reason: pendingReason };
  }

  const readableName = makeReadableName(fields);
  if (readableName) patch['文件名'] = readableName;

  if (empty(fields['内容类型']) || text(fields['内容类型']) === '其他') patch['内容类型'] = inferType(fields);
  if (empty(fields['主题标签'])) patch['主题标签'] = inferTags(source).join(', ');
  if (empty(fields['解决的问题'])) patch['解决的问题'] = inferProblem({ ...fields, ...patch });
  if (empty(fields['核心观点'])) patch['核心观点'] = inferCorePoints({ ...fields, ...patch });
  if (empty(fields['适合人群'])) patch['适合人群'] = inferAudience(source);
  if (empty(fields['推荐优先级'])) patch['推荐优先级'] = '参考';
  if (empty(fields['文档完整度'])) patch['文档完整度'] = text(fields['核心观点']) ? 6 : 4;

  if (Object.keys(patch).length) {
    patch['归档理由'] = appendReason(fields['归档理由'], '资料库治理：已补充资料壳子/优化可检索字段。');
  }

  return { patch, action: Object.keys(patch).length ? 'enrich' : 'skip', reason: '' };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 200;

  await syncFieldMapping();
  const records = await listAllRecords();

  let marked = 0;
  let enriched = 0;
  let skipped = 0;
  const samples = [];

  for (const record of records.slice(0, limit)) {
    const { patch, action, reason } = buildPatch(record);
    const name = text(record.fields?.['文件名']) || record.record_id;
    if (!Object.keys(patch).length) {
      skipped++;
      continue;
    }

    if (!dryRun) await update(record.record_id, patch);
    if (action === 'mark_pending') marked++;
    else enriched++;
    samples.push(`${dryRun ? '预览' : '已处理'} ${action}: ${name}${reason ? `（${reason}）` : ''}`);
  }

  console.log(JSON.stringify({
    success: true,
    dryRun,
    scanned: Math.min(records.length, limit),
    totalRecords: records.length,
    marked,
    enriched,
    skipped,
    samples: samples.slice(0, 40),
  }, null, 2));
}

main().catch(err => {
  log('err', `资料库治理失败: ${err.message}`);
  process.exit(1);
});
