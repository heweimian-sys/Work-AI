/**
 * memory/chat.js — 群属性记忆
 *
 * Phase 1：单群混合模式。
 * 当前客服与运营共用一个群，群内同时处理归档和查询。
 * 后续若拆分为多群，可再扩展群类型配置。
 */

import 'dotenv/config';
import { log } from '../lib/feishu.js';

const MONITORED_CHAT_ID_LIST = (process.env.MONITORED_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const MONITORED_CHAT_IDS = new Set(MONITORED_CHAT_ID_LIST);

/**
 * 判断某个群是否被机器人监听
 * @param {string} chatId
 * @returns {boolean}
 */
export function isMonitoredChat(chatId) {
  // 未配置时默认监听所有群（便于本地测试）
  if (MONITORED_CHAT_IDS.size === 0) {
    log('info', `isMonitoredChat(${chatId}) → true (默认监听所有群)`);
    return true;
  }
  const result = MONITORED_CHAT_IDS.has(chatId);
  log('info', `isMonitoredChat(${chatId}) → ${result}`);
  return result;
}

export function getMonitoredChatIds() {
  return [...MONITORED_CHAT_ID_LIST];
}

export function getDefaultMonitoredChatId() {
  return MONITORED_CHAT_ID_LIST[0] || '';
}

/**
 * 获取群类型
 * 当前只返回 'mixed'（混合群：归档+查询）
 * @returns {'mixed'}
 */
export function getChatType() {
  return 'mixed';
}
