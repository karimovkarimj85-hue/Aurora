// Формы в шторках: операции, счета, копилки, цели, замеры, задачи, экранное время.
import {
  state, save, remove, byId, active, accountBalance, piggySaved, METRIC_PRESETS, upsertMetric,
  personalAccounts,
} from './store.js';
import { icon, piggyIcon, PIGGY_ICONS, catIcon } from './icons.js';
import { learnRule } from './bank.js';
import { openSheet, toast, confirmSheet } from './ui.js';
import { esc, today, parseAmount, money, currency } from './util.js';

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const amountInput = (name, value = '', { autofocus = false, label = 'Сумма', required = true } = {}) => `
  <label class="field">
    <span>${label}</span>
    <div class="amount-wrap">
      <input name="${name}" class="amount" inputmode="decimal" autocomplete="off" placeholder="0"
        value="${value === '' || value == null ? '' : esc(value)}" ${autofocus ? 'autofocus' : ''} ${required ? 'required' : ''}>
      <span class="amount-cur">${esc(currency())}</span>
    </div>
  </label>`;

function requireAmount(v, { allowZero = false } = {}) {
  const n = parseAmount(v);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error('Введи корректную сумму');
  return n;
}

async function confirmDelete(what, collection, id, close) {
  if (await confirmSheet('Удалить?', `${what} будет удалено без возможности восстановления.`)) {
    await remove(collection, id);
    close?.();
    toast('Удалено');
  }
}

// ---------------- Операция ----------------

export function txForm(existing = null, presetType = 'expense', { businessId = null, preset = {} } = {}) {
  const bizId = existing ? existing.businessId || null : businessId;
  const biz = bizId ? byId('businesses', bizId) : null;
  const own = bizId ? active('accounts').filter((a) => a.businessId === bizId) : personalAccounts();
  const allAcc = active('accounts');
  const t = existing || { type: presetType, date: today(), accountId: own[0]?.id, ...preset };
  if (!own.length) {
    toast('Сначала добавь счёт или кошелёк');
    return accountForm();
  }
  // Для перевода можно выбрать любой счёт (например, вывести прибыль из бизнеса на личную карту)
  const accounts = t.type === 'transfer' ? allAcc : own;
  const scope = bizId ? 'biz' : 'personal';
  const defaultTo = t.toAccountId || allAcc.find((a) => a.id !== t.accountId && (bizId ? !a.businessId : true))?.id;
  const accOptions = (list, sel) => list.map((a) => opt(a.id, `${a.name} · ${money(accountBalance(a.id))}`, a.id === sel)).join('');
  const catsFor = (kind) => state.categories.filter((c) => c.kind === kind && (c.scope || 'personal') === scope);
  const catChips = (kind, sel) => catsFor(kind).map((c) => `
    <label class="chip-radio"><input type="radio" name="categoryId" value="${c.id}" ${c.id === sel ? 'checked' : ''}>
      <span>${icon(catIcon(c), { size: 16, w: 1.9 })} ${esc(c.name)}</span></label>`).join('');

  openSheet({
    title: biz ? `${existing ? 'Операция' : 'Операция'} · ${biz.name}` : (existing ? 'Операция' : 'Новая операция'),
    body: `<form class="form" novalidate>
      <div class="segmented" role="radiogroup">
        ${[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']].map(([v, l]) => `
          <label><input type="radio" name="type" value="${v}" ${t.type === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      ${amountInput('amount', t.amount, { autofocus: !existing })}
      <div class="field cats" data-show="expense income">
        <span>Категория</span>
        <div class="chips" data-cats>${catChips(t.type === 'income' ? 'income' : 'expense', t.categoryId)}</div>
      </div>
      <label class="field"><span data-acc-label>${t.type === 'transfer' ? 'Откуда' : 'Счёт'}</span>
        <select name="accountId" data-acc data-all="${t.type === 'transfer'}">${accOptions(accounts, t.accountId)}</select></label>
      <label class="field" data-show="transfer"><span>Куда</span>
        <select name="toAccountId">${allAcc.map((a) => opt(a.id, a.name, a.id === defaultTo)).join('')}</select></label>
      <div class="row gap">
        <label class="field grow"><span>Дата</span><input type="date" name="date" value="${esc(t.date)}" required></label>
      </div>
      <label class="field"><span>Комментарий</span><input name="note" value="${esc(t.note || '')}" placeholder="Например: обед с другом"></label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? '<button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить операцию</button>' : ''}
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const sync = () => {
        const type = form.type.value;
        el.querySelectorAll('[data-show]').forEach((n) => { n.hidden = !n.dataset.show.split(' ').includes(type); });
        el.querySelector('[data-acc-label]').textContent = type === 'transfer' ? 'Откуда' : 'Счёт';
        const accSel = el.querySelector('[data-acc]');
        const wantAll = type === 'transfer';
        if (accSel.dataset.all !== String(wantAll)) {
          const cur = accSel.value;
          accSel.innerHTML = accOptions(wantAll ? allAcc : own, cur);
          if (!accSel.value) accSel.value = own[0]?.id;
          accSel.dataset.all = String(wantAll);
        }
        const kind = type === 'income' ? 'income' : 'expense';
        const box = el.querySelector('[data-cats]');
        if (box.dataset.kind !== kind) {
          const cur = form.querySelector('input[name=categoryId]:checked')?.value;
          box.innerHTML = catChips(kind, cur || (kind === 'expense' ? t.categoryId : null));
          box.dataset.kind = kind;
        }
      };
      el.querySelector('[data-cats]').dataset.kind = t.type === 'income' ? 'income' : 'expense';
      form.addEventListener('change', sync);
      sync();
      el.querySelector('[data-del]')?.addEventListener('click', () => confirmDelete('Операция', 'transactions', existing.id, close));
    },
    async onSubmit(d) {
      const amount = requireAmount(d.amount);
      const item = { ...(existing || {}), ...preset, type: d.type, amount, accountId: d.accountId, date: d.date || today(), note: d.note.trim() };
      if (bizId) item.businessId = bizId;
      if (d.type === 'transfer') {
        if (d.toAccountId === d.accountId) throw new Error('Выбери разные счета');
        item.toAccountId = d.toAccountId; delete item.categoryId;
      } else {
        item.categoryId = d.categoryId || (bizId ? (d.type === 'income' ? 'biz_in_other' : 'biz_other') : (d.type === 'income' ? 'other_in' : 'other'));
        delete item.toAccountId;
      }
      await save('transactions', item);
      if (existing?.merchant && item.categoryId && item.categoryId !== existing.categoryId) await learnRule(existing.merchant, item.categoryId);
      toast(existing ? 'Сохранено' : `${d.type === 'income' ? 'Доход' : d.type === 'transfer' ? 'Перевод' : 'Расход'} ${money(amount)} записан`);
    },
  });
}

