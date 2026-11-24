// Экраны импорта операций: вставка SMS, автоимпорт через «Команды» iOS, нераспознанные сообщения.
import { state, remove, saveSettings, byId } from './store.js';
import { openSheet, toast } from './ui.js';
import { esc, money, humanDate } from './util.js';
import { icon } from './icons.js';
import { previewImport, commitImport, keepUnparsed, syncNtfy, newTopic, NTFY } from './bank.js';

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;

function catOptions(item) {
  const acc = item.accountId ? byId('accounts', item.accountId) : null;
  const scope = acc?.businessId ? 'biz' : 'personal';
  return state.categories.filter((c) => c.kind === item.type && (c.scope || 'personal') === scope)
    .map((c) => opt(c.id, c.name, c.id === item.categoryId)).join('');
}

/** Вставить SMS → предпросмотр → добавить */
export function importSheet(prefill = '') {
  let items = [];
  const close = openSheet({
    title: 'Операции из SMS',
    body: `<div class="form">
      <p class="hint">Скопируй одно или несколько SMS от банка (можно сразу пачкой) и вставь сюда. Аврора узнает карту по последним 4 цифрам, сумму, магазин и категорию, а баланс карты сверит с банком.</p>
      <textarea id="sms-text" rows="6" placeholder="Например: Покупка 350р Карта*4521 KOFEMANIYA Баланс: 12 340р">${esc(prefill)}</textarea>
      <div class="row gap">
        <button class="btn btn-ghost grow" type="button" data-paste>${icon('download', { size: 18 })} Вставить</button>
        <button class="btn btn-primary grow" type="button" data-parse>Разобрать</button>
      </div>
      <div id="sms-preview"></div>
    </div>`,
    onMount(el) {
      const ta = el.querySelector('#sms-text');
      const box = el.querySelector('#sms-preview');
      const render = () => {
        const ok = items.filter((i) => i.ok);
        const bad = items.filter((i) => !i.ok);
        const fresh = ok.filter((i) => !i.dup && !i.skip);
        box.innerHTML = !items.length ? '' : `
          ${ok.length ? `<ul class="list card">${ok.map((i, n) => `<li class="import-row ${i.dup ? 'dup' : ''}">
            <label class="check"><input type="checkbox" data-i="${n}" ${!i.dup && !i.skip ? 'checked' : ''}></label>
            <div class="grow">
              <div class="import-top"><span class="row-title">${esc(i.merchant || (i.type === 'income' ? 'Поступление' : 'Покупка'))}</span>
                <b class="${i.type === 'income' ? 'pos' : ''}">${money(i.type === 'income' ? i.amount : -i.amount, { sign: true })}</b></div>
              <span class="row-sub">${esc(humanDate(i.date))}${i.last4 ? ` · карта •${i.last4}${i.accountId ? '' : ' (новая)'}` : ''}${i.dup ? ' · уже записано' : ''}</span>
              <select data-cat="${n}" class="mini-select">${catOptions(i)}</select>
            </div></li>`).join('')}</ul>` : ''}
          ${bad.length ? `<p class="hint">Не распознано: ${bad.length}. Они сохранятся в «Нераспознанных», их можно разобрать вручную${state.settings.apiKey ? ' или с ИИ' : ''}.</p>` : ''}
          ${fresh.length ? `<button class="btn btn-primary btn-block" type="button" data-commit>Добавить ${fresh.length} ${fresh.length === 1 ? 'операцию' : fresh.length < 5 ? 'операции' : 'операций'}</button>` : ''}`;
      };
      const ok = () => items.filter((i) => i.ok);
      el.querySelector('[data-paste]').addEventListener('click', async () => {
        try { ta.value = (ta.value ? ta.value + '\n\n' : '') + await navigator.clipboard.readText(); } catch { toast('Нажми и удерживай поле, затем «Вставить»'); }
      });
      el.querySelector('[data-parse]').addEventListener('click', () => {
        items = previewImport(ta.value);
        if (!items.length) toast('Вставь текст SMS');
        render();
      });
      box.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-i]'); const sel = e.target.closest('[data-cat]');
        if (cb) { ok()[Number(cb.dataset.i)].skip = !cb.checked; if (cb.checked) ok()[Number(cb.dataset.i)].dup = false; render(); }
        if (sel) ok()[Number(sel.dataset.cat)].categoryId = sel.value;
      });
      box.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-commit]')) return;
        const { added, cardsCreated } = await commitImport(items, { source: 'paste' });
        await keepUnparsed(items.filter((i) => !i.ok).map((i) => i.raw));
        toast(`Добавлено: ${added}${cardsCreated ? ` · новых карт: ${cardsCreated}` : ''}`);
        close();
      });
      if (prefill) el.querySelector('[data-parse]').click();
    },
  });
}

