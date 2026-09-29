import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = resolve(root, 'inbox');
const exportsDir = resolve(root, 'exports');
await mkdir(exportsDir, { recursive: true });
const files = (await readdir(inbox)).filter((name) => name.endsWith('.json') && name !== 'sample-record.json');
const records = await Promise.all(files.map(async (file) => JSON.parse(await readFile(resolve(inbox, file), 'utf8'))));
const columns = ['record_id','platform','author_name','content_url','title','published_at','project_relevance','has_product_or_service','has_case_or_result','has_reproducible_process','evidence_level','ai_score','review_status','ai_reason'];
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = [columns.join(','), ...records.map((record) => columns.map((column) => quote(record[column])).join(','))].join('\n') + '\n';
const output = resolve(exportsDir, '采集收件箱.csv');
await writeFile(output, csv);
console.log(`已导出 ${records.length} 条记录：${output}`);
