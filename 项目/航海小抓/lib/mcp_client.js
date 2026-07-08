/**
 * lib/mcp_client.js - Minimal remote MCP client over HTTP/SSE.
 *
 * Avoids adding a new dependency while supporting the Streamable HTTP shape
 * used by remote MCP servers.
 */

import 'dotenv/config';

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSsePayload(text) {
  const chunks = [];
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) current.push(line.slice(5).trimStart());
    if (!line.trim() && current.length) {
      chunks.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join('\n'));

  for (const chunk of chunks) {
    try {
      return JSON.parse(chunk);
    } catch {
      // keep trying
    }
  }
  return null;
}

async function readMcpResponse(resp) {
  const text = await resp.text();
  if (!text.trim()) return { jsonrpc: '2.0', result: null };
  try {
    return JSON.parse(text);
  } catch {
    const parsed = parseSsePayload(text);
    if (parsed) return parsed;
    throw new Error(`MCP 返回无法解析: ${text.slice(0, 180)}`);
  }
}

function extractSessionId(resp) {
  return resp.headers.get('mcp-session-id') || resp.headers.get('Mcp-Session-Id') || '';
}

export class RemoteMcpClient {
  constructor(options = {}) {
    this.url = options.url || process.env.SCYS_MCP_URL || 'https://mcp.scys.com/shengcai-web/mcp';
    this.token = options.token || process.env.SCYS_MCP_TOKEN || '';
    this.protocolVersion = options.protocolVersion || process.env.MCP_PROTOCOL_VERSION || DEFAULT_PROTOCOL_VERSION;
    this.timeoutMs = Number(options.timeoutMs || process.env.SCYS_MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.retries = Number(options.retries ?? process.env.SCYS_MCP_RETRIES ?? DEFAULT_RETRIES);
    this.sessionId = '';
    this.nextId = 1;
    this.initialized = false;
  }

  get enabled() {
    return !!this.url && !!this.token;
  }

  headers(extra = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  async rpc(method, params = {}, { notification = false } = {}) {
    const payload = notification
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id: this.nextId++, method, params };

    let resp;
    let lastError;
    const attempts = Math.max(1, this.retries + 1);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        resp = await fetch(this.url, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= attempts) break;
        await sleep(500 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!resp) {
      throw new Error(`MCP ${method} 请求失败: ${lastError?.message || 'fetch failed'}`);
    }

    const sessionId = extractSessionId(resp);
    if (sessionId) this.sessionId = sessionId;

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`MCP HTTP ${resp.status}: ${body.slice(0, 220)}`);
    }

    const data = await readMcpResponse(resp);
    if (data?.error) {
      throw new Error(`MCP ${method} 失败: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data?.result ?? data;
  }

  async initialize() {
    if (!this.enabled) {
      throw new Error('SCYS_MCP_TOKEN 未配置。请先在 .env 设置 SCYS_MCP_TOKEN。');
    }
    if (this.initialized) return;

    await this.rpc('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: {
        name: 'feishu-kb-agent',
        version: '3.0.0',
      },
    });

    await this.rpc('notifications/initialized', {}, { notification: true });
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    const result = await this.rpc('tools/list', {});
    return result?.tools || [];
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return await this.rpc('tools/call', {
      name,
      arguments: args,
    });
  }
}

export function createScysMcpClient(options = {}) {
  return new RemoteMcpClient({
    url: process.env.SCYS_MCP_URL || 'https://mcp.scys.com/shengcai-web/mcp',
    token: process.env.SCYS_MCP_TOKEN || '',
    ...options,
  });
}
