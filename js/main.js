// Точка входа: загрузка данных, маршрутизация по вкладкам, обработка нажатий.
import { load, state, subscribe } from './store.js';
import { toast } from './ui.js';
import * as today from './views/today.js';
import * as money from './views/money.js';
import * as goals from './views/goals.js';
import * as tasks from './views/tasks.js';
import * as assistant from './views/assistant.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';

const TABS = [
  ['today', '☀️', 'Сегодня', today],
  ['money', '💰', 'Деньги', money],
  ['goals', '🎯', 'Цели', goals],
  ['tasks', '✅', 'Задачи', tasks],
  ['ai', '✨', 'Аврора', assistant],
];
const ROUTES = {
  ...Object.fromEntries(TABS.map(([id, , , mod]) => [id, mod])),
  settings,
  archive: settings.archive,
};

const viewEl = document.getElementById('view');
const tabbarEl = document.getElementById('tabbar');
let current = null;

function route() {
  if (!state.settings.onboarded) return 'onboarding';
  const r = location.hash.replace('#', '');
  return ROUTES[r] ? r : 'today';
}

function renderTabbar(r) {
  const visible = r !== 'onboarding';
  tabbarEl.hidden = !visible;
  document.body.classList.toggle('no-tabbar', !visible);
  if (!visible) return;
  const activeTab = r === 'settings' || r === 'archive' ? 'today' : r;
  tabbarEl.innerHTML = TABS.map(([id, icon, label]) => `
    <a href="#${id}" class="tab ${id === activeTab ? 'on' : ''}" ${id === activeTab ? 'aria-current="page"' : ''}>
      <span class="tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('');
}

function render({ keepScroll = false } = {}) {
  const r = route();
  const mod = r === 'onboarding' ? onboarding : ROUTES[r];
  const changed = current !== r;
  const y = window.scrollY;
  current = r;
  document.body.dataset.route = r;
  viewEl.innerHTML = mod.render();
  mod.mount?.(viewEl, () => render({ keepScroll: true }));
  renderTabbar(r);
  if (changed) window.scrollTo(0, 0);
  else if (keepScroll) window.scrollTo(0, y);
}

// Делегирование кликов: data-action ищется сначала в текущем экране, затем глобально
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const name = el.dataset.action;
  if (name === 'nav') {
    e.preventDefault();
    location.hash = '#' + el.dataset.to;
    return;
  }
  const r = route();
  const mod = r === 'onboarding' ? onboarding : ROUTES[r];
  const fn = mod.actions?.[name];
  if (fn) {
    e.preventDefault();
    fn(el, e, () => render({ keepScroll: true }), viewEl);
  }
});

window.addEventListener('hashchange', () => render());

// Перерисовка при изменении данных (чат перерисовывает себя сам)
let raf = 0;
subscribe(() => {
  const mod = ROUTES[route()];
  if (route() !== 'onboarding' && mod?.keepAlive) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => render({ keepScroll: true }));
});

// Новый день — обновить «Сегодня», когда приложение возвращается из фона
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    render({ keepScroll: true });
  }
});

async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Доступна новая версия Авроры', { action: 'Обновить', ms: 15000, onAction: () => sw.postMessage('skipWaiting') });
        }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return; reloaded = true; location.reload();
    });
  } catch (e) {
    console.warn('SW не зарегистрирован', e);
  }
}

(async function start() {
  try {
    await load();
    // Просим браузер не удалять данные при нехватке места
    navigator.storage?.persist?.().catch(() => {});
    render();
    registerSW();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="empty"><div class="empty-emoji">⚠️</div><h3>Не удалось загрузить данные</h3><p class="muted">${e.message}</p></div>`;
  }
}());
