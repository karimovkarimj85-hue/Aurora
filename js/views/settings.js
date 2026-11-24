import {
  state, saveSettings, exportData, importData, resetAll, archived, save, remove, piggySaved, active, byId,
} from '../store.js';
import { businessForm } from '../bizforms.js';
import { wordmark } from '../icons.js';
import { icon } from '../icons.js';
import { esc, CURRENCIES, today, money, humanDate } from '../util.js';
import { toast, confirmSheet, openSheet } from '../ui.js';
import { MODELS, EFFORTS, testKey } from '../ai.js';

export function render() {
  const s = state.settings;
  const archCount = ['goals', 'tasks', 'piggies', 'accounts', 'businesses', 'deals'].reduce((n, c) => n + archived(c).length, 0);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
  <header class="page-head"><button class="icon-btn lg" data-action="nav" data-to="today" aria-label="Назад">${icon('back', { size: 20, w: 2.2 })}</button><h1 class="grow">Настройки</h1></header>

  ${standalone ? '' : `<section class="card install">
    <h3>Установи Аврору на iPhone</h3>
    <ol class="steps">
      <li>Открой этот сайт в <b>Safari</b>.</li>
      <li>Нажми кнопку <b>«Поделиться»</b> (квадрат со стрелкой).</li>
      <li>Выбери <b>«На экран „Домой“»</b> → «Добавить».</li>
    </ol>
    <p class="hint">После установки Аврора открывается как обычное приложение и работает без интернета.</p>
  </section>`}

  <form class="card form" id="profile-form">
    <h3 class="card-title">Профиль</h3>
    <label class="field"><span>Как к тебе обращаться</span><input name="name" value="${esc(s.name)}" placeholder="Имя"></label>
    <label class="field"><span>Валюта</span><select name="currency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === s.currency ? 'selected' : ''}>${c.symbol} — ${c.name}</option>`).join('')}</select></label>
    <label class="field"><span>Оформление</span><select name="theme">${[['system', 'Как в системе'], ['light', 'Светлое'], ['dark', 'Тёмное']].map(([v, l]) => `<option value="${v}" ${v === (s.theme || 'system') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn btn-primary btn-block" type="submit">Сохранить</button>
  </form>

  <section class="card">
    <h3 class="card-title">Мои бизнесы</h3>
    <ul class="list">${active('businesses').map((b) => `<li class="row-item" data-action="edit-biz" data-id="${b.id}" style="padding-left:0;padding-right:0">
      <span class="biz-mono" style="--c:${b.color};width:32px;height:32px;font-size:12px">${esc(b.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>
      <div class="grow"><span class="row-title">${esc(b.name)}</span><span class="row-sub">${esc(b.about || '')}</span></div>${icon('chevron', { size: 16, cls: 'muted' })}</li>`).join('')}</ul>
    <button class="btn btn-ghost btn-block" data-action="add-biz">＋ Добавить бизнес</button>
  </section>

  <form class="card form" id="ai-form">
    <h3 class="card-title">ИИ (Claude)</h3>
    <label class="field"><span>Ключ API Anthropic</span>
      <input name="apiKey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.apiKey)}" placeholder="sk-ant-..."></label>
    <div class="hint ai-explain">
      <p><b>Подписка Claude и ключ API — разные вещи.</b> Подписка (Pro/Max) работает в приложении Claude, и Аврора пользуется ею через кнопку «Спросить Claude»: собирает сводку и открывает Claude. Взять ключ из подписки нельзя, и я не могу создать его за тебя.</p>
      <p>Чтобы ИИ работал прямо внутри Авроры (сам записывал траты из фото, вёл сделки из чата), нужен отдельный ключ: <b>platform.claude.com → Billing</b> (пополнить от $5) → <b>API Keys → Create Key</b>. Ключ хранится только на этом телефоне и отправляется напрямую в Anthropic.</p>
      <p>Без ключа работает умный ввод: «кофе 350», «вес 82,4», SMS банка.</p>
    </div>
    <label class="field"><span>Модель</span><select name="model">${MODELS.map((m) => `<option value="${m.id}" ${m.id === s.model ? 'selected' : ''}>${m.name} — ${m.note}</option>`).join('')}</select></label>
    <label class="field"><span>Глубина ответов</span><select name="effort">${EFFORTS.map((e) => `<option value="${e.id}" ${e.id === s.effort ? 'selected' : ''}>${e.name} — ${e.note}</option>`).join('')}</select></label>
    <div class="row gap">
      <button class="btn btn-ghost grow" type="button" data-action="test-key">Проверить</button>
      <button class="btn btn-primary grow" type="submit">Сохранить</button>
    </div>
  </form>

  <section class="card">
    <h3 class="card-title">Данные</h3>
    <p class="hint">Все данные хранятся только на этом устройстве. Делай резервную копию раз в неделю и сохраняй её в «Файлы → iCloud Drive».</p>
    <button class="btn btn-ghost btn-block" data-action="export">Сохранить резервную копию</button>
    <label class="btn btn-ghost btn-block">Восстановить из копии<input type="file" accept="application/json,.json" id="import-input" hidden></label>
    <button class="btn btn-ghost btn-block" data-action="nav" data-to="archive">Архив${archCount ? ` (${archCount})` : ''}</button>
    <button class="btn btn-ghost-danger btn-block" data-action="reset">Стереть все данные</button>
  </section>

  <div class="brand-foot">${wordmark(140)}<p class="brand-sub">BY GAIN TECH · версия 3.0</p><p class="muted small">Данные хранятся только на этом устройстве</p></div>`;
}

export function mount(container) {
  container.querySelector('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await saveSettings({ name: d.name.trim(), currency: d.currency, theme: d.theme });
    toast('Сохранено');
  });
  container.querySelector('#ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    await saveSettings({ apiKey: d.apiKey.trim(), model: d.model, effort: d.effort });
    toast('Настройки ИИ сохранены');
  });
  container.querySelector('#import-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (await confirmSheet('Восстановить данные?', 'Текущие данные будут заменены данными из копии.', { ok: 'Восстановить', danger: false })) {
        await importData(data);
        toast('Данные восстановлены');
      }
    } catch (err) {
      toast(err.message || 'Не удалось прочитать файл');
    }
    e.target.value = '';
  });
}

