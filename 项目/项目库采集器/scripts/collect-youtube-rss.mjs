import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'config/accounts.json');
const inboxDir = resolve(root, 'inbox');
await mkdir(inboxDir, { recursive: true });

const config = JSON.parse(await readFile(configPath, 'utf8'));
const accounts = config.accounts.filter((item) => item.enabled && item.platform === 'youtube');

if (!accounts.length) {
  console.log('还没有启用 YouTube 账号。请先在 collector_mvp/config/accounts.json 填写频道地址，并把 enabled 改成 true。');
  process.exit(0);
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null;
}

function entries(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
}

for (const account of accounts) {
  const channelId = account.account_id || new URL(account.url).searchParams.get('channel_id');
  if (!channelId) {
    console.log(`跳过 ${account.account_name || account.url}：没有找到频道 ID`);
    continue;
  }
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube RSS 请求失败：${response.status}`);
  const xml = await response.text();
  for (const entry of entries(xml)) {
    const videoId = tag(entry, 'yt:videoId');
    const contentUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const record = {
      record_id: `youtube-${videoId}`,
      platform: 'youtube',
      author_id: channelId,
      author_name: tag(entry, 'name'),
      author_url: tag(entry, 'uri'),
      content_id: videoId,
      content_url: contentUrl,
      title: tag(entry, 'title'),
      text: null,
      transcript: null,
      ocr_text: null,
      published_at: tag(entry, 'published'),
      collected_at: new Date().toISOString(),
      media_type: 'video',
      metrics: {},
      collection_method: 'youtube_rss',
      raw_path: null,
      dedupe_key: `youtube:${videoId}`,
      project_relevance: 'unknown',
      has_product_or_service: 'unknown',
      has_case_or_result: 'unknown',
      has_reproducible_process: 'unknown',
      commercial_activity_type: [],
      evidence_level: 'L1',
      ai_score: null,
      ai_reason: null,
      review_status: 'pending'
    };
    await writeFile(resolve(inboxDir, `${record.record_id}.json`), JSON.stringify(record, null, 2));
    console.log(`已保存：${record.title}`);
  }
}
