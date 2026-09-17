// 清平哨尹氏族谱 - 云端 API 通信封装
(function () {
  const LS_KEY = 'yin_family_server';
  const LS_TOKEN = 'yin_family_token';

  function getServerUrl() { return localStorage.getItem(LS_KEY) || ''; }
  function setServerUrl(u) { u ? localStorage.setItem(LS_KEY, u) : localStorage.removeItem(LS_KEY); }
  function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
  function setToken(t) { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); }

  async function ping(url) {
    const res = await fetch(url.replace(/\/$/, '') + '/api/ping', { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function fetchFamily(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url.replace(/\/$/, '') + '/api/family', { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  async function saveFamily(url, data, token, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url.replace(/\/$/, '') + '/api/family', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token || '' },
        body: JSON.stringify(data),
        signal: ctrl.signal
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'HTTP ' + res.status);
      return json;
    } finally { clearTimeout(timer); }
  }

  window.FamilyAPI = { getServerUrl, setServerUrl, getToken, setToken, ping, fetchFamily, saveFamily };
})();