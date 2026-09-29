window.addEventListener('__project_library_network__', (event) => {
  const detail = event.detail;
  if (!detail || !detail.url) return;
  chrome.runtime.sendMessage({type: 'networkResponse', payload: detail}).catch(() => {});
});
