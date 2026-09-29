import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['raw/youtube', 'raw/xiaohongshu', 'raw/bilibili', 'raw/x', 'normalized', 'inbox', 'exports', 'logs'];
for (const dir of dirs) await mkdir(resolve(root, dir), { recursive: true });
const sample = {
  record_id: 'sample-remove-me',
  platform: 'web',
  author_id: null,
  author_name: null,
  author_url: null,
  content_id: null,
  content_url: 'https://example.com',
  title: 'sample',
  text: null,
  transcript: null,
  ocr_text: null,
  published_at: null,
  collected_at: new Date().toISOString(),
  media_type: 'article',
  metrics: {},
  collection_method: 'manual_sample',
  raw_path: null,
  dedupe_key: 'web:example.com',
  project_relevance: 'unknown',
  has_product_or_service: 'unknown',
  has_case_or_result: 'unknown',
  has_reproducible_process: 'unknown',
  commercial_activity_type: [],
  evidence_level: 'unknown',
  ai_score: null,
  ai_reason: null,
  review_status: 'pending'
};
await writeFile(resolve(root, 'inbox/sample-record.json'), JSON.stringify(sample, null, 2));
console.log(`Initialized collector MVP at ${root}`);