/** Настройка автоимпорта через «Команды» iOS и ntfy.sh */
export function autoImportSheet() {
  const s = state.settings;
  const url = s.ntfyTopic ? `${NTFY}/${s.ntfyTopic}` : '';
  const close = openSheet({
    title: 'Автоимпорт из банка',
    body: !s.ntfyTopic ? `<div class="form">
      <p>Аврора может сама записывать операции по картам. iPhone пересылает SMS банка через автоматизацию «Команды», и при открытии Авроры они превращаются в операции.</p>
      <ul class="steps"><li>Своего сервера не нужно, всё бесплатно.</li>
        <li>Сообщения идут через открытый сервис уведомлений ntfy.sh по секретному адресу и хранятся там около 12 часов. Открывай Аврору хотя бы раз в день.</li>
        <li>Пароли и коды из SMS не нужны: пересылай только уведомления об операциях.</li></ul>
      <button class="btn btn-primary btn-block" type="button" data-enable>Включить автоимпорт</button>
    </div>` : `<div class="form">
      <label class="field"><span>Секретный адрес (не показывай никому)</span>
        <div class="row gap"><input id="ntfy-url" readonly value="${esc(url)}"><button class="icon-btn lg" type="button" data-copy aria-label="Скопировать">${icon('link', { size: 18 })}</button></div></label>
      <section class="card">
        <h3 class="card-title">Настрой «Команды» на iPhone (один раз)</h3>
        <ol class="steps">
          <li>Открой приложение <b>«Команды» → «Автоматизация» → «+» → «Сообщение»</b>.</li>
          <li>В поле <b>«Отправитель»</b> выбери банк (номер или имя, от которого приходят SMS). Отметь <b>«Выполнять сразу»</b>.</li>
          <li>Добавь действие <b>«Получить содержимое URL»</b>. URL: вставь адрес выше. Нажми «›»: <b>Метод — POST</b>, <b>Тело запроса — Файл</b>, файл — <b>«Входные данные команды» → «Содержимое»</b>.</li>
          <li>Нажми «Готово». Для другого банка сделай ещё одну такую автоматизацию.</li>
        </ol>
        <p class="hint">Платишь через Apple Pay? Добавь автоматизацию <b>«Транзакция»</b>: действие «Текст» вида «Покупка <i>Сумма</i> <i>Продавец</i> <i>Карта</i>», затем тот же «Получить содержимое URL».</p>
      </section>
      <p class="hint">${s.ntfySyncedAt ? `Последняя проверка: ${esc(new Date(s.ntfySyncedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}` : 'Ещё не проверялось'}</p>
      <div class="row gap">
        <button class="btn btn-ghost grow" type="button" data-test>Тест</button>
        <button class="btn btn-primary grow" type="button" data-sync>Проверить сейчас</button>
      </div>
      <button class="btn btn-ghost-danger btn-block" type="button" data-off>Выключить автоимпорт</button>
    </div>`,
    onMount(el) {
      el.querySelector('[data-enable]')?.addEventListener('click', async () => {
        await saveSettings({ ntfyTopic: newTopic(), ntfyLastId: null });
        close(); setTimeout(autoImportSheet, 260);
      });
      el.querySelector('[data-copy]')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast('Адрес скопирован'); } catch { el.querySelector('#ntfy-url').select(); }
      });
      el.querySelector('[data-sync]')?.addEventListener('click', () => runSync({ silent: false }));
      el.querySelector('[data-test]')?.addEventListener('click', async () => {
        try {
          const r = await fetch(url, { method: 'POST', body: 'Покупка 1 тест Карта*0000 AURORA TEST' });
          if (!r.ok) throw new Error(String(r.status));
          toast('Тест отправлен, проверяю…');
          setTimeout(() => runSync({ silent: false }), 1200);
        } catch (e) { toast(`Не удалось связаться с ntfy.sh (${e.message})`); }
      });
      el.querySelector('[data-off]')?.addEventListener('click', async () => {
        await saveSettings({ ntfyTopic: null, ntfyLastId: null }); close(); toast('Автоимпорт выключен');
      });
    },
  });
}

let syncing = false;
export async function runSync({ silent = true } = {}) {
  if (syncing || !state.settings.ntfyTopic || !navigator.onLine) return;
  syncing = true;
  try {
    const r = await syncNtfy();
    if (r.added || !silent) toast(r.added ? `Из банка добавлено операций: ${r.added}${r.unparsed ? ` · не распознано: ${r.unparsed}` : ''}` : 'Новых операций нет');
  } catch (e) {
    if (!silent) toast(`Автоимпорт: ${e.message}`);
  } finally { syncing = false; }
}

/** Нераспознанные сообщения */
export function inboxSheet() {
  const close = openSheet({
    title: 'Нераспознанные',
    body: state.inbox.length ? `<p class="hint">Эти сообщения не похожи на операцию. Можно поправить текст и разобрать снова или удалить.</p>
      <ul class="list card">${state.inbox.map((x) => `<li class="row-item inbox-row"><div class="grow"><span class="row-sub wrap">${esc(x.raw)}</span></div>
        <button class="mini-btn" data-fix="${x.id}">Разобрать</button><button class="icon-btn sm" data-del="${x.id}" aria-label="Удалить">${icon('close', { size: 14 })}</button></li>`).join('')}</ul>
      <button class="btn btn-ghost-danger btn-block" data-clear>Удалить все</button>` : '<p class="muted center pad">Пусто</p>',
    onMount(el) {
      el.addEventListener('click', async (e) => {
        const fix = e.target.closest('[data-fix]')?.dataset.fix;
        const del = e.target.closest('[data-del]')?.dataset.del;
        if (fix) { const raw = state.inbox.find((x) => x.id === fix)?.raw; await remove('inbox', fix); close(); setTimeout(() => importSheet(raw), 260); }
        if (del) { await remove('inbox', del); e.target.closest('li').remove(); }
        if (e.target.closest('[data-clear]')) { for (const x of [...state.inbox]) await remove('inbox', x.id); close(); toast('Очищено'); }
      });
    },
  });
}
