import 'dotenv/config';
import { syncScysMcpMaterials } from '../tools/mcp_sync.js';

const result = await syncScysMcpMaterials({
  toolName: 'searchTopic',
  query: process.argv[2] || '小程序',
  limit: 2,
  dryRun: true,
});

console.log(JSON.stringify({
  success: result.success,
  tool: result.tool,
  args: result.args,
  total: result.total,
  samples: result.samples,
  replyText: result.replyText,
}, null, 2));

