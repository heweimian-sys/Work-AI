import 'dotenv/config';
import { createScysMcpClient } from '../lib/mcp_client.js';

const client = createScysMcpClient();
const entityType = process.argv[2] || 'xq_topic';
const entityId = process.argv[3] || '82811454228182222';
const result = await client.callTool('topicDetail', { entityType, entityId });
const text = (result.content || []).map(item => item.text || '').join('\n');

console.log(JSON.stringify({
  rawLength: text.length,
  isNull: text.trim() === 'null',
  detailUrls: [...text.matchAll(/"detailUrl"\s*:\s*"([^"]+)"/g)].map(match => match[1]),
  imageCount: [...text.matchAll(/https?:\/\/[^"]+/g)].length,
  preview: text.slice(0, 1200),
}, null, 2));

