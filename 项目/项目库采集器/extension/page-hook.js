(function () {
  const MAX_BODY = 750000;
  const isInteresting = (url, contentType) => /json|graphql|javascript/i.test(contentType || '') || /(api|graphql|feed|note|comment|video|tweet|search|recommend|timeline|dynamic)/i.test(url || '');
  const emit = (payload) => window.dispatchEvent(new CustomEvent('__project_library_network__', {detail: payload}));
  const parseAndEmit = (url, status, contentType, body) => {
    if (!url || !isInteresting(url, contentType) || !body || body.length > MAX_BODY) return;
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) { return; }
    emit({url, status, content_type: contentType || null, body: parsed, captured_at: new Date().toISOString()});
  };
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try { response.clone().text().then((body) => parseAndEmit(response.url || String(args[0]), response.status, response.headers.get('content-type'), body)).catch(() => {}); } catch (_) {}
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this.__projectLibraryUrl = url; this.__projectLibraryMethod = method; return originalOpen.call(this, method, url, ...rest); };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => parseAndEmit(this.responseURL || this.__projectLibraryUrl, this.status, this.getResponseHeader('content-type'), typeof this.responseText === 'string' ? this.responseText : ''));
    return originalSend.apply(this, args);
  };
})();
