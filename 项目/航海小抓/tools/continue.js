/**
 * tools/continue.js — 延续上一轮查询结果
 *
 * 处理用户说“上一个”“再发一个”“要第三个”等上下文指令。
 */

import { client } from '../lib/feishu.js';
import { extractValidUrl, normalizeFieldText, readStandardField } from '../lib/bitable.js';

/**
 * 执行延续查询
 * @param {Object} args
 */
export async function run(args) {
  const { event, ctx } = args;
  const userText = event.userText ?? '';
  const chatId = event.message.chat_id;

  const state = ctx?.state ?? {};
  const previousResults = state.previousResults ?? [];
  const previousQuery = state.previousQuery ?? '';

  if (!previousResults.length) {
    return { text: '没有上一次的查询结果哦。可以直接@我并输入关键词查找。' };
  }

  const t = userText.trim().toLowerCase();
  let selectedIndex = -1;

  // 1. 语义优先：明确的方向/翻页指令
  if (t.includes('上一个') || t.includes('上一个的') || t.includes('last')) {
    selectedIndex = previousResults.length - 1;
  } else if (t.includes('再发一个') || t.includes('再来一个') || t.includes('再来一份') || t.includes('换一个') || t.includes('不是这个')) {
    // 默认返回第二条（即第一个未展示过的），如果只有一条则返回第一条
    selectedIndex = Math.min(1, previousResults.length - 1);
  } else if (t.includes('第一个') || t.includes('第一条') || t.includes('最开始')) {
    selectedIndex = 0;
  } else if (t.includes('第二个') || t.includes('第二条')) {
    selectedIndex = Math.min(1, previousResults.length - 1);
  } else if (t.includes('第三个') || t.includes('第三条')) {
    selectedIndex = Math.min(2, previousResults.length - 1);
  } else if (/^\d+\s*$/.test(t)) {
    // 纯数字“3” → 直接视为第3个
    selectedIndex = Math.min(parseInt(t, 10) - 1, previousResults.length - 1);
  } else {
    // 2. 兜底匹配“第N个”“第N条”
    const indexMatch = t.match(/第\s*([0-9一二三四五六七八九十两]+)\s*[个条]/);
    if (indexMatch) {
      selectedIndex = parseCnNumber(indexMatch[1]) - 1;
    }
  }

  if (selectedIndex >= 0 && selectedIndex < previousResults.length) {
    const record = previousResults[selectedIndex];
    const f = record.fields || {};
    const name = normalizeFieldText(readStandardField(f, '文件名'), '未知');
    const personValue = normalizeFieldText(readStandardField(f, '分享人'));
    const tagsValue = normalizeFieldText(readStandardField(f, '主题标签'));
    const periodValue = normalizeFieldText(readStandardField(f, '航海期次'));
    const link = extractValidUrl(readStandardField(f, '文件链接') || readStandardField(f, '原文链接'));
    const person = personValue ? ` ·${personValue}` : '';
    const tags = tagsValue ? ` [${tagsValue}]` : '';
    const period = periodValue ? ` 🚢${periodValue}` : '';

    return {
      text: `「${previousQuery}」第 ${selectedIndex + 1} 条：\n${name}${person}${tags}${period}\n${link}`,
    };
  }

  // 没有命中特定指令，重新列出全部
  const lines = previousResults.map((r, i) => {
    const f = r.fields || {};
    const name = normalizeFieldText(readStandardField(f, '文件名'), '未知');
    const personValue = normalizeFieldText(readStandardField(f, '分享人'));
    const tagsValue = normalizeFieldText(readStandardField(f, '主题标签'));
    const link = extractValidUrl(readStandardField(f, '文件链接') || readStandardField(f, '原文链接'));
    const person = personValue ? ` ·${personValue}` : '';
    const tags = tagsValue ? ` [${tagsValue}]` : '';
    return `${i + 1}. ${name}${person}${tags}${link ? `\n   ${link}` : ''}`;
  });

  return {
    text: `「${previousQuery}」共 ${previousResults.length} 条：\n${lines.join('\n')}\n\n可以回复“第3个”查看具体某条。`,
  };
}

function parseCnNumber(str) {
  if (!str) return 1;
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const cnMap = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  let num = 0;
  let temp = 0;
  for (const ch of str) {
    const n = cnMap[ch];
    if (n === 10) {
      if (temp === 0) temp = 1;
      num += temp * 10;
      temp = 0;
    } else if (n) {
      temp = temp * 10 + n; // 处理“十三” -> 10+3 的简单情况
    }
  }
  return num + temp || 1;
}
