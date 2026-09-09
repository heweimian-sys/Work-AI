import { mkdir, writeFile } from 'node:fs/promises';
import { archiveDays, important, practices, questions } from '../content/site-data.ts';

const source = (group, time) => [{ group, time }];
const draft = {
  meta: {
    day: 2,
    date: '2026-09-06',
    coveredUntil: '2026-09-06 18:25:45+08:00',
    messageCount: 2298,
    groups: [
      '抖音CPS（5期）1群-9月Mini航海',
      '抖音CPS（5期）2群-9月Mini航海',
      '【禁言】抖音CPS（5期）1群-9月Mini航海',
      '【禁言】抖音CPS（5期）2群-9月Mini航'
    ],
    reviewStatus: 'draft',
    reviewedBy: '待人工审核'
  },
  important: important.map(item => ({ tag: item.tag, title: item.title, body: item.body, action: item.action, sources: source(item.source, item.time) })),
  questions: questions.map(item => {
    const [group, time = ''] = item.source.split(' · ');
    return { question: item.q, answer: item.a, topic: item.topic, confirmedBy: item.by, sources: source(group, time) };
  }),
  practices: practices.map(item => ({ result: item.result, person: item.person, method: item.method, status: item.status, sources: source(item.person.includes('·') ? item.person.split('·').at(-1).trim() : '群内答疑', item.time) })),
  consensus: [{ text: '先完成，再根据数据迭代。没有密令也不需要等待；先按手册做出内容，发布后观察真实反馈。', sources: source('1群、2群', '9月4日—9月6日') }],
  archiveDays
};

await mkdir('content/drafts', { recursive: true });
await writeFile('content/drafts/2026-09-06.json', `${JSON.stringify(draft, null, 2)}\n`);
console.log('已生成 2026-09-06 待人工审核草稿');
