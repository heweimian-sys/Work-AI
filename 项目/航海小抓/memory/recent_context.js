const MAX_CHAT_MESSAGES = 30;
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;

const recentByChat = new Map();

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getContentText(msgType, content) {
  if (!content) return '';
  if (msgType === 'text') return normalizeText(content.text);
  if (msgType === 'file') return normalizeText(content.file_name || content.title);
  if (msgType === 'image') return normalizeText(content.title || '[图片]');
  if (msgType === 'media') return normalizeText(content.file_name || content.title || '[媒体]');
  return '';
}

export function rememberMessage(event) {
  const msg = event.message;
  if (!msg?.chat_id || !msg?.message_id) return;

  let content = {};
  try {
    content = JSON.parse(msg.content || '{}');
  } catch {
    content = {};
  }

  const text = getContentText(msg.message_type, content);
  if (!text) return;

  const list = recentByChat.get(msg.chat_id) || [];
  list.push({
    id: msg.message_id,
    type: msg.message_type,
    sender: event.sender?.sender_id?.open_id || '',
    text,
    time: Date.now(),
  });

  while (list.length > MAX_CHAT_MESSAGES) list.shift();
  recentByChat.set(msg.chat_id, list);
}

export function getRecentContext(chatId, currentMessageId, options = {}) {
  const {
    includeCurrent = false,
    maxMessages = 8,
    maxChars = 800,
  } = options;

  const now = Date.now();
  const list = recentByChat.get(chatId) || [];
  const usable = list
    .filter(item => includeCurrent || item.id !== currentMessageId)
    .filter(item => now - item.time <= CONTEXT_WINDOW_MS)
    .slice(-maxMessages);

  const lines = usable.map(item => {
    const role = item.sender ? item.sender.slice(0, 8) : 'user';
    return `[${item.type}/${role}] ${item.text}`;
  });

  return lines.join('\n').slice(-maxChars);
}
