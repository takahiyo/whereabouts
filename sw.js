const CACHE_NAME = 'whereabouts-v2'; // バージョンを更新
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './js/config.js',
  './js/globals.js',
  './js/utils.js',
  './js/tools.js',
  './js/auth.js',
  './js/sync.js',
  './js/notices.js',
  './js/vacations.js',
  './js/offices.js',
  './js/layout.js',
  './js/filters.js',
  './js/board.js',
  './js/admin.js',
  './js/bootstrap.js', // 新しいエントリーポイント
  // 外部ライブラリ (CDN)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
