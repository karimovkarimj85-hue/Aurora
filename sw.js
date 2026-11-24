// Service worker Авроры: офлайн-режим и самообновление.
// Сеть в приоритете (с откатом на кэш), поэтому новая версия приходит сама — без переустановки.
// При каждом изменении файлов приложения меняй VERSION здесь и APP_VERSION в js/version.js.
const VERSION = 'aurora-v4.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/version.js',
  './js/update.js',
  './js/db.js',
  './js/store.js',
  './js/util.js',
  './js/ui.js',
  './js/forms.js',
  './js/bizforms.js',
  './js/icons.js',
  './js/motion.js',
  './js/bank.js',
  './js/bankui.js',
  './js/deals.js',
  './js/quick.js',
  './js/charts.js',
  './js/tips.js',
  './js/ai.js',
  './js/views/today.js',
  './js/views/money.js',
  './js/views/goals.js',
  './js/views/tasks.js',
  './js/views/business.js',
  './js/views/assistant.js',
  './js/views/settings.js',
  './js/views/onboarding.js',
  './vendor/anthropic-sdk-1.5.0.mjs',
  './icons/icon.svg',
  './icons/wordmark-black.svg',
  './icons/wordmark-white.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Новая версия ставится и включается сразу, не дожидаясь закрытия старых вкладок
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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

const NETWORK_TIMEOUT = 3000;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Запросы к внешним сервисам (ИИ, ntfy) не трогаем
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

/** Сначала сеть (с проверкой свежести), при её отсутствии или задержке > 3 с — кэш */
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const fromNetwork = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  fromNetwork.catch(() => {}); // офлайн — не ошибка
  const cached = cache.match(req, { ignoreSearch: true });
  try {
    return await Promise.race([
      fromNetwork,
      new Promise((resolve, reject) => setTimeout(async () => {
        const hit = await cached;
        if (hit) resolve(hit); else reject(new Error('timeout'));
      }, NETWORK_TIMEOUT)),
    ]);
  } catch {
    const hit = await cached;
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    try { return await fromNetwork; } catch { return Response.error(); }
  }
}
