import 'dotenv/config';
import { createScysMcpClient } from '../lib/mcp_client.js';

const client = createScysMcpClient();
const result = await client.callTool('searchTopic', {
  keyword: process.argv[2] || '小程序',
  displayMode: 1,
  pageIndex: 1,
  pageSize: 2,
});

const text = (result.content || []).map(item => item.text || '').join('\n');
const entityIds = [...text.matchAll(/"entityId"\s*:\s*("?)(\d+)\1/g)].map(match => match[2]);
const detailUrls = [...text.matchAll(/"detailUrl"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
const hrefUrls = [...text.matchAll(/"hrefUrl"\s*:\s*"([^"]+)"/g)].map(match => match[1]);

console.log(JSON.stringify({
  rawLength: text.length,
  entityIds,
  detailUrls,
  hrefUrls,
  preview: text.slice(0, 1200),
}, null, 2));

