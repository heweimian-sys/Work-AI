import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const draftPath = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const checkOnly = process.argv.includes('--check');
if (!draftPath) throw new Error('用法：node scripts/publish-content.mjs content/drafts/YYYY-MM-DD.json');

const required = (value, label) => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) throw new Error(`缺少必填字段：${label}`);
};
const validateSources = (item, label) => {
  required(item.sources, `${label}.sources`);
  item.sources.forEach((source, index) => { required(source.group, `${label}.sources[${index}].group`); required(source.time, `${label}.sources[${index}].time`); });
};

const draft = JSON.parse(await readFile(resolve(draftPath), 'utf8'));
required(draft.meta, 'meta');
for (const key of ['day', 'date', 'coveredUntil', 'messageCount', 'groups', 'reviewStatus', 'reviewedBy']) required(draft.meta[key], `meta.${key}`);
if (!checkOnly && draft.meta.reviewStatus !== 'approved') throw new Error('草稿尚未人工审核：meta.reviewStatus 必须为 approved');
for (const section of ['important', 'questions', 'practices', 'consensus', 'archiveDays']) required(draft[section], section);
draft.important.forEach((item, i) => { for (const key of ['tag', 'title', 'body', 'action']) required(item[key], `important[${i}].${key}`); validateSources(item, `important[${i}]`); });
draft.questions.forEach((item, i) => { for (const key of ['question', 'answer', 'topic', 'confirmedBy']) required(item[key], `questions[${i}].${key}`); validateSources(item, `questions[${i}]`); });
draft.practices.forEach((item, i) => { for (const key of ['result', 'person', 'method', 'status']) required(item[key], `practices[${i}].${key}`); validateSources(item, `practices[${i}]`); });
draft.consensus.forEach((item, i) => { required(item.text, `consensus[${i}].text`); validateSources(item, `consensus[${i}]`); });

if (checkOnly) console.log(`校验通过：Day ${draft.meta.day} · ${draft.meta.date}`);
else {
  const outputDir = resolve('public/content');
  await mkdir(outputDir, { recursive: true });
  const serialized = `${JSON.stringify(draft, null, 2)}\n`;
  await writeFile(resolve(outputDir, basename(draftPath)), serialized);
  await writeFile(resolve(outputDir, 'latest.json'), serialized);
  const applicationData = {
    important: draft.important.map(item => ({ ...item, time: item.sources[0].time, source: item.sources.map(entry => entry.group).join('、'), sources: undefined })),
    questions: draft.questions.map(item => ({ q: item.question, a: item.answer, topic: item.topic, by: item.confirmedBy, source: `${item.sources[0].group} · ${item.sources[0].time}` })),
    practices: draft.practices.map(item => ({ result: item.result, person: item.person, method: item.method, status: item.status, time: item.sources[0].time })),
    archiveDays: draft.archiveDays
  };
  const lines = Object.entries(applicationData).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;`);
  await writeFile(resolve('content/site-data.ts'), `${lines.join('\n\n')}\n`);
  console.log(`已发布 Day ${draft.meta.day}：${draft.meta.date}（${draft.meta.messageCount} 条消息）`);
}
