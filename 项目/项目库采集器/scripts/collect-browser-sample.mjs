import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inboxDir = resolve(root, 'inbox');
const files = (await readdir(inboxDir)).filter((name) => name.startsWith('pilot-') && name.endsWith('.json'));
if (!files.length) {
  console.log('收件箱里暂时没有可测试的公开链接。');
  process.exit(0);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36'
});
for (const file of files) {
  const path = resolve(inboxDir, file);
  const record = JSON.parse(await readFile(path, 'utf8'));
  try {
    await page.goto(record.content_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    record.page_title = title || record.title;
    record.text = body.replace(/\s+/g, ' ').trim().slice(0, 12000) || record.text;
    record.collection_method = 'browser_public_page';
    record.collected_at = new Date().toISOString();
    record.fetch_status = 'ok';
    await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify(record, null, 2)));
    console.log(`读取成功：${record.platform} | ${record.page_title}`);
  } catch (error) {
    record.fetch_status = 'failed';
    record.fetch_error = error instanceof Error ? error.message : String(error);
    await import('node:fs/promises').then(({ writeFile }) => writeFile(path, JSON.stringify(record, null, 2)));
    console.log(`读取失败：${record.platform} | ${record.content_url}`);
  }
}
await browser.close();
