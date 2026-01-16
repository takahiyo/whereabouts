// Service Worker for Whereabouts (Optimized v2)
const CACHE_NAME = 'whereabouts-v2-optimized';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './js/config.js',
  './js/globals.js',
  './js/utils.js',
  './js/layout.js',
  './js/filters.js',
  './js/board.js',
  './js/vacations.js',
  './js/offices.js',
  './js/auth.js',
  './js/sync.js',
  './js/admin.js',
  './js/tools.js',
  './js/notices.js',
  './manifest.json',
  './assets/icon_BookReader_192.png',
  './assets/icon_BookReader_512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 失敗してもインストール自体は続行させる（一部ファイルが無い場合など）
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.error('Cache addAll failed:', err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ネットワーク優先（HTMLは常に no-store で最新取得を試みる）
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // HTMLナビゲーションは常に最新
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    e.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./index.html') || await cache.match('/');
        return cached || new Response('<!doctype html><title>オフライン</title><h1>オフライン</h1><p>ネットワーク接続を確認してください。</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // それ以外も原則ネットワーク優先＋no-store（必要ならキャッシュに落とす）
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      return res;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      throw new Error('offline');
    }
  })());
});
