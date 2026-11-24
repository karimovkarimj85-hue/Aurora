// Экраны импорта операций: вставка SMS, автоимпорт через «Команды» iOS, нераспознанные сообщения.
import { state, remove, saveSettings, byId, personalAccounts, isNeutral } from './store.js';
import { openSheet, toast } from './ui.js';
import { esc, money, humanDate } from './util.js';
import { icon } from './icons.js';
import { previewImport, commitImport, keepUnparsed, syncNtfy, newTopic, NTFY, unknownCards, linkCard } from './bank.js';

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
  let links = {}; // последние 4 цифры → id счёта или 'new'
  const close = openSheet({
    title: 'Операции из SMS',
    body: `<div class="form">
      <p class="hint">Скопируй одно или несколько SMS от банка (можно сразу пачкой) и вставь сюда. Аврора узнает карту по последним 4 цифрам, сумму, магазин и категорию, а баланс карты сверит с банком. Коды подтверждения пропускаются и не сохраняются.</p>
      <textarea id="sms-text" rows="6" placeholder="Например: HUMOCARD *5220: oplata 4900.00 UZS; PAYME…; Dostupno: 189100.00 UZS">${esc(prefill)}</textarea>
      <div class="row gap">
        <button class="btn btn-ghost grow" type="button" data-paste>${icon('download', { size: 18 })} Вставить</button>
        <button class="btn btn-primary grow" type="button" data-parse>Разобрать</button>
      </div>
      <div id="sms-preview"></div>
    </div>`,
    onMount(el) {
      const ta = el.querySelector('#sms-text');
      const box = el.querySelector('#sms-preview');
      const ok = () => items.filter((i) => i.ok);
      const cardsToLink = () => unknownCards(items);
      const linkable = () => personalAccounts().filter((a) => a.type === 'card' && !a.last4);
      const render = () => {
        const good = ok();
        const bad = items.filter((i) => !i.ok && !i.otp);
        const otp = items.filter((i) => i.otp).length;
        const fresh = good.filter((i) => !i.dup && !i.skip);
        const unknown = cardsToLink();
        box.innerHTML = !items.length ? '' : `
          ${unknown.length ? `<section class="card link-cards"><h3 class="card-title">Новые карты в сообщениях</h3>
            ${unknown.map((u) => `<label class="field"><span>Карта •${u.last4}${u.label ? ` · ${esc(u.label)}` : ''} — это</span>
              <select data-link="${u.last4}">${opt('new', `Новая карта «${u.label || 'Карта'} •${u.last4}»`, (links[u.last4] || 'new') === 'new')}${linkable().map((a) => opt(a.id, `${a.name}${a.bank && a.bank !== a.name ? ` (${a.bank})` : ''}`, links[u.last4] === a.id)).join('')}</select></label>`).join('')}
            <p class="hint">Привяжи номер к своей карте один раз, дальше Аврора будет узнавать её сама.</p></section>` : ''}
          ${good.length ? `<ul class="list card">${good.map((i, n) => {
            const neutral = isNeutral(i.categoryId);
            const note = i.attempt ? 'Это 3D-код, то есть попытка оплаты. Отметь, если деньги действительно списались.' : neutral ? 'Перемещение своих денег, в расходы и доходы не входит.' : '';
            return `<li class="import-row ${i.dup ? 'dup' : ''}">
            <label class="check"><input type="checkbox" data-i="${n}" ${!i.dup && !i.skip ? 'checked' : ''}></label>
            <div class="grow">
              <div class="import-top"><span class="row-title">${esc(i.merchant || (i.type === 'income' ? 'Поступление' : 'Покупка'))}</span>
                <b class="${i.type === 'income' && !neutral ? 'pos' : neutral ? 'muted' : ''}">${money(i.type === 'income' ? i.amount : -i.amount, { sign: true })}</b></div>
              <span class="row-sub">${esc(humanDate(i.date))}${i.time ? ` ${i.time}` : ''}${i.last4 ? ` · •${i.last4}` : ''}${i.dup ? ' · уже записано' : ''}</span>
              ${note ? `<span class="row-note">${note}</span>` : ''}
              <select data-cat="${n}" class="mini-select">${catOptions(i)}</select>
            </div></li>`;
          }).join('')}</ul>` : ''}
          ${otp ? `<p class="hint">Коды подтверждения пропущены и не сохранены: ${otp}.</p>` : ''}
          ${bad.length ? `<p class="hint">Не распознано: ${bad.length}. Они сохранятся в «Нераспознанных», их можно поправить и разобрать снова.</p>` : ''}
          ${fresh.length ? `<button class="btn btn-primary btn-block" type="button" data-commit>Добавить ${fresh.length} ${fresh.length === 1 ? 'операцию' : fresh.length < 5 ? 'операции' : 'операций'}</button>` : ''}`;
      };
      el.querySelector('[data-paste]').addEventListener('click', async () => {
        try { ta.value = (ta.value ? ta.value + '\n\n' : '') + await navigator.clipboard.readText(); } catch { toast('Нажми и удерживай поле, затем «Вставить»'); }
      });
      el.querySelector('[data-parse]').addEventListener('click', () => {
        items = previewImport(ta.value);
        links = {};
        if (!items.length) toast('Вставь текст SMS');
        render();
      });
      box.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-i]'); const sel = e.target.closest('[data-cat]'); const link = e.target.closest('[data-link]');
        if (cb) { ok()[Number(cb.dataset.i)].skip = !cb.checked; if (cb.checked) ok()[Number(cb.dataset.i)].dup = false; render(); }
        if (sel) { ok()[Number(sel.dataset.cat)].categoryId = sel.value; render(); }
        if (link) links[link.dataset.link] = link.value;
      });
      box.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-commit]');
        if (!btn) return;
        btn.disabled = true;
        for (const u of cardsToLink()) {
          const target = links[u.last4];
          if (target && target !== 'new') {
            await linkCard(target, u.last4, u.label);
            for (const it of items) if (it.last4 === u.last4) it.accountId = target;
          }
        }
        const { added, cardsCreated } = await commitImport(items, { source: 'paste' });
        await keepUnparsed(items.filter((i) => !i.ok && !i.otp).map((i) => i.raw));
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
          <li>В поле <b>«Отправитель»</b> выбери банк: для карты HUMO это <b>13131</b>. В поле <b>«Сообщение содержит»</b> впиши <b>Dostupno</b>, тогда пересылаются только операции, а коды — никогда. Отметь <b>«Выполнять сразу»</b>.</li>
          <li>Добавь действие <b>«Получить содержимое URL»</b>. URL: вставь адрес выше. Нажми «›»: <b>Метод — POST</b>, <b>Тело запроса — Файл</b>, файл — <b>«Входные данные команды» → «Содержимое»</b>.</li>
          <li>Нажми «Готово». Если TBC присылает SMS об операциях, сделай для него такую же автоматизацию.</li>
        </ol>
        <p class="hint"><b>Tez</b> присылает только 3D-коды для подтверждения оплаты — их не пересылай: это одноразовые пароли. Покупки по Tez добавляй вставкой SMS или фразой в чате.</p>
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
