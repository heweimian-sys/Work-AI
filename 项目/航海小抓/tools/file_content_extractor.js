/**
 * tools/file_content_extractor.js — 文件内容提取工具（完整版）
 *
 * PDF → pdfjs-dist 提取文本
 * 图片 → GPT 视觉提取
 * 纯文本 → 直接读取
 */

import process from 'process';
import 'dotenv/config';
import { log } from '../lib/feishu.js';
import OpenAI from 'openai';
import * as pdfjs from 'pdfjs-dist';
import sharp from 'sharp';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
const MAX_IMAGE_BASE64_BYTES = 15 * 1024 * 1024;

/**
 * 从飞书云空间下载文件并提取文字内容
 */
export async function extractText(fileToken, fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  if (['txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml'].includes(ext)) {
    const buf = await downloadFromDrive(fileToken);
    if (buf) return buf.toString('utf-8').slice(0, 5000);
    return null;
  }

  const buf = await downloadFromDrive(fileToken);
  if (!buf) return null;

  // PDF → pdfjs-dist 提取纯文本
  if (ext === 'pdf') {
    return await extractPDFText(buf, fileName);
  }

  // 图片 → GPT 视觉
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
    return await extractImageText(buf, fileName, ext);
  }

  // PPT/PPTX → 从 ZIP 中提取 XML 文本
  if (['ppt', 'pptx'].includes(ext)) {
    return await extractPPTText(buf, fileName);
  }

  // DOCX → mammoth 提取
  if (['docx'].includes(ext)) {
    return await extractDocxText(buf, fileName);
  }

  // XLSX → 提取所有工作表文字
  if (['xlsx', 'xls'].includes(ext)) {
    return await extractExcelText(buf, fileName);
  }

  return null;
}

/**
 * 从 DOCX 中提取文字（使用 mammoth）
 */
async function extractDocxText(buffer, fileName) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim();
    if (text && text.length > 20) {
      log('ok', `DOCX 文本提取成功: ${fileName} → ${text.length} 字符`);
      return await summarizeWithGPT(text.slice(0, 4000), fileName);
    }
    log('warn', `DOCX 提取文本为空: ${fileName}`);
    return null;
   } catch (err) {
    log('warn', `DOCX 提取失败: ${err.message}`);
    return null;
  }
}

/**
 * 从 XLSX 中提取文字
 */
async function extractExcelText(buffer, fileName) {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allText = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const lines = json.map(row => row.filter(cell => cell != null).join(' | ')).filter(Boolean);
      if (lines.length > 0) {
        allText += `[${sheetName}]\n${lines.join('\n')}\n\n`;
      }
    }
    if (allText.trim().length > 20) {
      log('ok', `XLSX 文本提取成功: ${fileName} → ${allText.length} 字符`);
      return await summarizeWithGPT(allText.trim().slice(0, 4000), fileName);
    }
    log('warn', `XLSX 未提取到内容: ${fileName}`);
    return null;
  } catch (err) {
    log('warn', `XLSX 提取失败: ${err.message}`);
    return null;
  }
}

/**
 * 从 PPTX 中提取文字（PPTX 是 ZIP 包，解压后读 XML 文本）
 */
async function extractPPTText(buffer, fileName) {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let allText = '';

    for (const entry of entries) {
      // 只处理幻灯片中的文本文件
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
        const xml = entry.getData().toString('utf-8');
        // 提取 <t> 标签中的文本
        const texts = xml.match(/<t[^>]*>([^<]+)<\/t>/g);
        if (texts) {
          const lines = texts.map(t => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          if (lines.length > 0) {
            allText += lines.join(' ') + '\n';
          }
        }
      }
      // 也提取备注中的文本
      if (entry.entryName.match(/ppt\/notesSlides\/notesSlide\d+\.xml/)) {
        const xml = entry.getData().toString('utf-8');
        const texts = xml.match(/<t[^>]*>([^<]+)<\/t>/g);
        if (texts) {
          const lines = texts.map(t => t.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
          if (lines.length > 0) {
            allText += '[备注] ' + lines.join(' ') + '\n';
          }
        }
      }
    }

    if (allText.trim().length > 20) {
      log('ok', `PPT 文本提取成功: ${fileName} → ${allText.length} 字符`);
      return await summarizeWithGPT(allText.trim().slice(0, 4000), fileName);
    }

    log('warn', `PPT 未提取到文本: ${fileName}，尝试其他方式`);
    return null;
  } catch (err) {
    log('warn', `PPT 提取失败: ${err.message}`);
    return null;
  }
}

