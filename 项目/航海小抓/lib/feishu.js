import * as lark from '@larksuiteoapi/node-sdk';
import 'dotenv/config';

/**
 * 禁用系统代理，直连飞书 API。
 * 系统级 HTTPS_PROXY 会导致 axios 把 HTTPS 请求通过 CONNECT 隧道转发，
 * 部分代理对飞书 TLS 握手处理有问题，产生 400 错误。
 */
delete process.env.HTTPS_PROXY;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.http_proxy;

function sanitizeLogArg(arg) {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'object' && arg !== null) {
    const code = arg.code || arg.status || arg.response?.status;
    const msg = arg.msg || arg.message || arg.response?.data?.msg;
    return [code ? `code=${code}` : '', msg || 'object'].filter(Boolean).join(' ');
  }
  return String(arg);
}

const safeSdkLogger = {
  trace: (...args) => console.log('[sdk:trace]', ...args.map(sanitizeLogArg)),
  debug: (...args) => console.log('[sdk:debug]', ...args.map(sanitizeLogArg)),
  info: (...args) => console.log('[sdk:info]', ...args.map(sanitizeLogArg)),
  warn: (...args) => console.warn('[sdk:warn]', ...args.map(sanitizeLogArg)),
  error: (...args) => console.error('[sdk:error]', ...args.map(sanitizeLogArg)),
};

/**
 * 飞书客户端单例
 * 封装 tenant_access_token 自动刷新
 */
export const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
  logger: safeSdkLogger,
});

/**
 * 带 Token + 超时的飞书 API 请求
 * 替代之前静默失败的可选链 SDK 调用
 * 确保使用和「发消息」时相同的 client 身份凭证
 * @param {'GET'|'POST'} method
 * @param {string} apiPath - /open-apis/docx/v1/documents/xxx
 * @param {number} timeoutMs - 超时毫秒（默认3000）
 * @returns {Object|null} 成功返回 data，超时/失败返回 null
 */
