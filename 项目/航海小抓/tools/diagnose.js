import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

/**
 * 基于错误日志和上下文进行自诊断
 * @param {Object} params
 * @param {string} params.error - 错误信息/堆栈
 * @param {string} params.operation - 操作名称，如 'uploadToDrive'
 * @param {Object} params.context - 额外上下文，如 folderToken, fileName, permissions 等
 * @returns {Promise<{summary: string, causes: string[], actions: string[], needsHuman: boolean}>}
 */
export async function diagnose({ error, operation, context }) {
  const prompt = `你是一位飞书开发助手，正在帮用户排查一个机器人错误。请根据以下信息给出简洁的中文诊断和解决步骤。

操作：${operation}
错误信息：${error}
上下文：${JSON.stringify(context, null, 2)}

请按以下 JSON 格式返回：
{
  "summary": "一句话总结问题",
  "causes": ["可能原因1", "可能原因2"],
  "actions": ["用户需要执行的步骤1", "步骤2"],
  "needsHuman": true
}

注意：
- 如果错误是飞书 API 返回的 403/forbidden/1061004，最可能的原因是：应用没有被添加到目标文件夹的协作者中，或者应用没有 drive:drive/drive:file 权限。
- 需要用户手动操作的部分（如分享文件夹、开通权限）直接告诉用户具体步骤。
- 不要编造不确定的信息。`;

  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const raw = resp.choices[0].message.content;
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary ?? '未知错误',
      causes: Array.isArray(parsed.causes) ? parsed.causes : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      needsHuman: Boolean(parsed.needsHuman),
    };
  } catch (err) {
    console.error('[Diagnose] 自诊断失败:', err.message);
    return {
      summary: '自诊断分析失败，以下是通用排查建议：',
      causes: [error],
      actions: [
        '请检查 .env 中的 DRIVE_FOLDER_TOKEN 是否正确',
        '请确认飞书应用已开通 drive:drive、drive:file 权限',
        '请把目标文件夹分享给机器人（应用）',
      ],
      needsHuman: true,
    };
  }
}

/**
 * Tool 接口：供 Agent 调用
 */
export async function run(args) {
  const result = await diagnose(args);
  return {
    text: `**诊断结果**：${result.summary}\n\n**可能原因**：\n${result.causes.map(c => `- ${c}`).join('\n')}\n\n**建议操作**：\n${result.actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    suppressDefaultReply: true,
  };
}