// ---------------- Счёт ----------------

export function accountForm(existing = null, { businessId = null } = {}) {
  const a = existing || { type: 'card', businessId };
  const balance = existing ? accountBalance(existing.id) : '';
  openSheet({
    title: existing ? 'Счёт' : 'Новый счёт',
    body: `<form class="form">
      <label class="field"><span>Название</span><input name="name" value="${esc(a.name || '')}" placeholder="Например: Наличные, Карта Сбер" required autofocus></label>
      <div class="segmented">
        ${[['cash', 'Наличные'], ['card', 'Карта'], ['savings', 'Вклад']].map(([v, l]) => `
          <label><input type="radio" name="type" value="${v}" ${a.type === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <div class="row gap" data-cardonly>
        <label class="field grow"><span>Банк</span><input name="bank" value="${esc(a.bank || '')}" placeholder="Например: Kapitalbank"></label>
        <label class="field" style="width:120px"><span>Последние 4 цифры</span><input name="last4" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${esc(a.last4 || '')}" placeholder="1234" class="center"></label>
      </div>
      <p class="hint" data-cardonly>По последним 4 цифрам Аврора узнаёт карту в SMS банка и сама записывает операции.</p>
      ${amountInput('balance', balance, { label: 'Текущий баланс', allowZero: true, required: false })}
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>В архив</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить счёт</button>` : ''}
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const sync = () => el.querySelectorAll('[data-cardonly]').forEach((n) => { n.hidden = form.querySelector('input[name=type]:checked')?.value !== 'card'; });
      form.addEventListener('change', sync); sync();
      el.querySelector('[data-arch]')?.addEventListener('click', async () => {
        await save('accounts', { ...existing, archived: true }); close(); toast('Счёт в архиве');
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (state.transactions.some((t) => t.accountId === existing.id || t.toAccountId === existing.id)) {
          toast('По счёту есть операции — отправь его в архив'); return;
        }
        confirmDelete('Счёт', 'accounts', existing.id, close);
      });
    },
    async onSubmit(d) {
      const desired = d.balance === '' ? 0 : requireAmount(d.balance, { allowZero: true });
      const item = { ...(existing || {}), name: d.name.trim(), type: d.type };
      if (a.businessId) item.businessId = a.businessId;
      if (d.type === 'card') {
        const last4 = (d.last4 || '').replace(/\D/g, '').slice(-4);
        if (last4 && last4.length !== 4) throw new Error('Нужно ровно 4 последние цифры карты');
        item.last4 = last4 || null; item.bank = (d.bank || '').trim();
      }
      if (existing) item.initial = (Number(existing.initial) || 0) + (desired - accountBalance(existing.id));
      else item.initial = desired;
      await save('accounts', item);
      toast('Сохранено');
    },
  });
}

// ---------------- Копилка ----------------


export function piggyForm(existing = null, { onSaved } = {}) {
  const p = existing || { icon: 'piggy' };
  const curIcon = piggyIcon(p);
  openSheet({
    title: existing ? 'Копилка' : 'Новая копилка',
    body: `<form class="form">
      <div class="chips">${PIGGY_ICONS.map((e) => `<label class="chip-radio glyph"><input type="radio" name="icon" value="${e}" ${curIcon === e ? 'checked' : ''}><span>${icon(e, { size: 20 })}</span></label>`).join('')}</div>
      <label class="field"><span>Название</span><input name="name" value="${esc(p.name || '')}" placeholder="Например: Подушка безопасности" required ${existing ? '' : 'autofocus'}></label>
      ${amountInput('target', p.target, { label: 'Цель (сколько нужно)', required: false })}
      <label class="field"><span>Срок (необязательно)</span><input type="date" name="deadline" value="${esc(p.deadline || '')}"></label>
      ${existing ? '' : amountInput('initial', '', { label: 'Уже отложено', required: false })}
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Создать'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>${existing.archived ? 'Вернуть из архива' : 'В архив'}</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить копилку</button>` : ''}
    </form>`,
    onMount(el, close) {
      el.querySelector('[data-arch]')?.addEventListener('click', async () => {
        await save('piggies', { ...existing, archived: !existing.archived }); close(); toast('Готово');
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (piggySaved(existing.id) > 0) { toast('Сначала забери деньги из копилки на счёт'); return; }
        confirmDelete('Копилка', 'piggies', existing.id, close);
      });
    },
    async onSubmit(d) {
      const item = {
        ...(existing || {}), name: d.name.trim(), icon: d.icon || 'piggy',
        target: d.target ? requireAmount(d.target) : null, deadline: d.deadline || null,
      };
      if (!existing) item.initial = d.initial ? requireAmount(d.initial, { allowZero: true }) : 0;
      const saved = await save('piggies', item);
      toast('Копилка сохранена');
      onSaved?.(saved);
    },
  });
}

export function piggyMoveForm(piggy, mode = 'in') {
  const accounts = personalAccounts();
  if (!accounts.length) { toast('Сначала добавь счёт'); return; }
  openSheet({
    title: mode === 'in' ? `Пополнить «${piggy.name}»` : `Забрать из «${piggy.name}»`,
    body: `<form class="form">
      <p class="muted">В копилке: <b>${money(piggySaved(piggy.id))}</b></p>
      ${amountInput('amount', '', { autofocus: true })}
      <label class="field"><span>${mode === 'in' ? 'С какого счёта' : 'На какой счёт'}</span>
        <select name="accountId">${accounts.map((a) => opt(a.id, `${a.name} · ${money(accountBalance(a.id))}`)).join('')}</select></label>
      <button class="btn btn-primary btn-block" type="submit">${mode === 'in' ? 'Отложить' : 'Забрать'}</button>
    </form>`,
    async onSubmit(d) {
      const amount = requireAmount(d.amount);
      if (mode === 'out' && amount > piggySaved(piggy.id)) throw new Error('В копилке меньше денег');
      await save('transactions', {
        type: 'piggy', piggyId: piggy.id, accountId: d.accountId,
        amount: mode === 'in' ? amount : -amount, date: today(),
      });
      toast(mode === 'in' ? `Отложено ${money(amount)}` : `Снято ${money(amount)}`);
    },
  });
}

// ---------------- Цель ----------------

const KINDS = [
  ['body', 'Тело'], ['money', 'Деньги'], ['mind', 'Мозг'], ['custom', 'Другое'],
];

export function goalForm(existing = null, presetKind = 'body') {
  const g = existing || { kind: presetKind };
  const metricsMap = Object.fromEntries((g.metrics || []).map((m) => [m.key, m]));
  const piggy = g.piggyId ? byId('piggies', g.piggyId) : null;
  const metricRow = (key) => {
    const m = metricsMap[key] || {};
    const p = METRIC_PRESETS[key];
    return `<div class="metric-row">
      <span class="metric-name">${p.label}, ${p.unit}</span>
      <input name="m_${key}_start" inputmode="decimal" placeholder="сейчас" value="${m.start ?? ''}">
      <span class="muted">→</span>
      <input name="m_${key}_target" inputmode="decimal" placeholder="цель" value="${m.target ?? ''}">
    </div>`;
  };
  openSheet({
    title: existing ? 'Цель' : 'Новая цель',
    body: `<form class="form">
      <div class="segmented wrap">
        ${KINDS.map(([v, l]) => `<label><input type="radio" name="kind" value="${v}" ${g.kind === v ? 'checked' : ''} ${existing ? 'disabled' : ''}><span>${l}</span></label>`).join('')}
      </div>
      ${existing ? `<input type="hidden" name="kind" value="${g.kind}">` : ''}
      <label class="field"><span>Название</span><input name="title" value="${esc(g.title || '')}" placeholder="Например: Рельеф к лету" required></label>
      <label class="field"><span>Зачем мне это (мотивация)</span><textarea name="why" rows="2" placeholder="Например: чувствовать себя сильным и уверенным">${esc(g.why || '')}</textarea></label>
      <label class="field"><span>Срок (необязательно)</span><input type="date" name="deadline" value="${esc(g.deadline || '')}"></label>

      <fieldset data-kind="body">
        <legend>Показатели: сейчас → цель</legend>
        ${['weight', 'bodyFat', 'waist'].map(metricRow).join('')}
        <p class="hint">Заполни то, что знаешь. % жира можно оценить на умных весах, калипером или по фото.</p>
      </fieldset>
      <fieldset data-kind="money">
        <legend>Деньги</legend>
        ${amountInput('moneyTarget', piggy?.target ?? '', { label: 'Сколько нужно накопить', required: false })}
        <p class="hint">Для цели создастся копилка. Пополняй её, и прогресс будет считаться сам.</p>
      </fieldset>
      <fieldset data-kind="mind">
        <legend>Привычки</legend>
        <p class="hint">Ежедневные привычки для этой цели добавляются во вкладке «Задачи» (выбери цель и «каждый день»). Прогресс = выполнение за 7 дней.</p>
        ${existing ? '' : `<label class="check"><input type="checkbox" name="seedHabits" checked> Добавить стартовые привычки: чтение 20 мин, сон до 23:30, утро без телефона</label>`}
      </fieldset>
      <fieldset data-kind="custom">
        <legend>Прогресс вручную</legend>
        <input type="range" name="manualProgress" min="0" max="100" step="5" value="${g.manualProgress ?? 0}">
      </fieldset>

      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Создать цель'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>${existing.archived ? 'Вернуть из архива' : 'В архив'}</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить цель</button>` : ''}
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const sync = () => {
        const kind = existing ? g.kind : form.querySelector('input[name=kind]:checked')?.value;
        el.querySelectorAll('fieldset[data-kind]').forEach((f) => { f.hidden = f.dataset.kind !== kind; });
      };
      form.addEventListener('change', sync); sync();
      el.querySelector('[data-arch]')?.addEventListener('click', async () => {
        await save('goals', { ...existing, archived: !existing.archived }); close(); toast('Готово');
      });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Удалить цель?', 'Замеры этой цели тоже удалятся. Копилка и задачи останутся.')) {
          for (const m of state.metrics.filter((x) => x.goalId === existing.id)) await remove('metrics', m.id);
          await remove('goals', existing.id); close(); toast('Цель удалена');
        }
      });
    },
    async onSubmit(d) {
      const kind = d.kind;
      const item = {
        ...(existing || {}), kind, title: d.title.trim(),
        why: d.why.trim(), deadline: d.deadline || null,
      };
      if (kind === 'body') {
        item.metrics = ['weight', 'bodyFat', 'waist'].map((key) => {
          const s = parseAmount(d[`m_${key}_start`]); const t = parseAmount(d[`m_${key}_target`]);
          return { key, start: Number.isFinite(s) ? s : null, target: Number.isFinite(t) ? t : null };
        }).filter((m) => m.start != null || m.target != null);
      }
      if (kind === 'custom') item.manualProgress = Number(d.manualProgress) || 0;
      if (kind === 'money') {
        const target = d.moneyTarget ? requireAmount(d.moneyTarget) : null;
        if (piggy) await save('piggies', { ...piggy, target, deadline: item.deadline, name: item.title });
        else {
          const p = await save('piggies', { name: item.title, icon: 'house', target, deadline: item.deadline, initial: 0 });
          item.piggyId = p.id;
        }
      }
      const saved = await save('goals', item);
      if (kind === 'body' && !existing) {
        for (const m of saved.metrics || []) {
          if (m.start != null) await save('metrics', { goalId: saved.id, key: m.key, value: m.start, date: today() });
        }
      }
      if (kind === 'mind' && !existing && d.seedHabits) {
        for (const title of ['Чтение 20 минут', 'Лечь спать до 23:30', 'Первый час без телефона']) {
          await save('tasks', { title, repeat: 'daily', goalId: saved.id, doneDates: [] });
        }
      }
      toast('Цель сохранена');
    },
  });
}

