import { run as continueRun } from '../tools/continue.js';

console.log('=== 多轮 continue 工具测试 ===');

const fakeEvent = { message: { chat_id: 'test_chat' } };
const fakeRecords = [
  { fields: { '文件名': 'AI实战手册.pdf', '主题标签': ['AI', '大模型'], '分享人': '李四' } },
  { fields: { '文件名': '生财航海SOP.docx', '主题标签': ['航海', '运营'], '分享人': '王五' } },
  { fields: { '文件名': '张三分享PPT.pptx', '主题标签': ['社群', '案例'], '分享人': '张三' } },
];

const tests = [
  { text: '第3个', expected: '张三分享PPT' },
  { text: '上一个', expected: '张三分享PPT' },
  { text: '再发一个', expected: '生财航海SOP' },
  { text: '第一个', expected: 'AI实战手册' },
  { text: '第二个', expected: '生财航海SOP' },
  { text: '3', expected: '张三分享PPT' },
  { text: '全部', expected: '共 3 条' },
];

let passed = 0;
for (const t of tests) {
  const result = await continueRun({
    event: { ...fakeEvent, userText: t.text },
    ctx: { state: { previousResults: fakeRecords, previousQuery: '测试查询' } },
  });
  console.log(`"${t.text}" ->`, result.text.replace(/\n/g, ' '));
  if (result.text.includes(t.expected)) {
    console.log(`  ✅`);
    passed++;
  } else {
    console.error(`  ❌ 期望包含 "${t.expected}"`);
  }
}

console.log(`\n结果：${passed}/${tests.length} 通过`);
if (passed !== tests.length) process.exit(1);
