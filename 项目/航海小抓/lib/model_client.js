import OpenAI from 'openai';

function responseText(response) {
  if (response?.output_text) return response.output_text;
  return (response?.output || [])
    .flatMap(item => item?.content || [])
    .filter(item => item?.type === 'output_text')
    .map(item => item.text || '')
    .join('');
}

function toResponsesInput(messages) {
  const input = [];
  const instructions = [];
  for (const message of messages || []) {
    if (message.role === 'system' || message.role === 'developer') {
      if (message.content) instructions.push(message.content);
    } else if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: String(message.content ?? '') });
    } else if (message.role === 'assistant' && message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments || '{}',
        });
      }
    } else {
      input.push({ role: message.role, content: String(message.content ?? '') });
    }
  }
  return { input, instructions: instructions.join('\n\n') };
}

function toResponsesTools(tools) {
  return (tools || []).map(tool => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    strict: false,
  }));
}

function toChatCompletion(response) {
  const toolCalls = (response?.output || [])
    .filter(item => item?.type === 'function_call')
    .map(item => ({
      id: item.call_id || item.id,
      type: 'function',
      function: { name: item.name, arguments: item.arguments || '{}' },
    }));
  return {
    id: response?.id,
    model: response?.model,
    usage: response?.usage,
    choices: [{
      finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
      message: {
        role: 'assistant',
        content: responseText(response),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
    }],
  };
}

async function createResponsesCompletion(params) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const { input, instructions } = toResponsesInput(params.messages);
  const body = { model: params.model, input, stream: false };
  if (instructions) body.instructions = instructions;
  if (params.tools?.length) body.tools = toResponsesTools(params.tools);
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  if (params.max_tokens) body.max_output_tokens = params.max_tokens;
  if (params.response_format?.type === 'json_object') body.text = { format: { type: 'json_object' } };

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`模型接口返回非 JSON（HTTP ${response.status}）`); }
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `模型接口请求失败（HTTP ${response.status}）`);
  }
  return toChatCompletion(data);
}

export function createModelClient() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  });
  if ((process.env.MODEL_API_MODE || '').toLowerCase() !== 'responses') return openai;
  return { chat: { completions: { create: createResponsesCompletion } } };
}