export async function fetchAPI(method, apiPath, timeoutMs = 3000, body = null) {
  // 方式1：尝试 SDK 的 request 方法（自动带 token）
  if (typeof client.request === 'function') {
    try {
      const reqOpts = { method, url: `https://open.feishu.cn${apiPath}` };
      if (body) reqOpts.data = body;
      const resp = await Promise.race([
        client.request(reqOpts),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ]);
      if (resp?.code === 0) return resp.data;
      if (resp?.code) { log('warn', `fetchAPI(SDK) ${apiPath} → code=${resp.code}`); return null; }
    } catch (e) {
      if (e.message === 'timeout') { log('warn', `fetchAPI(SDK) ${apiPath} → 超时`); return null; }
      // 其他异常（如 400）→ 尝试读取飞书返回的错误详情
      const feishuErr = e?.response?.data;
      log('warn', `fetchAPI(SDK) ${apiPath} → code=${feishuErr?.code ?? e.response?.status} msg=${feishuErr?.msg ?? e.message?.substring(0,80)}`);
    }
  }

  // 方式2：手动获取 token 后用原生 fetch（兜底）
  let token = null;
  try {
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  // 兜底：如果 SDK 方法不存在，直接调 token API
  if (!token) {
    try {
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
    } catch { /* skip */ }
  }

  if (!token) {
    log('warn', `fetchAPI: 无法获取 token，跳过抓取`);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`https://open.feishu.cn${apiPath}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    clearTimeout(timer);
    if (!resp.ok) {
      log('warn', `fetchAPI ${apiPath} → HTTP ${resp.status}`);
      return null;
    }
    const json = await resp.json();
    if (json.code !== 0) {
      log('warn', `fetchAPI ${apiPath} → code=${json.code} msg=${json.msg}`);
      return null;
    }
    return json.data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      log('warn', `fetchAPI ${apiPath} → 超时(${timeoutMs}ms)`);
    } else {
      log('warn', `fetchAPI ${apiPath} → ${err.message}`);
    }
    return null;
  }
}

/**
 * 下载消息中的资源文件（PDF/图片/音频/视频）
 * 飞书要求：用户发送的资源必须通过 /im/v1/messages/:message_id/resources/:file_key 下载
 * 旧接口 /im/v1/files/:file_key 只能下载机器人自己上传的文件。
 * @param {string} messageId - 消息 ID
 * @param {string} fileKey - 资源 key
 * @param {'file'|'image'} type - 资源类型
 * @param {number} timeoutMs
 * @returns {Promise<Buffer|null>}
 */
export async function downloadResource(messageId, fileKey, type = 'file', timeoutMs = 10000) {
  let token = null;
  try {
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  if (!token) {
    try {
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
    } catch { /* skip */ }
  }

  if (!token) {
    log('warn', 'downloadResource: 无法获取 token');
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${type}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timer);
    if (!resp.ok) {
      log('warn', `downloadResource ${fileKey} → HTTP ${resp.status}`);
      return null;
    }
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      log('warn', `downloadResource ${fileKey} → 超时(${timeoutMs}ms)`);
    } else {
      log('warn', `downloadResource ${fileKey} → ${err.message}`);
    }
    return null;
  }
}

/**
 * 上传文件到飞书云空间
 *
 * 自动选择上传方式：
 *   - ≤20MB → upload_all（一次性上传）
 *   - >20MB → 分片上传（流式边下载边上传）
 *
 * @param {string} fileName - 文件名
 * @param {Buffer} fileBuffer - 文件内容
 * @param {string} [folderToken] - 父文件夹 token
 * @param {number} [timeoutMs] - 超时毫秒
 * @returns {Promise<{file_token: string, url: string}>}
 */
export async function uploadToDrive(fileName, fileBuffer, folderToken = '', timeoutMs = 30000) {
  const SIZE_THRESHOLD = 20 * 1024 * 1024; // 20MB
  if (fileBuffer.length > SIZE_THRESHOLD) {
    return uploadToDriveChunked(fileName, fileBuffer, folderToken, timeoutMs);
  }
  return uploadToDriveDirect(fileName, fileBuffer, folderToken, timeoutMs);
}

/**
 * 获取 tenant_access_token（公共方法）
 * 各函数复用的 token 获取逻辑
 */
async function getTenantToken() {
  let token = null;
  try {
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }
  if (!token) {
    const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }),
    });
    const json = await resp.json().catch(() => ({}));
    if (json?.code !== 0 || !json?.tenant_access_token) {
      throw new Error(`获取 tenant_access_token 失败 code=${json?.code ?? 'unknown'} msg=${json?.msg ?? 'unknown'}`);
    }
    token = json.tenant_access_token;
  }
  return token;
}

/** 分片大小：4MB */
const CHUNK_SIZE = 4 * 1024 * 1024;

function adler32(buffer) {
  const MOD = 65521;
  let a = 1;
  let b = 0;

  for (const byte of buffer) {
    a = (a + byte) % MOD;
    b = (b + a) % MOD;
  }

  return ((b << 16) | a) >>> 0;
}

/**
 * 分片上传文件到飞书云空间
 * 三步走：prepare → upload_parts → finish
 * 适用于 >20MB 的大文件，内存友好
 */
export async function uploadToDriveChunked(fileName, fileBuffer, folderToken = '', timeoutMs = 120000) {
  const token = await getTenantToken();
  if (!token) throw new Error('无法获取 tenant_access_token');
  if (!folderToken) throw new Error('DRIVE_FOLDER_TOKEN 未设置');

  const size = fileBuffer.length;
  const sizeMB = (size / 1024 / 1024).toFixed(1);
  log('info', `分片上传启动: ${fileName} (${sizeMB}MB, ${Math.ceil(size / CHUNK_SIZE)} 片)`);

  // Step 1: 初始化分片上传
  const controller1 = new AbortController();
  const timer1 = setTimeout(() => controller1.abort(), timeoutMs);
  let uploadId;
  let blockSize = CHUNK_SIZE;
  let totalChunks = Math.ceil(size / CHUNK_SIZE);
  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_prepare', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        file_name: fileName,
        parent_type: 'explorer',
        parent_node: folderToken,
        size: String(size),
      }),
      signal: controller1.signal,
    });
    clearTimeout(timer1);
    const json = await resp.json();
    if (json.code !== 0) throw new Error(`初始化分片上传失败 code=${json.code} msg=${json.msg}`);
    uploadId = json.data?.upload_id;
    if (!uploadId) throw new Error('初始化分片上传未返回 upload_id');
    blockSize = Number(json.data?.block_size) || CHUNK_SIZE;
    totalChunks = Number(json.data?.block_num) || Math.ceil(size / blockSize);
    log('ok', `分片上传初始化成功: upload_id=${uploadId.substring(0, 20)}..., block_size=${blockSize}, block_num=${totalChunks}`);
  } catch (err) {
    clearTimeout(timer1);
    if (err.name === 'AbortError') throw new Error(`初始化分片上传超时`);
    throw err;
  }

  // Step 2: 逐片上传（串行 + 重试）
  let uploadedSize = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * blockSize;
    const end = Math.min(start + blockSize, size);
    const chunk = fileBuffer.subarray ? fileBuffer.subarray(start, end) : fileBuffer.slice(start, end);

    let retries = 3;
    let success = false;
    while (retries > 0 && !success) {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), timeoutMs);
      try {
        const form = new FormData();
        form.append('upload_id', uploadId);
        form.append('seq', String(chunkIndex));
        form.append('size', String(chunk.length));
        // 飞书 upload_part 要求 Adler-32 校验和，十进制字符串。
        form.append('checksum', String(adler32(chunk)));
        const FileCtor = globalThis.File;
        const fileField = typeof FileCtor === 'function'
          ? new FileCtor([chunk], `part_${chunkIndex}`, { type: 'application/octet-stream' })
          : new Blob([chunk], { type: 'application/octet-stream' });
        form.append('file', fileField, `part_${chunkIndex}`);

        const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_part', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form,
          signal: controller2.signal,
        });
        clearTimeout(timer2);
        const json = await resp.json();
        if (json.code !== 0) {
          if (json.code === 1062008) {
            throw new Error(`FATAL_CHECKSUM_INVALID: 分片 ${chunkIndex} checksum 无效；必须使用 Adler-32 十进制字符串`);
          }
          throw new Error(`分片 ${chunkIndex} 上传失败 code=${json.code} msg=${json.msg}`);
        }
        uploadedSize += chunk.length;
        success = true;
        log('info', `分片 ${chunkIndex + 1}/${totalChunks} 上传成功 (${(chunk.length / 1024 / 1024).toFixed(2)}MB)`);
      } catch (err) {
        clearTimeout(timer2);
        retries--;
        if (String(err.message || '').includes('FATAL_CHECKSUM_INVALID')) {
          throw err;
        }
        if (retries === 0) throw new Error(`分片 ${chunkIndex} 上传失败: ${err.message}`);
        log('warn', `分片 ${chunkIndex} 上传失败，重试 (剩余${retries}次): ${err.message}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  log('ok', `所有分片上传完成 (${uploadedSize}/${size} bytes)`);

  // Step 3: 完成上传
  const controller3 = new AbortController();
  const timer3 = setTimeout(() => controller3.abort(), timeoutMs);
  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_finish', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        upload_id: uploadId,
        block_num: totalChunks,
      }),
      signal: controller3.signal,
    });
    clearTimeout(timer3);
    const json = await resp.json();
    if (json.code !== 0) throw new Error(`完成上传失败 code=${json.code} msg=${json.msg}`);
    log('ok', `分片上传全部完成: file_token=${json.data?.file_token}`);
    return {
      file_token: json.data?.file_token,
      url: `https://${process.env.FEISHU_DOMAIN || 'bytedance.feishu.cn'}/file/${json.data?.file_token}`,
    };
  } catch (err) {
    clearTimeout(timer3);
    if (err.name === 'AbortError') throw new Error(`完成上传超时`);
    throw err;
  }
}

