// Точка входа: загрузка данных, маршрутизация по вкладкам, обработка нажатий.
import { load, state, subscribe, seedBusinesses } from './store.js';
import { icon } from './icons.js';
import { registerSW, announceUpdate } from './update.js';
import { runSync } from './bankui.js';
import * as today from './views/today.js';
import * as money from './views/money.js';
import * as goals from './views/goals.js';
import * as tasks from './views/tasks.js';
import * as business from './views/business.js';
import * as assistant from './views/assistant.js';
import * as settings from './views/settings.js';
import * as onboarding from './views/onboarding.js';

const TABS = [
  ['today', 'today', 'Сегодня', today],
  ['money', 'wallet', 'Деньги', money],
  ['business', 'briefcase', 'Бизнес', business],
  ['goals', 'target', 'Цели', goals],
  ['ai', 'sparkles', 'Аврора', assistant],
];
const ROUTES = {
  ...Object.fromEntries(TABS.map(([id, , , mod]) => [id, mod])),
  tasks,
  settings,
  archive: settings.archive,
};
// Экраны без своей вкладки подсвечивают родительскую
const PARENT = { tasks: 'today', settings: 'today', archive: 'today' };

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
  const activeTab = PARENT[r] || r;
  tabbarEl.innerHTML = `<div class="tabbar-inner">${TABS.map(([id, ic, label]) => `
    <a href="#${id}" class="tab ${id === activeTab ? 'on' : ''}" ${id === activeTab ? 'aria-current="page"' : ''}>
      ${icon(ic, { size: 24, w: id === activeTab ? 2.1 : 1.7, cls: 'tab-icon' })}<span>${label}</span></a>`).join('')}</div>`;
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
  if (document.visibilityState === 'visible') runSync();
  if (document.visibilityState === 'visible' && new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    render({ keepScroll: true });
  }
});

// На iOS :active срабатывает мгновенно только при наличии touchstart-слушателя
document.addEventListener('touchstart', () => {}, { passive: true });

let lastTheme = null;
export function applyTheme() {
  const t = state.settings.theme || 'system';
  if (lastTheme && lastTheme !== t) {
    document.documentElement.classList.add('theme-fade');
    setTimeout(() => document.documentElement.classList.remove('theme-fade'), 350);
  }
  lastTheme = t;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}
subscribe(applyTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

(async function start() {
  try {
    await load();
    applyTheme();
    if (state.settings.onboarded) await seedBusinesses();
    setTimeout(runSync, 800); // забрать операции из банка, если включён автоимпорт
    // Просим браузер не удалять данные при нехватке места
    navigator.storage?.persist?.().catch(() => {});
    render();
    registerSW();
    announceUpdate();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="empty"><div class="empty-icon">${icon('warning', { size: 30 })}</div><h3>Не удалось загрузить данные</h3><p class="muted">${e.message}</p></div>`;
  }
}());
