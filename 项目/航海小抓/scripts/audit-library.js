/**
 * One-shot read-only knowledge base audit.
 */

import 'dotenv/config';
import { auditLibrary } from '../tools/library_audit.js';

function numberArg(name, fallback) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const asJson = process.argv.includes('--json');
const limit = numberArg('limit', 1000);

try {
  const result = await auditLibrary({ limit });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.replyText);
  }
} catch (err) {
  console.error(`资料库体检失败：${err.message}`);
  process.exit(1);
}