/**
 * 用 pdfjs-dist 从 PDF 中提取纯文本（无需渲染图片）
 */
async function extractPDFText(pdfBuffer, fileName) {
  try {
    const data = pdfBuffer.buffer || pdfBuffer;
    const doc = await pdfjs.getDocument({ data }).promise;
    log('info', `PDF ${fileName}: ${doc.numPages} 页`);

    // 取前 10 页
    const maxPages = Math.min(doc.numPages, 10);
    let allText = '';

    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      if (pageText.trim()) {
        allText += `\n--- 第 ${i} 页 ---\n${pageText.trim()}`;
      }
    }

    if (allText.trim().length > 20) {
      log('ok', `PDF 文本提取成功: ${fileName} → ${allText.length} 字符`);
      // 用 GPT 提取关键信息（文件名+内容）
      return await summarizeWithGPT(allText.trim().slice(0, 4000), fileName);
    }

    log('warn', `PDF 未提取到文本: ${fileName}`);
    return null;
  } catch (err) {
    log('warn', `PDF 提取失败: ${err.message}`);
    return null;
  }
}

/**
 * 用 GPT 从文件内容中提取关键信息用于打标
 */
async function summarizeWithGPT(content, fileName) {
  const prompt = `分析以下文件内容，提取关键信息。

文件名：${fileName}
文件内容：
${content.slice(0, 4000)}

请返回：
1. 文件的主要内容是什么（一句话）
2. 适合的标签（3-5个）
3. 关联的活动名称（如有）
4. 关联的航海期次（如有）
5. 分享人（如能识别）

只返回文字内容，不要额外说明。`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    });
    return resp.choices[0]?.message?.content || content.slice(0, 1000);
  } catch {
    return content.slice(0, 1000);
  }
}

/**
 * 图片 → GPT 视觉提取文字
 */
export async function extractImageText(buffer, fileName, ext) {
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
  let mime = mimeMap[ext] || 'image/png';
  let imageBuffer = buffer;

  if (Buffer.byteLength(imageBuffer.toString('base64')) > MAX_IMAGE_BASE64_BYTES) {
    try {
      const compressed = await sharp(buffer, { animated: false })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

      imageBuffer = compressed;
      mime = 'image/jpeg';
      log('info', `图片过大，已压缩后再识别: ${fileName} ${(buffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressed.length / 1024 / 1024).toFixed(1)}MB`);
    } catch (err) {
      log('warn', `图片压缩失败: ${err.message}`);
    }
  }

  const base64 = imageBuffer.toString('base64');

  if (base64.length > MAX_IMAGE_BASE64_BYTES) {
    log('warn', `图片仍然过大，跳过视觉识别: ${fileName} base64=${(base64.length / 1024 / 1024).toFixed(1)}MB`);
    return null;
  }

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `提取这个文件中的所有文字内容：${fileName}\n提取所有可见文字，直接返回内容。` },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });
    return resp.choices[0]?.message?.content?.slice(0, 5000) || null;
  } catch (err) {
    log('warn', `图片提取失败: ${err.message}`);
    return null;
  }
}

/**
 * 从飞书云空间下载文件
 */
async function downloadFromDrive(fileToken) {
  let token = null;
  try {
    const { client } = await import('../lib/feishu.js');
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  if (!token) {
    const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        app_id: process.env.FEISHU_APP_ID,
        app_secret: process.env.FEISHU_APP_SECRET,
      }),
    });
    const json = await resp.json();
    token = json?.tenant_access_token;
  }
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/drive/v1/files/${fileToken}/download`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    clearTimeout(timer);
    return null;
  }
}
