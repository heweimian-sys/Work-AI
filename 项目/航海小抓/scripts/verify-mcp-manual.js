/**
 * Verify Shengcai MCP manual-chain availability.
 *
 * Checks:
 * - MCP token can connect.
 * - Required tools exist: activityList, activityManualToc, activityManualDetail.
 * - A small dry-run can read manual chapter details without writing Bitable.
 */

import 'dotenv/config';
import { createScysMcpClient } from '../lib/mcp_client.js';
import { syncScysMcpMaterials } from '../tools/mcp_sync.js';

const REQUIRED_TOOLS = ['activityList', 'activityManualToc', 'activityManualDetail'];

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const activityLimit = numberArg('activityLimit', 1);
  const chapterLimit = numberArg('chapterLimit', 3);
  const limit = numberArg('limit', 3);
  const client = createScysMcpClient();

  if (!client.enabled) {
    printJson({
      success: false,
      stage: 'config',
      error: 'SCYS_MCP_TOKEN 未配置',
      nextStep: '在 .env 中配置 SCYS_MCP_TOKEN 后重试。',
    });
    process.exit(1);
  }

  const tools = await client.listTools();
  const toolNames = tools.map(tool => tool.name);
  const missing = REQUIRED_TOOLS.filter(name => !toolNames.includes(name));
  if (missing.length) {
    printJson({
      success: false,
      stage: 'tools',
      missing,
      available: toolNames,
      nextStep: '确认生财 MCP 密钥权限已包含航海手册工具，或稍后重试。',
    });
    process.exit(1);
  }

  const result = await syncScysMcpMaterials({
    mode: 'manual_chapters',
    dryRun: true,
    activityLimit,
    chapterLimit,
    limit,
  });

  printJson({
    success: result.success === true && (result.total || 0) > 0,
    stage: 'dryRun',
    requiredTools: REQUIRED_TOOLS,
    total: result.total || 0,
    createdPreview: result.created || 0,
    failed: result.failed || 0,
    samples: (result.samples || []).slice(0, 10),
    replyText: result.replyText || '',
  });

  process.exit(result.success === true && (result.total || 0) > 0 ? 0 : 1);
}

main().catch(err => {
  printJson({
    success: false,
    stage: 'exception',
    error: err.message,
  });
  process.exit(1);
});
