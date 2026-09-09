import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('用法：pnpm content:merge -- content/inbox/<export>.json');

const groups = new Map([
  ['69FACFEF1BC1CE8487D5110CC1BBE597', '🈲抖音CPS（5期）2群-9月Mini航'],
  ['FD060779F89805CC87E1B0CAC4496DE5', '🈲抖音CPS（5期）1群-9月Mini航海'],
  ['5D79B1E1994710672F392D275868EAEE', '抖音CPS（5期）2群-9月Mini航海'],
  ['77C2B451D6DCCE3E9BFBBFC6B81E257E', '抖音CPS（5期）1群-9月Mini航海'],
]);

const incomingDocument = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const incoming = Array.isArray(incomingDocument) ? incomingDocument : incomingDocument.items;
if (!Array.isArray(incoming)) throw new Error('输入必须是消息数组或含 items 的对象');

for (const item of incoming) {
  if (!item.msgId || !item.msgTime) throw new Error('每条消息必须包含 msgId 和 msgTime');
  if (!item.groupId || !groups.has(item.groupId)) throw new Error(`发现非目标群消息：${item.groupId ?? '缺少 groupId'}`);
}

await mkdir(resolve('content/raw'), { recursive: true });
await mkdir(resolve('content/state'), { recursive: true });
const archivePath = resolve('content/raw/messages.json');
let existing = [];
try { existing = JSON.parse(await readFile(archivePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const byId = new Map(existing.map(item => [String(item.msgId), item]));
for (const item of incoming) byId.set(String(item.msgId), { ...item, groupName: groups.get(item.groupId) });
const merged = [...byId.values()].sort((a, b) => a.msgTime - b.msgTime);

const cursors = {};
for (const groupId of groups.keys()) {
  const groupMessages = merged.filter(item => item.groupId === groupId);
  cursors[groupId] = {
    groupName: groups.get(groupId),
    lastMsgTime: groupMessages.at(-1)?.msgTime ?? 0,
    lastMsgId: String(groupMessages.at(-1)?.msgId ?? ''),
    messageCount: groupMessages.length,
  };
}

await writeFile(archivePath, `${JSON.stringify(merged, null, 2)}\n`);
await writeFile(resolve('content/state/cursors.json'), `${JSON.stringify(cursors, null, 2)}\n`);
console.log(`已合并 ${incoming.length} 条输入；新增 ${merged.length - existing.length} 条；累计 ${merged.length} 条。来源：${basename(inputPath)}`);

