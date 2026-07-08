import 'dotenv/config';
import { expandQueryKeywords } from '../lib/ai.js';
import { searchMultiKeywords } from '../lib/bitable.js';

const userText = '我要人工智能文档';

console.log('=== Phase 2 语义检索链路测试（合并查询） ===\n');
console.log(`用户查询: "${userText}"`);

const expanded = await expandQueryKeywords(userText);
console.log('扩展关键词:', expanded);

const allKeywords = [...new Set([userText, ...expanded])].filter(Boolean);
console.log('合并关键词:', allKeywords, '\n');

const records = await searchMultiKeywords(allKeywords);
console.log(`合并查询命中 ${records.length} 条:`);
records.forEach((r, i) => {
  const name = r.fields['文件名'] ?? '(无文件名)';
  console.log(`  ${i + 1}. ${name}`);
});

const aiHit = records.some(r => String(r.fields['文件名'] ?? '').toLowerCase().includes('ai'));
if (aiHit) {
  console.log('\n✅ 语义检索成功：查询「人工智能」命中了「AI」文档');
  process.exit(0);
} else {
  console.error('\n❌ 语义检索未命中 AI 文档');
  process.exit(1);
}
