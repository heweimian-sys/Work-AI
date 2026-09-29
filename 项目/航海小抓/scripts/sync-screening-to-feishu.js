import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { client } from '../lib/feishu.js';
import { syncFieldMapping, update } from '../lib/bitable.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;
const radarPath = path.resolve('../项目库采集器/exports/opportunity-radar.json');

function text(value) {
  return String(value ?? '').trim();
}

function fieldText(value) {
  if (value && typeof value === 'object') return text(value.text || value.link || '');
  return text(value);
}

async function listAllRecords() {
  const records = [];
  let pageToken;
  do {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: appToken, table_id: tableId },
      params: { page_size: 100, page_token: pageToken },
    });
    if (resp.code !== 0) throw new Error(`飞书记录读取失败: ${resp.msg || resp.code}`);
    records.push(...(resp.data?.items || []));
    pageToken = resp.data?.page_token;
    if (!resp.data?.has_more) break;
  } while (pageToken);
  return records;
}

function rawRecordId(fields) {
  try {
    const raw = JSON.parse(fieldText(fields['原始记录']) || '{}');
    return text(raw.record_id);
  } catch {
    return '';
  }
}

const radar = JSON.parse(await fs.readFile(radarPath, 'utf8'));
const leads = radar.leads || [];
await syncFieldMapping();
const feishuRecords = await listAllRecords();
const byKey = new Map();
for (const item of feishuRecords) {
  const fields = item.fields || {};
  const keys = [
    rawRecordId(fields),
    fieldText(fields['内容ID']),
    fieldText(fields['原文链接']),
    fieldText(fields['内容指纹']),
  ].filter(Boolean);
  for (const key of keys) byKey.set(key, item);
}

const stats = { scanned: leads.length, matched: 0, updated: 0, skipped: 0, failed: 0, unmatched: [] };
for (const lead of leads) {
  const keys = [
    ...(lead.source_ids || []),
    ...(lead.source_urls || []),
    lead.content_fingerprint,
  ].filter(Boolean).map(text);
  const record = keys.map((key) => byKey.get(key)).find(Boolean);
  if (!record) {
    stats.unmatched.push({ opportunity_id: lead.opportunity_id, title: lead.title, keys });
    continue;
  }
  stats.matched++;
  const evidenceTypes = lead.monetization_evidence?.types || [];
  const evidenceTerms = Object.values(lead.monetization_evidence?.terms || {}).flat();
  const patch = {
    '复刻判断': lead.ordinary_person_fit || 'unknown',
    '复刻门槛': lead.three_questions?.what_to_do || 'unknown',
    '变现方式': evidenceTypes.join('、') || '未发现明确变现方式',
    '变现证据': evidenceTerms.join('、') || lead.three_questions?.monetization_evidence || '暂无证据',
    '筛选建议': lead.screening_action || lead.reason || '保留待审核',
  };
  try {
    await update(record.record_id, patch);
    stats.updated++;
  } catch (error) {
    stats.failed++;
    stats.unmatched.push({ opportunity_id: lead.opportunity_id, title: lead.title, error: error.message });
  }
}

console.log(JSON.stringify(stats, null, 2));
