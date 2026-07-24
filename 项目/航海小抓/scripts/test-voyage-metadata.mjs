import assert from 'node:assert/strict';
import {
  buildArchiveLifecycle,
  inferVoyageMetadata,
  isQueryableVoyageRecord,
} from '../lib/voyage-metadata.js';
import { normalizeFeishuText } from '../tools/send-message.js';

const complete = inferVoyageMetadata({
  fileName: '7月小红书航海中期复盘PPT.pptx',
  activityName: '小红书航海',
  confidence: 0.91,
});
assert.equal(complete.month, '7月');
assert.equal(complete.project, '小红书');
assert.equal(complete.stage, '中期');
assert.equal(complete.materialType, 'PPT');
assert.equal(complete.needsClassification, false);
assert.equal(buildArchiveLifecycle(complete, { backedUp: true })['归档状态'], '已归档');

const uncertain = inferVoyageMetadata({
  fileName: '教练分享资料.pdf',
  confidence: 0.4,
});
assert.equal(uncertain.needsClassification, true);
assert.equal(buildArchiveLifecycle(uncertain)['归档状态'], '待补分类');

assert.equal(isQueryableVoyageRecord({
  '归档状态': '已归档',
  '有效状态': '有效',
  '当前版本': true,
  '文件链接': { link: 'https://example.feishu.cn/file/abc' },
}), true);
assert.equal(isQueryableVoyageRecord({
  '归档状态': '待补分类',
  '有效状态': '有效',
  '当前版本': true,
  '文件链接': 'https://example.feishu.cn/file/abc',
}), false);
assert.equal(isQueryableVoyageRecord({
  '归档状态': '已归档',
  '有效状态': '失效',
  '当前版本': true,
  '文件链接': 'https://example.feishu.cn/file/abc',
}), false);

assert.equal(
  normalizeFeishuText('## 能力\n- **归档资料**：`PPT`'),
  '能力\n• 归档资料：PPT',
);

console.log('voyage metadata tests: 9 passed');
