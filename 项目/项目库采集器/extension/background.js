const MAX_EVENTS_PER_TAB = 300;
const MAX_RESPONSES_PER_TAB = 80;
const API_HINTS = /(api|graphql|feed|note|post|comment|video|tweet|search|recommend|timeline|dynamic)/i;
const PLATFORM_HOSTS = /(xiaohongshu|bilibili|youtube|youtu\.be|x\.com|twitter)/i;

function platformFromUrl(url) {
  if (/xiaohongshu/i.test(url)) return 'xiaohongshu';
  if (/bilibili/i.test(url)) return 'bilibili';
  if (/youtube|youtu\.be/i.test(url)) return 'youtube';
  if (/x\.com|twitter/i.test(url)) return 'x';
  return 'web';
}

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.tabId < 0 || !PLATFORM_HOSTS.test(details.url) || !API_HINTS.test(details.url)) return;
  chrome.storage.session.get({ networkEvents: {} }).then(({ networkEvents }) => {
    const key = String(details.tabId);
    const events = networkEvents[key] || [];
    const normalized = details.url.split('#')[0];
    if (!events.some((event) => event.url === normalized)) {
      events.push({
        url: normalized,
        method: details.method,
        status_code: details.statusCode,
        type: details.type,
        platform: platformFromUrl(details.url),
        observed_at: new Date().toISOString()
      });
    }
    networkEvents[key] = events.slice(-MAX_EVENTS_PER_TAB);
    return chrome.storage.session.set({ networkEvents });
  }).catch(() => {});
}, { urls: [
  'https://*.xiaohongshu.com/*',
  'https://*.bilibili.com/*',
  'https://*.youtube.com/*',
  'https://youtu.be/*',
  'https://x.com/*',
  'https://twitter.com/*'
] });

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get({ networkEvents: {} }).then(({ networkEvents }) => {
    delete networkEvents[String(tabId)];
    return chrome.storage.session.set({ networkEvents });
  }).catch(() => {});
  chrome.storage.session.get({ networkResponses: {} }).then(({ networkResponses }) => {
    delete networkResponses[String(tabId)];
    return chrome.storage.session.set({ networkResponses });
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'networkResponse') {
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    chrome.storage.session.get({ networkResponses: {} }).then(({ networkResponses }) => {
      const key = String(tabId);
      const responses = networkResponses[key] || [];
      const item = {...message.payload, tab_id: tabId};
      if (!responses.some((response) => response.url === item.url && response.captured_at === item.captured_at)) responses.push(item);
      networkResponses[key] = responses.slice(-MAX_RESPONSES_PER_TAB);
      return chrome.storage.session.set({networkResponses});
    }).catch(() => {});
    return;
  }
  if (message?.type !== 'getNetworkEvents') return;
  const tabId = message.tabId ?? sender.tab?.id;
  chrome.storage.session.get({ networkEvents: {} }).then(({ networkEvents }) => {
    sendResponse({ events: networkEvents[String(tabId)] || [] });
  }).catch(() => sendResponse({ events: [] }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'getNetworkResponses') return;
  const tabId = message.tabId ?? sender.tab?.id;
  chrome.storage.session.get({ networkResponses: {} }).then(({ networkResponses }) => {
    sendResponse({responses: networkResponses[String(tabId)] || []});
  }).catch(() => sendResponse({responses: []}));
  return true;
});
