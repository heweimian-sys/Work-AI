const status = document.getElementById('status');
const say = (text, cls = '') => { status.textContent = text; status.className = cls; };
const notify = (title, message) => { try { chrome.notifications.create({type: 'basic', iconUrl: 'icon.svg', title, message}); } catch (_) {} };
// 不在仓库保存飞书 Webhook。正式环境优先使用项目内的飞书 API 同步脚本。
const FEISHU_WEBHOOK_URL = '';
const LOCAL_SYNC_URL = 'http://127.0.0.1:43127/sync';
const FEISHU_TABLE_URL = 'https://shengcaiyoushu01.feishu.cn/wiki/Z2dMwIrP2i9ObKkV5pxczF3nnJh?table=tbl54NJzfSW4uQnq&view=vew47pHXDi';
const inputValue = (id) => document.getElementById(id)?.value.trim() || '';
const setBusy = (id, busy) => { const button = document.getElementById(id); if (button) { button.disabled = busy; button.dataset.originalText ||= button.textContent; button.textContent = busy ? '正在处理…' : button.dataset.originalText; } };
async function refreshSummary() {
  const saved = await chrome.storage.local.get({records: [], monitored_accounts: []});
  const tab = await currentTab();
  let responseCount = 0;
  if (tab?.id) { try { responseCount = (await chrome.runtime.sendMessage({type: 'getNetworkResponses', tabId: tab.id}))?.responses?.length || 0; } catch (_) {} }
  document.getElementById('recordCount').textContent = saved.records.length;
  document.getElementById('unsentCount').textContent = saved.records.filter((item) => !item.feishu_synced_at).length;
  document.getElementById('accountCount').textContent = saved.monitored_accounts.length;
  document.getElementById('responseCount').textContent = responseCount;
}
const normalizeUrl = (value) => {
  try {
    const url = new URL(value);
    ['xsec_token', 'xsec_source', 'share_from', 'share_session_id'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return url.href.replace(/[?#]$/, '').replace(/\/$/, '');
  } catch (_) { return String(value || '').split('#')[0].replace(/\/$/, ''); }
};
const contentIdFromUrl = (value) => {
  const url = String(value || '');
  const match = url.match(/\/explore\/([a-zA-Z0-9_-]+)/) || url.match(/[?&](?:note_id|id)=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
};

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function networkEvents(tabId) {
  try {
    const response = await chrome.runtime.sendMessage({type: 'getNetworkEvents', tabId});
    return response?.events || [];
  } catch (_) { return []; }
}
async function networkResponses(tabId) {
  try {
    const response = await chrome.runtime.sendMessage({type: 'getNetworkResponses', tabId});
    return response?.responses || [];
  } catch (_) { return []; }
}

document.getElementById('collect').addEventListener('click', async () => {
  setBusy('collect', true);
  try {
    const tab = await currentTab();
    if (!tab?.id || !tab.url) throw new Error('没有找到当前网页');
    const keyword = inputValue('keyword');
    const threshold = Number(inputValue('threshold') || 0);
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [{keyword, threshold}], func: async ({keyword, threshold}) => {
      const host = location.hostname;
      const platform = host.includes('xiaohongshu') ? 'xiaohongshu' : host.includes('bilibili') ? 'bilibili' : host.includes('youtube') ? 'youtube' : (host.includes('x.com') || host.includes('twitter.com')) ? 'x' : 'web';
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const absolute = (href) => new URL(href, location.href).href;
      const contentId = (href) => (href.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) || href.match(/\/shorts\/([a-zA-Z0-9_-]+)/) || href.match(/\/explore\/([a-zA-Z0-9_-]+)/) || href.match(/[?&](?:note_id|id)=([a-zA-Z0-9_-]+)/))?.[1] || null;
      const firstText = (root, selectors) => { for (const selector of selectors) { const node = root.querySelector(selector); if (node?.textContent?.trim()) return clean(node.textContent); } return null; };
      const isWatchPage = platform === 'youtube' && /\/watch\?/.test(location.href);
      if (platform === 'youtube' && !isWatchPage) {
        // YouTube uses infinite scroll; load several viewport batches before reading cards.
        for (let i = 0; i < 6; i += 1) {
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        window.scrollTo(0, 0);
      }
      const metric = (text, labels) => {
        const label = labels.find((item) => text.includes(item));
        if (!label) return null;
        const match = text.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)(万|千)?\\s*${label}`));
        if (!match) return null;
        const value = Number(match[1]) * (match[2] === '万' ? 10000 : match[2] === '千' ? 1000 : 1);
        return Number.isFinite(value) ? value : null;
      };
      const selectors = isWatchPage
        ? 'meta[itemprop="videoId"], #title h1, h1.ytd-watch-metadata'
        : platform === 'bilibili'
        ? 'a[href*="/video/"]'
        : platform === 'youtube'
          ? 'a#video-title, a[href*="/watch?v="]'
          : platform === 'xiaohongshu'
            ? 'a[href*="/explore/"]'
            : platform === 'x'
              ? 'article'
              : 'a[href]';
      const seen = new Set();
      const records = [];
      for (const matchedElement of document.querySelectorAll(selectors)) {
        const link = matchedElement.tagName === 'A' ? matchedElement : matchedElement.querySelector('a[href]');
        const element = platform === 'youtube'
          ? (matchedElement.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer') || matchedElement)
          : matchedElement;
        const href = link?.href || location.href;
        const key = href.split('?')[0];
        if (seen.has(key) || (platform !== 'x' && key === location.href.split('?')[0])) continue;
        const title = clean(link?.getAttribute('title') || link?.textContent || element.textContent);
        if (!title || title.length < 2) continue;
        seen.add(key);
        const elementText = clean(element.textContent);
        if (keyword && !(`${title} ${elementText}`).toLowerCase().includes(keyword.toLowerCase())) continue;
        const metrics = { likes: metric(elementText, ['赞', '点赞']), comments: metric(elementText, ['评论']), favorites: metric(elementText, ['收藏']), shares: metric(elementText, ['转发', '分享']), views: metric(elementText, ['播放', '观看', '阅读']) };
        const hotValue = Math.max(...Object.values(metrics).filter((value) => Number.isFinite(value)), 0);
        if (threshold && hotValue < threshold) continue;
        const hashtags = [...elementText.matchAll(/#[^#\s]{1,40}/g)].map((match) => match[0]).slice(0, 30);
        const images = [...element.querySelectorAll('img[src], img[data-src]')].map((node) => node.currentSrc || node.src || node.dataset.src).filter(Boolean).slice(0, 30);
        const videos = [...element.querySelectorAll('video[src], source[src]')].map((node) => node.currentSrc || node.src).filter(Boolean).slice(0, 10);
        records.push({ platform, content_id: contentId(absolute(href)), content_url: absolute(href), title: title.slice(0, 500), text: elementText.slice(0, 12000), collected_at: new Date().toISOString(), metrics, media: { image_urls: images, video_urls: videos }, author_name: firstText(element, ['#channel-name a', 'ytd-channel-name a', '.author', '[class*="author"]', '[class*="user"]']), detail: { body: elementText.slice(0, 20000), hashtags, author_home_url: element.querySelector('#channel-name a, ytd-channel-name a')?.href || null, product_or_service_url: null, snapshot_path: null }, comments: [], ai_analysis: { summary: null, what_to_do: null, payer: null, money_path: null, facts: [], inferences: [], unknowns: [], ordinary_person_fit: 'unknown', triage: 'unknown', model: null } });
        if (records.length >= 100) break;
      }
      if (!records.length) records.push({ platform, content_id: contentId(location.href), content_url: location.href, title: document.title, text: clean(document.body?.innerText).slice(0, 30000), collected_at: new Date().toISOString(), media: { image_urls: [...document.images].map((node) => node.currentSrc || node.src).filter(Boolean).slice(0, 30), video_urls: [...document.querySelectorAll('video[src]')].map((node) => node.currentSrc || node.src).filter(Boolean).slice(0, 10) } });
      return records;
    }});
    const observedNetworkEvents = await networkEvents(tab.id);
    const observedNetworkResponses = await networkResponses(tab.id);
    const incoming = result.result.map((record) => ({
      ...record,
      record_id: `${record.platform}-${crypto.randomUUID()}`,
      dedupe_key: `${record.platform}:${record.content_id || normalizeUrl(record.content_url)}`,
      review_status: 'pending', project_relevance: 'unknown', evidence_level: 'L1', collection_method: 'chrome_extension',
      network_observations: observedNetworkEvents.slice(-50),
      raw_network_responses: observedNetworkResponses.slice(-20)
    }));
    const saved = await chrome.storage.local.get({ records: [] });
    const uniqueIncoming = [...new Map(incoming.map((item) => [item.dedupe_key, item])).values()];
    const keys = new Set(uniqueIncoming.map((item) => item.dedupe_key));
    const records = [...uniqueIncoming, ...saved.records.filter((item) => !keys.has(item.dedupe_key))];
    await chrome.storage.local.set({ records });
    say(`已采集 ${uniqueIncoming.length} 条，已合并 ${observedNetworkEvents.length} 个网络观察${keyword ? `\n关键词：${keyword}` : ''}`, 'ok');
    notify('项目库采集完成', `本次新增 ${uniqueIncoming.length} 条，重复内容已忽略`);
  } catch (error) { await chrome.storage.local.set({last_collection_error: {message: error.message, at: new Date().toISOString()}}); say(`采集失败：${error.message}`, 'err'); } finally { setBusy('collect', false); await refreshSummary(); }
});

document.getElementById('collectKeyword').addEventListener('click', () => {
  if (!inputValue('keyword')) return say('请先填写搜索词，例如：AI获客、低成本创业、自动化', 'err');
  document.getElementById('collect').click();
});
document.getElementById('collectHot').addEventListener('click', () => {
  if (!inputValue('threshold')) document.getElementById('threshold').value = '10000';
  document.getElementById('collect').click();
});
document.getElementById('watchAccount').addEventListener('click', async () => {
  const tab = await currentTab();
  if (!tab?.url) return say('没有找到当前账号页面', 'err');
  const saved = await chrome.storage.local.get({ monitored_accounts: [] });
  const account = {url: tab.url, title: tab.title || tab.url, platform: new URL(tab.url).hostname, added_at: new Date().toISOString()};
  const exists = saved.monitored_accounts.some((item) => item.url.split('?')[0] === tab.url.split('?')[0]);
  if (!exists) await chrome.storage.local.set({monitored_accounts: [account, ...saved.monitored_accounts]});
  say(exists ? '这个账号已经在监控列表里' : `已加入对标账号：${account.title}`, 'ok');
  notify('对标账号已保存', exists ? '账号已存在' : '后续可按账号页面采集');
});

document.getElementById('detail').addEventListener('click', async () => {
  setBusy('detail', true);
  try {
    const tab = await currentTab();
    if (!tab?.id || !tab.url) throw new Error('没有找到当前网页');
    const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: () => {
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const host = location.hostname;
      const platform = host.includes('xiaohongshu') ? 'xiaohongshu' : host.includes('bilibili') ? 'bilibili' : host.includes('youtube') ? 'youtube' : (host.includes('x.com') || host.includes('twitter.com')) ? 'x' : 'web';
      const body = clean(document.body?.innerText || '');
      const hashtags = [...body.matchAll(/#[^#\s]{1,40}/g)].map((m) => m[0]).slice(0, 50);
      const content_id = (location.href.match(/\/explore\/([a-zA-Z0-9_-]+)/) || location.href.match(/[?&](?:note_id|id)=([a-zA-Z0-9_-]+)/))?.[1] || null;
      const firstText = (selectors) => { for (const selector of selectors) { const node = document.querySelector(selector); if (node?.textContent?.trim()) return clean(node.textContent); } return null; };
      const classify = (text) => /多少钱|价格|报价|怎么收费|哪里买|购买/.test(text) ? 'inquiry' : /想要|求推荐|有没有|需要|求助/.test(text) ? 'demand' : /赚了|收入|成交|订单|结果|效果/.test(text) ? 'result' : /不懂|为什么|真的吗|靠谱吗/.test(text) ? 'doubt' : 'ordinary';
      const commentSelectors = ['[class*="comment"]', '[class*="Comment"]', '[data-testid*="comment"]'];
      const comments = [];
      for (const selector of commentSelectors) {
        for (const node of document.querySelectorAll(selector)) {
          const text = clean(node.textContent);
          if (text.length < 8 || text.length > 1200) continue;
          const comment_id = node.getAttribute('data-id') || node.id || null;
          const author_name = clean(node.querySelector('[class*="author"], [class*="user"], a')?.textContent || '') || null;
          if (!comments.some((item) => item.text === text)) comments.push({comment_id, author_name, text, published_at: null, like_count: null, type: classify(text)});
          if (comments.length >= 100) break;
        }
        if (comments.length >= 100) break;
      }
      return {platform, content_id, content_url: location.href, title: document.title, author_name: firstText(['.author', '[class*="author"]', '[class*="user"]']), published_at: document.querySelector('time')?.dateTime || firstText(['time', '[class*="date"]', '[class*="time"]']), text: body.slice(0, 50000), collected_at: new Date().toISOString(), media: {image_urls: [...document.images].map((node) => node.currentSrc || node.src).filter(Boolean).slice(0, 50), video_urls: [...document.querySelectorAll('video[src], source[src]')].map((node) => node.currentSrc || node.src).filter(Boolean).slice(0, 10)}, detail: {body: body.slice(0, 50000), hashtags, author_home_url: null, product_or_service_url: null, snapshot_path: null}, comments};
    }});
    const resultData = result.result;
    const record = {...resultData, content_id: resultData.content_id || contentIdFromUrl(resultData.content_url), record_id: `${resultData.platform}-${crypto.randomUUID()}`, dedupe_key: `${resultData.platform}:${resultData.content_id || normalizeUrl(resultData.content_url)}`, review_status: 'pending', project_relevance: 'unknown', evidence_level: 'L1', collection_method: 'chrome_extension_detail', ai_analysis: {summary: null, what_to_do: null, payer: null, money_path: null, facts: [], inferences: [], unknowns: [], ordinary_person_fit: 'unknown', triage: 'unknown', model: null}};
    const saved = await chrome.storage.local.get({records: []});
    await chrome.storage.local.set({records: [record, ...saved.records.filter((item) => item.dedupe_key !== record.dedupe_key)]});
    say(`已采集详情，评论 ${record.comments.length} 条\n平台：${record.platform}`, 'ok');
    notify('详情采集完成', `已采集正文和 ${record.comments.length} 条评论`);
  } catch (error) { await chrome.storage.local.set({last_detail_error: {message: error.message, at: new Date().toISOString()}}); say(`详情采集失败：${error.message}`, 'err'); } finally { setBusy('detail', false); await refreshSummary(); }
});

document.getElementById('openFeishu').addEventListener('click', async () => {
  await chrome.tabs.create({url: FEISHU_TABLE_URL});
  say('已打开飞书项目库收件箱，请在新标签页查看同步结果。', 'ok');
});

document.getElementById('download').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get({ records: [] });
  const blob = new Blob([JSON.stringify(saved.records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `项目库采集收件箱-${Date.now()}.json`, saveAs: true });
  say(`已准备导出 ${saved.records.length} 条记录`, 'ok');
});

document.getElementById('cards').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get({ records: [] });
  if (!saved.records.length) { say('还没有可生成项目卡的内容', 'err'); return; }
  const words = {
    commercial: ['带货', '佣金', 'CPS', '联盟', '接单', '服务费', '课程', '会员', '订阅', '资料包', '代做', '撮合', '广告', '获客', '线索'],
    result: ['收入', '赚', '成交', '订单', '客户', '案例', '时薪', '美元', 'GMV', '利润', '佣金'],
    process: ['教程', '流程', '步骤', '实操', '全流程', '保姆级', '怎么做', '方法']
  };
  const hit = (text, list) => list.filter((word) => text.includes(word));
  const cards = saved.records.map((record) => {
    const text = [record.title, record.text, record.transcript, record.ocr_text].filter(Boolean).join(' ');
    const commercial = hit(text, words.commercial), result = hit(text, words.result), process = hit(text, words.process);
    const score = Math.min(100, commercial.length * 18 + result.length * 12 + process.length * 10);
    return {
      name: record.title || '未命名采集内容',
      summary: (record.text || record.title || '').slice(0, 300),
      source_platform: record.platform || 'unknown', source_url: record.content_url || '', source_record_id: record.record_id,
      screening_score: score, screening_status: score >= 55 ? '高潜待审核' : score >= 30 ? '普通待审核' : '低相关待审核',
      review_status: 'pending', isPublished: false,
      revenue_model: '待核验', evidence: { commercial, result, process },
      next_verification: ['核验作者身份', '核验真实结果或收入证据', '核验可复制步骤', '核验商业入口']
    };
  });
  const blob = new Blob([JSON.stringify(cards, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({url, filename: `待审核项目卡-${Date.now()}.json`, saveAs: true});
    const high = cards.filter((card) => card.screening_score >= 55).length;
    say(`已筛选 ${cards.length} 条内容，其中 ${high} 条高潜待审核。\n下一步：打开高潜内容，点击“补全当前内容的正文和评论”，确认后再同步飞书。`, 'ok');
});

document.getElementById('sendFeishu').addEventListener('click', async () => {
  if (!FEISHU_WEBHOOK_URL) {
    const saved = await chrome.storage.local.get({ records: [] });
    const unsent = saved.records.filter((item) => !item.feishu_synced_at).length;
    if (!unsent) return say('没有待同步内容', 'ok');
    setBusy('sendFeishu', true);
    try {
      const response = await fetch(LOCAL_SYNC_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({records:saved.records.filter((item)=>!item.feishu_synced_at)})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `本地同步服务返回 ${response.status}`);
      const synced = new Set((saved.records.filter((item)=>!item.feishu_synced_at)).slice(0,result.success).map((item)=>item.record_id));
      const updated = saved.records.map((item)=>synced.has(item.record_id)?{...item,feishu_synced_at:new Date().toISOString()}:item);
      await chrome.storage.local.set({records:updated});
      say(`已同步到飞书 ${result.success} 条${result.failed?`，失败 ${result.failed} 条`:''}`, result.failed?'err':'ok');
      notify('飞书同步完成', `成功 ${result.success} 条`);
    } catch (error) { say(`飞书同步失败：${error.message}\n请确认本机同步服务已启动。`, 'err'); notify('飞书同步失败', error.message); }
    finally { setBusy('sendFeishu', false); await refreshSummary(); }
    return;
  }
  const saved = await chrome.storage.local.get({ records: [] });
  if (!saved.records.length) { say('还没有可写入的采集记录', 'err'); return; }
  const unsent = saved.records.filter((item) => !item.feishu_synced_at);
  if (!unsent.length) { say(`飞书已同步 ${saved.records.length} 条记录`, 'ok'); return; }
  let success = 0;
  let failed = 0;
  for (const record of unsent) {
    let sent = false;
    for (let attempt = 0; attempt < 3 && !sent; attempt += 1) {
      let response;
      try {
        const fullText = [
          record.text || '',
          `\n【平台】${record.platform || ''}`,
          `【内容ID】${record.content_id || ''}`,
          `【作者】${record.author_name || ''}`,
          `【原文链接】${record.content_url || ''}`,
          `【发布时间】${record.published_at || ''}`,
          `【采集时间】${record.collected_at || ''}`,
          `【标签】${(record.detail?.hashtags || []).join(' ')}`,
          `【互动数据】${JSON.stringify(record.metrics || {})}`,
          `【图片链接】${JSON.stringify(record.media?.image_urls || [])}`,
          `【视频链接】${JSON.stringify(record.media?.video_urls || [])}`,
          `【评论】${JSON.stringify(record.comments || [])}`,
          `【AI分析】${JSON.stringify(record.ai_analysis || {})}`,
          `【完整原始记录】${JSON.stringify(record)}`
        ].join('\n');
        response = await fetch(FEISHU_WEBHOOK_URL, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            record_id: record.record_id || '',
            content_id: record.content_id || '',
            title: record.title || '',
            platform: record.platform || '',
            author_name: record.author_name || '',
            author_url: record.author_url || '',
            content_url: record.content_url || '',
            text: fullText,
            detail: JSON.stringify(record.detail || {}),
            hashtags: (record.detail?.hashtags || []).join(' '),
            comments: JSON.stringify(record.comments || []),
            metrics: JSON.stringify(record.metrics || {}),
            image_urls: JSON.stringify(record.media?.image_urls || []),
            video_urls: JSON.stringify(record.media?.video_urls || []),
            ai_analysis: JSON.stringify(record.ai_analysis || {}),
            collected_at: record.collected_at || new Date().toISOString(),
            published_at: record.published_at || '',
            project_relevance: record.project_relevance || 'unknown',
            evidence_level: record.evidence_level || 'L1',
            review_status: record.review_status || 'pending',
            raw_record: JSON.stringify(record)
          })
        });
      } catch (error) {
        failed += 1;
        console.error('飞书写入网络错误', error);
        break;
      }
      if (response.ok) {
        record.feishu_synced_at = new Date().toISOString();
        success += 1;
        sent = true;
        await chrome.storage.local.set({ records: saved.records });
      } else if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      } else {
        record.feishu_error = `HTTP ${response.status}`;
        record.feishu_error_at = new Date().toISOString();
        await chrome.storage.local.set({ records: saved.records });
        failed += 1;
        break;
      }
    }
    if (!sent && failed === 0) failed += 1;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  const message = `已写入飞书 ${success} 条${failed ? `，失败 ${failed} 条（本地仍保留）` : ''}`;
  say(message, failed ? 'err' : 'ok');
  notify(failed ? '飞书写入部分失败' : '飞书写入完成', message);
});

refreshSummary().catch(() => {});