export const actions = {
  'add-biz': () => businessForm(),
  'edit-biz': (el) => businessForm(byId('businesses', el.dataset.id)),
  'test-key': async (el) => {
    const form = el.closest('form');
    const key = form.apiKey.value.trim();
    if (!key) { toast('Вставь ключ'); return; }
    el.disabled = true; el.textContent = 'Проверяю…';
    const r = await testKey(key, form.model.value);
    el.disabled = false; el.textContent = 'Проверить';
    toast(r.ok ? 'Ключ работает' : r.error, { ms: 5000 });
  },
  export: async () => {
    const json = JSON.stringify(exportData(), null, 1);
    const name = `aurora-backup-${today()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Резервная копия Авроры' });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  reset: async () => {
    if (await confirmSheet('Стереть всё?', 'Все счета, операции, цели, задачи и переписка будут удалены. Сначала сохрани резервную копию!', { ok: 'Стереть всё' })) {
      await resetAll();
      toast('Данные стёрты');
      location.hash = '#today';
    }
  },
};

// ---------------- Архив ----------------

const ARCH_SECTIONS = [
  ['goals', 'Цели', (x) => x.title],
  ['piggies', 'Копилки', (x) => `${x.name} · ${money(piggySaved(x.id))}`],
  ['tasks', 'Задачи', (x) => `${x.title}${x.doneAt ? ' · ' + humanDate(x.doneAt.slice(0, 10)) : ''}`],
  ['accounts', 'Счета', (x) => x.name],
  ['businesses', 'Бизнесы', (x) => x.name],
  ['deals', 'Сделки', (x) => `${x.title} · ${money(x.amount)}`],
];

export const archive = {
  render() {
    const sections = ARCH_SECTIONS.map(([c, title, label]) => {
      const items = archived(c);
      if (!items.length) return '';
      return `<h2 class="section-title">${title}</h2><ul class="list card">${items.map((x) => `
        <li class="row-item" data-action="arch-open" data-c="${c}" data-id="${x.id}">
          <div class="grow"><span class="row-title">${esc(label(x))}</span></div><span class="muted">›</span></li>`).join('')}</ul>`;
    }).join('');
    return `<header class="page-head"><button class="icon-btn lg" data-action="nav" data-to="settings" aria-label="Назад">${icon('back', { size: 20, w: 2.2 })}</button><h1 class="grow">Архив</h1></header>
      ${sections || '<p class="muted center pad">Архив пуст. Сюда попадают завершённые цели, копилки и задачи.</p>'}`;
  },
  actions: {
    'arch-open': (el) => {
      const c = el.dataset.c; const item = state[c].find((x) => x.id === el.dataset.id);
      if (!item) return;
      const close = openSheet({
        title: 'Из архива',
        body: `<p>${esc(ARCH_SECTIONS.find((s) => s[0] === c)[2](item))}</p>
          <button class="btn btn-primary btn-block" data-restore>Вернуть</button>
          <button class="btn btn-ghost-danger btn-block" data-delete>Удалить навсегда</button>`,
        onMount(sheet) {
          sheet.querySelector('[data-restore]').onclick = async () => { await save(c, { ...item, archived: false }); close(); toast('Возвращено'); };
          sheet.querySelector('[data-delete]').onclick = async () => {
            if (c === 'accounts' && state.transactions.some((t) => t.accountId === item.id || t.toAccountId === item.id)) {
              toast('По счёту есть операции — его нельзя удалить'); return;
            }
            if (c === 'piggies' && piggySaved(item.id) > 0) { toast('В копилке есть деньги — сначала забери их'); return; }
            if (await confirmSheet('Удалить навсегда?', 'Восстановить будет нельзя.')) { await remove(c, item.id); close(); toast('Удалено'); }
          };
        },
      });
    },
  },
};
