// 清平哨尹氏族谱 PWA Service Worker - 离线缓存壳页面
const CACHE = 'yin-family-v10.1';
const SHELL = ['/', '/style.css', '/api.js', '/tree.js', '/export.js', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  // API 请求不走缓存（需实时联网同步）
  if (e.request.url.includes('/api/')) return;
  // 其余走"缓存优先，回退网络"策略
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match('/')))
  );
});
