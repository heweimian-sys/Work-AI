import 'dotenv/config';
import { client } from '../lib/feishu.js';
import { syncFieldMapping, update } from '../lib/bitable.js';

const appToken = process.env.BITABLE_APP_TOKEN;
const tableId = process.env.BITABLE_TABLE_ID;
const signals = {
  storefront: ['橱窗', '小黄车', '商品链接', '购买链接', '商品卡'],
  advertising: ['广告', '赞助', '品牌合作', '商务合作', '推广'],
  private_domain: ['加微信', '微信', '私域', '社群', '朋友圈', '公众号', '二维码'],
  service: ['咨询', '代做', '定制', '接单', '服务费', '课程', '训练营', '会员', '订阅'],
  affiliate: ['联盟', '分佣', '佣金', '推广链接', 'affiliate'],
};
const words = Object.values(signals).flat();
const hit = (text, list) => list.filter((word) => text.includes(word));
const value = (v) => (v && typeof v === 'object' ? String(v.text || v.link || '') : String(v || '')).trim();

async function listAll() {
  const result = [];
  let page_token;
  do {
    const resp = await client.bitable.appTableRecord.list({
      path: { app_token: appToken, table_id: tableId },
      params: { page_size: 100, page_token },
    });
    if (resp.code !== 0) throw new Error(resp.msg || `读取失败 ${resp.code}`);
    result.push(...(resp.data?.items || []));
    page_token = resp.data?.page_token;
    if (!resp.data?.has_more) break;
  } while (page_token);
  return result;
}

function assess(fields) {
  const text = [fields['标题'], fields['内容摘要'], fields['核心观点'], fields['评论'], fields['原始记录']].map(value).join('\n');
  const process = /流程|步骤|教程|实操|方法|怎么做|全流程|交付|案例/.test(text);
  const entry = /平台|AI|工具|模板|公开|零基础|低成本|代做|接单/.test(text);
  const types = Object.entries(signals).filter(([, list]) => hit(text, list).length).map(([type]) => type);
  const evidence = [...new Set(words.filter((word) => text.includes(word)))];
  const fit = process && entry ? 'possible' : process || entry ? 'needs_review' : 'unknown';
  const barrier = process && entry ? '有明确流程，普通人可尝试复刻' : process ? '有流程但资源/门槛待确认' : entry ? '有工具或平台入口，但缺少完整流程' : '暂未识别清晰复刻路径';
  const advice = types.length && process && entry ? '进入人工审核，重点核对变现证据' : '保留，补采评论区、商品/广告/私域证据后再判断';
  return {
    '复刻判断': fit,
    '复刻门槛': barrier,
    '变现方式': types.join('、') || '未发现明确变现方式',
    '变现证据': evidence.join('、') || '暂无明确证据',
    '筛选建议': advice,
  };
}

await syncFieldMapping();
const records = await listAll();
const stats = { scanned: records.length, updated: 0, failed: 0 };
for (let i = 0; i < records.length; i += 8) {
  const batch = records.slice(i, i + 8);
  const results = await Promise.all(batch.map(async (record) => {
    try {
      await update(record.record_id, assess(record.fields || {}));
      return { ok: true };
    } catch (error) {
      console.warn(`回填失败 ${record.record_id}: ${error.message}`);
      return { ok: false };
    }
  }));
  stats.updated += results.filter((item) => item.ok).length;
  stats.failed += results.filter((item) => !item.ok).length;
}
console.log(JSON.stringify(stats, null, 2));