// ---------------- Замер ----------------

export function metricForm(goal) {
  const metrics = goal.metrics?.length ? goal.metrics : [{ key: 'weight' }];
  openSheet({
    title: `Замер · ${goal.title}`,
    body: `<form class="form">
      <label class="field"><span>Дата</span><input type="date" name="date" value="${today()}" required></label>
      ${metrics.map((m, i) => {
        const p = METRIC_PRESETS[m.key] || { label: m.key, unit: '' };
        return `<label class="field"><span>${p.label}, ${p.unit}</span>
          <input name="${m.key}" inputmode="decimal" placeholder="${m.start ?? ''}" ${i === 0 ? 'autofocus' : ''}></label>`;
      }).join('')}
      <button class="btn btn-primary btn-block" type="submit">Сохранить замер</button>
    </form>`,
    async onSubmit(d) {
      let n = 0;
      for (const m of metrics) {
        const v = parseAmount(d[m.key]);
        if (Number.isFinite(v) && v > 0) {
          await upsertMetric(goal.id, m.key, v, d.date || today());
          n++;
        }
      }
      if (!n) throw new Error('Заполни хотя бы одно значение');
      toast('Замер сохранён');
    },
  });
}

// ---------------- Задача ----------------

export function taskForm(existing = null, preset = {}) {
  const t = existing || { repeat: 'none', ...preset };
  const goals = active('goals');
  openSheet({
    title: existing ? 'Задача' : 'Новая задача',
    body: `<form class="form">
      <label class="field"><span>Что сделать</span><input name="title" value="${esc(t.title || '')}" placeholder="Например: Тренировка ног" required ${existing ? '' : 'autofocus'}></label>
      <div class="segmented">
        ${[['none', 'Один раз'], ['daily', 'Каждый день'], ['weekly', 'По неделям']].map(([v, l]) => `
          <label><input type="radio" name="repeat" value="${v}" ${(t.repeat || 'none') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <label class="field" data-once><span>Когда</span><input type="date" name="due" value="${esc(t.due || '')}"></label>
      <label class="field" data-weekly><span>Сколько раз в неделю</span><select name="timesPerWeek">${[1, 2, 3, 4, 5, 6].map((n) => opt(n, `${n} ${n === 1 ? 'раз' : n < 5 ? 'раза' : 'раз'}`, Number(t.timesPerWeek || 1) === n)).join('')}</select></label>
      <label class="field"><span>Цель</span><select name="goalId">${opt('', 'Без цели', !t.goalId)}${goals.map((g) => opt(g.id, g.title, g.id === t.goalId)).join('')}</select></label>
      <label class="field"><span>Заметка</span><textarea name="note" rows="2">${esc(t.note || '')}</textarea></label>
      <label class="check"><input type="checkbox" name="important" ${t.important ? 'checked' : ''}> Важная</label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>${existing.archived ? 'Вернуть из архива' : 'В архив'}</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить</button>` : ''}
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const sync = () => {
        el.querySelector('[data-once]').hidden = form.repeat.value !== 'none';
        el.querySelector('[data-weekly]').hidden = form.repeat.value !== 'weekly';
      };
      form.addEventListener('change', sync); sync();
      el.querySelector('[data-arch]')?.addEventListener('click', async () => {
        await save('tasks', { ...existing, archived: !existing.archived }); close(); toast('Готово');
      });
      el.querySelector('[data-del]')?.addEventListener('click', () => confirmDelete('Задача', 'tasks', existing.id, close));
    },
    async onSubmit(d) {
      await save('tasks', {
        ...(existing || { doneDates: [] }), title: d.title.trim(), repeat: d.repeat,
        due: d.repeat === 'none' ? (d.due || null) : null, goalId: d.goalId || null,
        note: d.note.trim(), important: !!d.important,
        timesPerWeek: d.repeat === 'weekly' ? Number(d.timesPerWeek) || 1 : undefined,
      });
      toast('Задача сохранена');
    },
  });
}

// ---------------- Экранное время ----------------

export function screentimeForm(existing = null) {
  const s = existing || { date: today(), apps: [] };
  const appsText = (s.apps || []).map((a) => `${a.name} ${a.minutes}`).join('\n');
  openSheet({
    title: 'Экранное время',
    body: `<form class="form">
      <p class="hint">Открой «Настройки → Экранное время» на iPhone и перепиши цифры. Или отправь скриншот Авроре во вкладке «Аврора», и она заполнит всё сама.</p>
      <label class="field"><span>Дата</span><input type="date" name="date" value="${esc(s.date)}" required></label>
      <div class="row gap">
        <label class="field grow"><span>Часы</span><input name="h" inputmode="numeric" value="${s.totalMinutes != null ? Math.floor(s.totalMinutes / 60) : ''}" placeholder="0"></label>
        <label class="field grow"><span>Минуты</span><input name="m" inputmode="numeric" value="${s.totalMinutes != null ? s.totalMinutes % 60 : ''}" placeholder="0"></label>
      </div>
      <label class="field"><span>Приложения (по строке: название минуты)</span>
        <textarea name="apps" rows="4" placeholder="Instagram 75&#10;Telegram 40&#10;YouTube 30">${esc(appsText)}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">Сохранить</button>
      ${existing ? '<button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить</button>' : ''}
    </form>`,
    onMount(el, close) {
      el.querySelector('[data-del]')?.addEventListener('click', () => confirmDelete('Запись', 'screentime', existing.id, close));
    },
    async onSubmit(d) {
      const total = (parseInt(d.h, 10) || 0) * 60 + (parseInt(d.m, 10) || 0);
      const apps = d.apps.split('\n').map((line) => {
        const m = line.trim().match(/^(.+?)\s+(\d+)\s*(м|мин|min)?$/i);
        return m ? { name: m[1].trim(), minutes: Number(m[2]) } : null;
      }).filter(Boolean);
      if (!total && !apps.length) throw new Error('Укажи общее время или приложения');
      const sameDay = state.screentime.find((x) => x.date === d.date && x.id !== existing?.id);
      await save('screentime', {
        ...(existing || sameDay || {}), date: d.date,
        totalMinutes: total || apps.reduce((a, b) => a + b.minutes, 0), apps,
      });
      toast('Экранное время сохранено');
    },
  });
}