/**
 * 普通一次性上传文件到飞书云空间（≤20MB 使用）
 * @param {string} fileName - 文件名
 * @param {Buffer} fileBuffer - 文件内容
 * @param {string} [folderToken] - 父文件夹 token
 * @param {number} [timeoutMs] - 超时毫秒
 * @returns {Promise<{file_token: string, url: string}>}
 */
export async function uploadToDriveDirect(fileName, fileBuffer, folderToken = '', timeoutMs = 30000) {
  let token = null;
  try {
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  if (!token) {
    try {
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
    } catch { /* skip */ }
  }

  if (!token) {
    throw new Error('无法获取 tenant_access_token');
  }

  if (!folderToken) {
    throw new Error('DRIVE_FOLDER_TOKEN 未设置，请在 .env 中填写云空间文件夹 token（打开目标文件夹，URL 中 folder/ 后面的字符串）');
  }

  const form = new FormData();
  form.append('file_name', fileName);
  form.append('parent_type', 'explorer');
  form.append('parent_node', folderToken);
  form.append('size', String(fileBuffer.length));
  // Node 18+ 支持 File 构造函数；比 Blob 更接近浏览器上传行为
  const FileCtor = globalThis.File;
  const fileField = typeof FileCtor === 'function'
    ? new FileCtor([fileBuffer], fileName, { type: 'application/octet-stream' })
    : new Blob([fileBuffer], { type: 'application/octet-stream' });
  form.append('file', fileField, fileName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/drive/v1/files/upload_all', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const json = await resp.json().catch(() => ({}));
    // 如果是参数错误（1061002），尝试清理文件名中的特殊字符后重试
    if (json.code === 1061002) {
      log('warn', '上传参数错误，尝试清理文件名中的特殊字符后重试...');
      // 保留中文、英文字母、数字、点、短横线，其他替换为下划线
      const cleanName = fileName.replace(/[^\w\s\u4e00-\u9fff.\-]/g, '_').replace(/\s+/g, ' ');
      if (cleanName !== fileName) {
        log('info', '清理后文件名: ' + cleanName);
        // 递归重试（只重试一次）
        return await uploadToDrive(cleanName, fileBuffer, folderToken, timeoutMs);
      }
    }
    if (!resp.ok || json.code !== 0) {
      throw new Error(`上传云空间失败 HTTP=${resp.status} code=${json.code ?? 'undefined'} msg=${json.msg ?? json.error ?? 'unknown'} body=${JSON.stringify(json).substring(0, 200)}`);
    }
    return {
      file_token: json.data?.file_token,
      url: `https://${process.env.FEISHU_DOMAIN || 'bytedance.feishu.cn'}/file/${json.data?.file_token}`,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`上传云空间超时(${timeoutMs}ms)`);
    }
    throw err;
  }
}
/**
 * 上传图片到飞书，获取 image_key（用于发送图片/表情包消息）
 * @param {Buffer} imageBuffer - 图片二进制
 * @param {string} [imageType='message'] - message / avatar
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<string>} image_key
 */
