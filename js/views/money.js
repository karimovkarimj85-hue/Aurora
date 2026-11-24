import {
  state, active, byId, accountBalance, piggySaved, piggyMonthlyNeed, monthStats, sortedTransactions,
  totalBalance, totalSaved, remove, personalAccounts,
} from '../store.js';
import { icon } from '../icons.js';
import { money, moneyShort, esc, humanDate, monthKey, today, monthName, addDays, pct } from '../util.js';
import { bar, emptyState, confirmSheet, toast } from '../ui.js';
import { hbars, columns } from '../charts.js';
import { txForm, accountForm, piggyForm, piggyMoveForm } from '../forms.js';

let seg = 'ops';
let month = monthKey(today());
let showAll = false;

const ACC_ICON = { cash: '💵', card: '💳', savings: '🏦' };

function opsView() {
  const list = sortedTransactions();
  if (!list.length) {
    return emptyState('🧾', 'Операций пока нет', 'Записывай каждую трату, так через месяц станет видно, куда уходят деньги.',
      '<button class="btn btn-primary" data-action="add-tx">Добавить первую</button>');
  }
  const shown = showAll ? list : list.slice(0, 60);
  const groups = [];
  for (const t of shown) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t); else groups.push({ date: t.date, items: [t] });
  }
  return groups.map((g) => {
    const dayNet = g.items.reduce((s, t) => s + (t.type === 'income' ? +t.amount : t.type === 'expense' ? -t.amount : 0), 0);
    return `<div class="day-group">
      <div class="day-head"><span>${esc(humanDate(g.date))}</span><span class="muted">${dayNet ? money(dayNet, { sign: true }) : ''}</span></div>
      <ul class="list card">${g.items.map(txRow).join('')}</ul>
    </div>`;
  }).join('') + (list.length > shown.length ? `<button class="btn btn-ghost btn-block" data-action="show-all">Показать все (${list.length})</button>` : '');
}

function txRow(t) {
  let icon = '📦'; let title = ''; let sub = ''; let amountCls = ''; let amount = '';
  const acc = byId('accounts', t.accountId);
  if (t.type === 'transfer') {
    icon = '🔁'; title = 'Перевод'; sub = `${acc?.name || '?'} → ${byId('accounts', t.toAccountId)?.name || '?'}`; amount = money(t.amount);
  } else if (t.type === 'piggy') {
    const p = byId('piggies', t.piggyId);
    icon = p?.emoji || '🐷'; title = t.amount >= 0 ? `В копилку «${p?.name || '?'}»` : `Из копилки «${p?.name || '?'}»`;
    sub = acc?.name || ''; amount = money(Math.abs(t.amount)); amountCls = 'muted';
  } else {
    const c = byId('categories', t.categoryId);
    icon = c?.emoji || '📦'; title = c?.name || 'Без категории'; sub = acc?.name || '';
    amount = money(t.type === 'income' ? t.amount : -t.amount, { sign: true });
    amountCls = t.type === 'income' ? 'pos' : '';
  }
  if (t.note) sub = `${t.note}${sub ? ' · ' + sub : ''}`;
  return `<li class="row-item" data-action="edit-tx" data-id="${t.id}">
    <span class="row-icon">${icon}</span>
    <div class="grow"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></div>
    <span class="row-amount ${amountCls}">${amount}</span>
  </li>`;
}

function accountsView() {
  const accs = personalAccounts();
  return `<div class="card total-line"><span class="muted">Итого на счетах</span><b>${money(totalBalance())}</b></div>
    <ul class="list card">${accs.map((a) => `
      <li class="row-item" data-action="edit-account" data-id="${a.id}">
        <span class="row-icon">${ACC_ICON[a.type] || '💳'}</span>
        <div class="grow"><span class="row-title">${esc(a.name)}</span><span class="row-sub">${{ cash: 'Наличные', card: 'Карта', savings: 'Вклад' }[a.type] || ''}</span></div>
        <span class="row-amount">${money(accountBalance(a.id))}</span>
      </li>`).join('')}
    </ul>
    <button class="btn btn-ghost btn-block" data-action="add-account">＋ Добавить счёт</button>
    <button class="btn btn-ghost btn-block" data-action="add-transfer">🔁 Перевод между счетами</button>`;
}

function piggiesView() {
  const list = active('piggies');
  const head = `<div class="card total-line"><span class="muted">Всего в копилках</span><b>${money(totalSaved())}</b></div>`;
  if (!list.length) {
    return head + emptyState('🐷', 'Копилок пока нет', 'Создай копилку под цель: подушка безопасности, дом, отпуск.',
      '<button class="btn btn-primary" data-action="add-piggy">Создать копилку</button>');
  }
  return head + list.map((p) => {
    const saved = piggySaved(p.id);
    const need = piggyMonthlyNeed(p);
    return `<article class="card piggy">
      <div class="piggy-head" data-action="edit-piggy" data-id="${p.id}">
        <span class="piggy-emoji">${p.emoji || '🐷'}</span>
        <div class="grow"><h3>${esc(p.name)}</h3>
          <p class="muted">${money(saved)}${p.target ? ` из ${money(p.target)}` : ''}${p.deadline ? ` · до ${esc(humanDate(p.deadline))}` : ''}</p></div>
        ${p.target ? `<b>${pct(saved, p.target)}%</b>` : ''}
      </div>
      ${p.target ? bar(saved / p.target) : ''}
      ${need ? `<p class="hint">Нужно откладывать ≈ ${money(need)} в месяц</p>` : ''}
      <div class="row gap">
        <button class="btn btn-primary grow" data-action="piggy-in" data-id="${p.id}">＋ Отложить</button>
        <button class="btn btn-ghost grow" data-action="piggy-out" data-id="${p.id}">Забрать</button>
      </div>
    </article>`;
  }).join('') + '<button class="btn btn-ghost btn-block" data-action="add-piggy">＋ Новая копилка</button>';
}

