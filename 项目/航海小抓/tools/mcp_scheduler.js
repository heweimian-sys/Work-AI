/**
 * tools/mcp_scheduler.js - Background MCP sync for the Feishu bot.
 *
 * Keeps external Shengcai MCP materials flowing into the same Bitable index
 * without requiring a chat command every time.
 */

import 'dotenv/config';
import { log } from '../lib/feishu.js';
import { syncScysMcpMaterials } from './mcp_sync.js';

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_STARTUP_DELAY_SECONDS = 90;
const MIN_INTERVAL_MINUTES = 15;

let timer = null;
let startupTimer = null;
let running = false;

function boolEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function numberEnv(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

export function isMcpAutoSyncEnabled() {
  return boolEnv('SCYS_MCP_AUTO_SYNC_ENABLED', false);
}

export async function runMcpAutoSyncOnce(reason = 'manual') {
  if (running) {
    log('info', `MCP 自动同步跳过：上一轮仍在运行 reason=${reason}`);
    return { success: false, skipped: true, reason: 'already_running' };
  }

  if (!process.env.SCYS_MCP_TOKEN) {
    log('warn', 'MCP 自动同步未启动：SCYS_MCP_TOKEN 未配置');
    return { success: false, skipped: true, reason: 'missing_token' };
  }

  running = true;
  try {
    const result = await syncScysMcpMaterials({
      limit: numberEnv('SCYS_MCP_AUTO_SYNC_LIMIT', 20),
      perQueryLimit: numberEnv('SCYS_MCP_PER_QUERY_LIMIT', 5),
      dryRun: boolEnv('SCYS_MCP_AUTO_SYNC_DRY_RUN', false),
    });

    if (result.success) {
      log('ok', `MCP 自动同步完成 reason=${reason} total=${result.total || 0} created=${result.created || 0} updated=${result.updated || 0} skipped=${result.skippedDuplicate || 0} lowValue=${result.skippedLowValue || 0} failed=${result.failed || 0}`);
    } else {
      log('warn', `MCP 自动同步未完成 reason=${reason}: ${result.error || result.replyText || 'unknown'}`);
    }
    return result;
  } catch (err) {
    log('err', `MCP 自动同步失败 reason=${reason}: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    running = false;
  }
}

export function startMcpAutoSync() {
  if (!isMcpAutoSyncEnabled()) {
    log('info', 'MCP 自动同步未开启。设置 SCYS_MCP_AUTO_SYNC_ENABLED=true 后启用。');
    return;
  }

  if (timer || startupTimer) return;

  const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, numberEnv('SCYS_MCP_AUTO_SYNC_INTERVAL_MINUTES', DEFAULT_INTERVAL_MINUTES));
  const startupDelaySeconds = numberEnv('SCYS_MCP_AUTO_SYNC_STARTUP_DELAY_SECONDS', DEFAULT_STARTUP_DELAY_SECONDS);

  startupTimer = setTimeout(() => {
    startupTimer = null;
    runMcpAutoSyncOnce('startup').catch(err => log('err', `MCP startup sync error: ${err.message}`));
  }, startupDelaySeconds * 1000);
  startupTimer.unref?.();

  timer = setInterval(() => {
    runMcpAutoSyncOnce('interval').catch(err => log('err', `MCP interval sync error: ${err.message}`));
  }, intervalMinutes * 60 * 1000);
  timer.unref?.();

  log('ok', `MCP 自动同步已开启：启动后 ${startupDelaySeconds}s 首次同步，之后每 ${intervalMinutes} 分钟同步一次`);
}