export async function uploadImage(imageBuffer, imageType = 'message', timeoutMs = 10000) {
  let token = null;
  try {
    const t = await client.getTenantAccessToken?.();
    token = t?.tenant_access_token ?? t?.data?.tenant_access_token;
  } catch { /* skip */ }

  if (!token) {
    try {
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
    } catch { /* skip */ }
  }

  if (!token) {
    throw new Error('无法获取 tenant_access_token');
  }

  const form = new FormData();
  form.append('image_type', imageType);
  const FileCtor = globalThis.File;
  const fileField = typeof FileCtor === 'function'
    ? new FileCtor([imageBuffer], 'sticker.png', { type: 'image/png' })
    : new Blob([imageBuffer], { type: 'image/png' });
  form.append('image', fileField, 'sticker.png');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch('https://open.feishu.cn/open-apis/im/v1/images', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json.code !== 0) {
      throw new Error(`上传图片失败 HTTP=${resp.status} code=${json.code ?? 'undefined'} msg=${json.msg ?? json.error ?? 'unknown'} body=${JSON.stringify(json).substring(0, 200)}`);
    }
    return json.data?.image_key;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`上传图片超时(${timeoutMs}ms)`);
    }
    throw err;
  }
}

export function log(level, msg, data) {
  const colors = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', err: '\x1b[31m' };
  const c = colors[level] || '';
  const label = { info: 'INFO', ok: ' OK ', warn: 'WARN', err: 'ERR ' }[level] || level;
  console.log(`${c}[${label}]\x1b[0m ${msg}`, data !== undefined ? data : '');
}

/**
 * 统一错误处理：打印并抛出
 */
export function assertOk(resp, context) {
  if (resp.code !== 0) {
    throw new Error(`${context} 失败 code=${resp.code} msg=${resp.msg}`);
  }
  return resp;
}
