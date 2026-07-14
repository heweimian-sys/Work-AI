import 'dotenv/config';
import { syncFieldMapping } from '../lib/bitable.js';
import { syncScysMcpMaterials } from '../tools/mcp_sync.js';

await syncFieldMapping();

const query = process.argv[2] || '小程序';
const limit = Number(process.argv[3] || 1);

const result = await syncScysMcpMaterials({
  toolName: 'searchTopic',
  query,
  limit,
});

console.log(JSON.stringify({
  success: result.success,
  tool: result.tool,
  total: result.total,
  created: result.created,
  updated: result.updated,
  skippedDuplicate: result.skippedDuplicate,
  skippedLowValue: result.skippedLowValue,
  failed: result.failed,
  samples: result.samples,
}, null, 2));
