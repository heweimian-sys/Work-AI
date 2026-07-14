import 'dotenv/config';

function normalizeDomain(domain = '') {
  return String(domain || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function getLibraryLinks() {
  const links = [];
  const webUrl = String(process.env.LIBRARY_WEB_URL || '').trim();
  if (webUrl) links.push({ label: '网页资料库', url: webUrl });

  const appToken = String(process.env.BITABLE_APP_TOKEN || '').trim();
  if (appToken) {
    const domain = normalizeDomain(process.env.FEISHU_DOMAIN || 'bytedance.feishu.cn');
    const tableId = String(process.env.BITABLE_TABLE_ID || '').trim();
    const tableQuery = tableId ? `?table=${encodeURIComponent(tableId)}` : '';
    links.push({ label: '多维表格资料库', url: `https://${domain}/base/${appToken}${tableQuery}` });
  }

  return links;
}

export function appendLibraryFooter(text = '') {
  const base = String(text || '').trimEnd();
  if (process.env.REPLY_LIBRARY_FOOTER_ENABLED === 'false') return base;
  if (/多维表格资料库|网页资料库|全部资料/.test(base)) return base;

  const links = getLibraryLinks();
  if (!links.length) return base;

  return [
    base,
    '',
    '📎 资料库入口：',
    ...links.map(link => `${link.label}：${link.url}`),
  ].filter(Boolean).join('\n');
}
