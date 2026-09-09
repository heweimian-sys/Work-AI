import type { dailyIssue, archiveIssues } from '@/content/site-data';
export type Issue = typeof dailyIssue | (typeof archiveIssues)[number];

// 先按实际字体测量每一行，再分配画布；预览和下载共享同一个 PNG。
export async function createPoster(issue: Issue): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成图片');
  const width = 780, margin = 44;
  let y = 48;
  const rows: { text: string; y: number; size: number; bold: boolean; color: string }[] = [];
  function paragraph(text: string, size = 25, bold = false, color = '#263c31') {
    ctx!.font = `${bold ? 600 : 400} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    for (const block of text.split('\n')) {
      let line = '';
      for (const char of Array.from(block)) {
        if (line && ctx!.measureText(line + char).width > width - margin * 2) {
          rows.push({ text: line, y, size, bold, color }); y += size * 1.65; line = '';
        }
        line += char;
      }
      rows.push({ text: line, y, size, bold, color }); y += size * 1.65;
    }
    y += 16;
  }
  paragraph('抖音 CPS · 五期航海情报', 23, true, '#0f5132');
  paragraph(`${issue.day} · ${issue.date} · 更新至 ${issue.updatedAt}`, 19);
  paragraph(issue.title, 36, true, '#101814');
  paragraph(issue.dek);
  paragraph('本期重点', 29, true, '#0f5132');
  issue.briefing.forEach((item, i) => paragraph(`${i + 1}. ${item}`));
  issue.chapters.forEach(chapter => {
    y += 32;
    paragraph(`${chapter.number} / ${chapter.title}`, 31, true, '#0f5132');
    paragraph(chapter.lead);
    chapter.sections.forEach(section => { paragraph(section.label, 26, true); paragraph(section.text); });
    paragraph('接下来怎么做', 26, true, '#0f5132');
    chapter.actions.forEach((action, i) => paragraph(`${i + 1}. ${action}`));
    paragraph(`来源：${chapter.sources}`, 18, false, '#62756b');
  });
  y += 24;
  paragraph('查看本期及往期情报', 24, true);
  paragraph('douyin-cps-voyage.pages.dev', 21);
  // 控制总像素数量，避免手机浏览器画布内存限制。
  const scale = Math.min(2, 16000 / y, Math.sqrt(14000000 / (width * y)));
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil((y + 32) * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, y + 32);
  ctx.fillStyle = '#0f5132'; ctx.fillRect(0, 0, width, 10);
  ctx.textBaseline = 'top';
  rows.forEach(row => {
    ctx.font = `${row.bold ? 600 : 400} ${row.size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = row.color; ctx.fillText(row.text, margin, row.y);
  });
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败，请重试')), 'image/png'));
}
