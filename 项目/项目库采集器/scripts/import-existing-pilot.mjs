import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inboxDir = resolve(projectRoot, 'collector_mvp/inbox');
await mkdir(inboxDir, { recursive: true });
const sourcePath = resolve(projectRoot, 'pilot_run_2026-09-21.csv');
const csv = await readFile(sourcePath, 'utf8');
const lines = csv.split(/\r?\n/).filter(Boolean);
const headers = lines.shift().split(',');
const parse = (line) => {
  const cells = [];
  let cell = '', quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  return Object.fromEntries(headers.map((key, i) => [key, cells[i] ?? '']));
};
const platform = (value) => ({ Bilibili: 'bilibili', Douyin: 'web', 'X/Twitter': 'x' }[value] || 'web');
let imported = 0;
for (const line of lines) {
  const row = parse(line);
  if (!row.source_url) continue;
  const record = {
    record_id: `pilot-${row.candidate_id}`,
    platform: platform(row.platform),
    author_id: row.author_id || null,
    author_name: row.author_id || null,
    author_url: null,
    content_id: null,
    content_url: row.source_url,
    title: row.title || null,
    text: row.reason || null,
    transcript: null,
    ocr_text: null,
    published_at: row.publish_time ? new Date(row.publish_time).toISOString() : null,
    collected_at: new Date().toISOString(),
    media_type: 'unknown',
    metrics: {},
    collection_method: 'existing_project_library_pilot',
    raw_path: sourcePath,
    dedupe_key: `${platform(row.platform)}:${row.source_url}`,
    project_relevance: row.lead_strength === 'strong' ? 'high' : row.lead_strength === 'medium' ? 'medium' : 'unknown',
    has_product_or_service: row.offer ? true : 'unknown',
    has_case_or_result: row.commercial_signal_type === 'claimed_income' ? 'unknown' : false,
    has_reproducible_process: row.next_action ? 'unknown' : false,
    commercial_activity_type: row.commercial_action ? [row.commercial_action] : [],
    evidence_level: row.lead_strength === 'strong' ? 'L2' : 'L1',
    ai_score: null,
    ai_reason: row.reason || null,
    review_status: 'pending'
  };
  await writeFile(resolve(inboxDir, `${record.record_id}.json`), JSON.stringify(record, null, 2));
  imported += 1;
}
console.log(`已导入 ${imported} 条已有候选记录到 collector_mvp/inbox/`);