function statsView() {
  const s = monthStats(month);
  const isCurrent = month === monthKey(today());
  // Траты по дням за последние 14 дней
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today(), -i);
    const v = state.transactions.filter((t) => t.type === 'expense' && t.date === d).reduce((a, t) => a + Number(t.amount), 0);
    days.push({ label: humanDate(d), short: String(Number(d.slice(8))), value: v });
  }
  const [y, m] = month.split('-').map(Number);
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  return `<div class="month-nav">
      <button class="icon-btn" data-action="month" data-m="${prev}" aria-label="Предыдущий месяц">${icon('back', { size: 18 })}</button>
      <b>${monthName(month)}</b>
      <button class="icon-btn" data-action="month" data-m="${next}" ${isCurrent ? 'disabled' : ''} aria-label="Следующий месяц">${icon('chevron', { size: 18 })}</button>
    </div>
    <div class="stat-grid">
      <div class="card stat"><span class="muted">Доходы</span><b class="pos">${moneyShort(s.income)}</b></div>
      <div class="card stat"><span class="muted">Расходы</span><b>${moneyShort(s.expense)}</b></div>
      <div class="card stat"><span class="muted">Итог</span><b class="${s.net >= 0 ? 'pos' : 'neg'}">${moneyShort(s.net)}</b></div>
      <div class="card stat"><span class="muted">Норма сбережений</span><b>${s.income > 0 ? Math.round((s.net / s.income) * 100) + '%' : '—'}</b></div>
    </div>
    <section class="card">
      <h3 class="card-title">Расходы по категориям</h3>
      ${s.cats.length ? hbars(s.cats.map((c) => ({ label: c.cat.name, emoji: c.cat.emoji, value: c.sum })), money) : '<p class="muted">В этом месяце расходов нет</p>'}
    </section>
    <section class="card">
      <h3 class="card-title">Траты за 14 дней</h3>
      ${columns(days, { fmt: money })}
    </section>`;
}

export function render() {
  const body = { ops: opsView, accounts: accountsView, piggies: piggiesView, stats: statsView }[seg]();
  return `
  <header class="page-head"><h1>Деньги</h1>
    <button class="icon-btn lg tinted" data-action="add-tx" aria-label="Добавить операцию">${icon('plus', { size: 22, w: 2.2 })}</button></header>
  <div class="segmented sticky" role="tablist">
    ${[['ops', 'Операции'], ['accounts', 'Счета'], ['piggies', 'Копилки'], ['stats', 'Анализ']].map(([v, l]) => `
      <button role="tab" class="${seg === v ? 'on' : ''}" aria-selected="${seg === v}" data-action="seg" data-seg="${v}">${l}</button>`).join('')}
  </div>
  <div class="seg-body">${body}</div>
  <button class="fab" data-action="add-tx" aria-label="Добавить операцию">${icon('plus', { size: 28, w: 2.2 })}</button>`;
}

export const actions = {
  seg: (el, _e, rerender) => { seg = el.dataset.seg; rerender(); },
  month: (el, _e, rerender) => { month = el.dataset.m; rerender(); },
  'show-all': (_el, _e, rerender) => { showAll = true; rerender(); },
  'add-tx': () => txForm(),
  'add-transfer': () => txForm(null, 'transfer'),
  'edit-tx': (el) => {
    const t = byId('transactions', el.dataset.id);
    if (!t) return;
    if (t.type === 'piggy') return deletePiggyMove(t);
    txForm(t);
  },
  'add-account': () => accountForm(),
  'edit-account': (el) => accountForm(byId('accounts', el.dataset.id)),
  'add-piggy': () => piggyForm(),
  'edit-piggy': (el) => piggyForm(byId('piggies', el.dataset.id)),
  'piggy-in': (el) => piggyMoveForm(byId('piggies', el.dataset.id), 'in'),
  'piggy-out': (el) => piggyMoveForm(byId('piggies', el.dataset.id), 'out'),
};

async function deletePiggyMove(t) {
  const p = byId('piggies', t.piggyId);
  const ok = await confirmSheet('Отменить перевод?', `${t.amount >= 0 ? 'Пополнение' : 'Снятие'} копилки «${p?.name || '?'}» на ${money(Math.abs(t.amount))} будет удалено, деньги вернутся на счёт.`, { ok: 'Удалить перевод' });
  if (ok) { await remove('transactions', t.id); toast('Перевод удалён'); }
}
