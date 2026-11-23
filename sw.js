// Service worker: кэширует оболочку приложения, чтобы Аврора открывалась без интернета.
// При каждом изменении файлов приложения увеличивай VERSION.
const VERSION = 'aurora-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/db.js',
  './js/store.js',
  './js/util.js',
  './js/ui.js',
  './js/forms.js',
  './js/charts.js',
  './js/tips.js',
  './js/ai.js',
  './js/views/today.js',
  './js/views/money.js',
  './js/views/goals.js',
  './js/views/tasks.js',
  './js/views/assistant.js',
  './js/views/settings.js',
  './js/views/onboarding.js',
  './vendor/anthropic-sdk-1.5.0.mjs',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Запросы к API (ИИ и пр.) никогда не кэшируем.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
