// Самообновление Авроры через service worker.
import { toast } from './ui.js';
import { APP_VERSION } from './version.js';

// ---------- Самообновление ----------
// Новая версия скачивается сама: при запуске, при возвращении в приложение и каждые 30 минут.
// Как только она готова, Аврора тихо перезагружается в момент, когда ты ничего не вводишь.
let swReg = null;
let pendingReload = false;

function safeToReload() {
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  return !typing && !document.body.classList.contains('sheet-open');
}

function reloadWhenSafe() {
  pendingReload = true;
  const attempt = () => {
    if (!pendingReload) return;
    if (document.visibilityState === 'hidden' || safeToReload()) {
      pendingReload = false;
      try { sessionStorage.setItem('aurora-updated', '1'); } catch { /* приватный режим */ }
      location.reload();
    } else setTimeout(attempt, 1500);
  };
  attempt();
}

export async function checkForUpdate({ manual = false } = {}) {
  if (!swReg) return 'none';
  try {
    await swReg.update();
    if (swReg.installing || swReg.waiting) {
      swReg.waiting?.postMessage('skipWaiting');
      if (manual) toast('Скачиваю новую версию…');
      return 'updating';
    }
    if (manual) toast(`У тебя последняя версия ${APP_VERSION}`);
    return 'latest';
  } catch {
    if (manual) toast('Нет связи — проверю позже');
    return 'offline';
  }
}

export async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    swReg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    swReg.waiting?.postMessage('skipWaiting'); // версия, застрявшая в ожидании со старых сборок
    swReg.addEventListener('updatefound', () => {
      const sw = swReg.installing;
      sw?.addEventListener('statechange', () => { if (sw.state === 'installed') sw.postMessage('skipWaiting'); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) reloadWhenSafe(); // при самой первой установке перезагружать не нужно
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    setInterval(() => checkForUpdate(), 30 * 60 * 1000);
  } catch (e) {
    console.warn('SW не зарегистрирован', e);
  }
}

export function announceUpdate() {
  try {
    if (sessionStorage.getItem('aurora-updated')) {
      sessionStorage.removeItem('aurora-updated');
      setTimeout(() => toast(`Аврора обновлена до версии ${APP_VERSION}`), 600);
    }
  } catch { /* приватный режим */ }
}
