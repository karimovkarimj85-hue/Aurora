import {
  state, active, byId, DEAL_STAGES, CLIENT_STATUS, PERIODS, bizMonthStats, bizTrend, mrr, activeSubs,
  duePayments, pipeline, bizBalance, clientName, sortedTransactions,
} from '../store.js';
import { esc, money, moneyShort, humanDate, today, monthName, pct } from '../util.js';
import { emptyState, bar, openSheet } from '../ui.js';
import { columns, hbars } from '../charts.js';
import { icon } from '../icons.js';
import { txForm } from '../forms.js';
import { businessForm, clientForm, dealForm, subscriptionForm, payForm, moveDeal } from '../bizforms.js';

let bizId = null;
let seg = 'overview';
let query = '';

const SEGS = [['overview', 'Обзор'], ['deals', 'Сделки'], ['clients', 'Клиенты'], ['subs', 'Платежи'], ['fin', 'Финансы']];

function current() {
  const list = active('businesses');
  if (!list.find((b) => b.id === bizId)) bizId = list[0]?.id || null;
  return byId('businesses', bizId);
}

const mono = (b, size = 44) => `<span class="biz-mono" style="--c:${b.color || '#8E8E93'};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc((b.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`;

function payRow(s) {
  const overdue = s.nextDate < today();
  return `<li class="row-item" data-action="edit-sub" data-id="${s.id}">
    <span class="row-icon ${overdue ? 'warn' : ''}">${icon('repeat', { size: 18 })}</span>
    <div class="grow"><span class="row-title">${esc(clientName(s.clientId) || s.title || 'Платёж')}</span>
      <span class="row-sub ${overdue ? 'neg' : ''}">${overdue ? 'Просрочено · ' : ''}${esc(humanDate(s.nextDate))}${s.title && s.clientId ? ' · ' + esc(s.title) : ''}</span></div>
    <span class="row-amount">${money(s.amount)}</span>
    <button class="pay-btn" data-action="pay" data-id="${s.id}" aria-label="Отметить оплату">${icon('check', { size: 18, w: 2.4 })}</button>
  </li>`;
}

function overview(b) {
  const due = duePayments(b.id, 7);
  const pipe = pipeline(b.id).filter((p) => p.open);
  const trend = bizTrend(b.id, 6);
  const openSum = pipe.reduce((s, p) => s + p.sum, 0);
  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Ближайшие платежи</h2><button class="link" data-action="seg" data-seg="subs">Все</button></div>
      ${due.length ? `<ul class="list card">${due.map(payRow).join('')}</ul>` : `<div class="card muted small">На ближайшую неделю платежей нет. Добавь клиентов с регулярной оплатой, и Аврора будет напоминать о датах.</div>`}
    </section>
    <section class="section">
      <div class="section-head"><h2 class="section-title">Воронка продаж</h2><button class="link" data-action="seg" data-seg="deals">Сделки</button></div>
      <div class="card">
        ${pipe.some((p) => p.count) ? `${hbars(pipe.filter((p) => p.count).map((p) => ({ label: `${p.name} · ${p.count}`, value: p.sum || 0.0001 })), (v) => (v < 1 ? '—' : money(v)))}
          <p class="muted small">В работе: <b>${money(openSum)}</b></p>` : '<p class="muted small">Сделок пока нет. Добавь первую: «2 кассы для кафе», «CRM на 5 пользователей».</p>'}
      </div>
    </section>
    <section class="section">
      <h2 class="section-title">Выручка по месяцам</h2>
      <div class="card">${columns(trend.map((m) => ({ label: monthName(m.key), short: monthName(m.key).slice(0, 3), value: m.income })), { fmt: money })}</div>
    </section>`;
}

function dealsView(b) {
  const pipe = pipeline(b.id);
  const card = (d) => {
    const i = DEAL_STAGES.findIndex((s) => s.id === d.stage);
    const open = DEAL_STAGES[i]?.open;
    const late = open && d.expectedDate && d.expectedDate < today();
    return `<article class="deal card" data-action="edit-deal" data-id="${d.id}">
      <div class="deal-top"><span class="deal-title">${esc(d.title)}</span><b>${money(d.amount)}</b></div>
      <p class="row-sub">${esc(clientName(d.clientId) || 'Без клиента')}${d.expectedDate ? ` · <span class="${late ? 'neg' : ''}">${esc(humanDate(d.expectedDate))}</span>` : ''}</p>
      ${open ? `<div class="deal-move">
        <button class="mini-btn" data-action="deal-back" data-id="${d.id}" ${i === 0 ? 'disabled' : ''} aria-label="На этап назад">${icon('back', { size: 16, w: 2.2 })}</button>
        <span class="muted small">${esc(DEAL_STAGES[i].name)}</span>
        <button class="mini-btn accent" data-action="deal-next" data-id="${d.id}" aria-label="На следующий этап">${DEAL_STAGES[i + 1]?.id === 'won' ? 'Оплачено' : 'Дальше'} ${icon('chevron', { size: 16, w: 2.2 })}</button>
      </div>` : ''}
    </article>`;
  };
  const open = pipe.filter((p) => p.open);
  const closed = pipe.filter((p) => !p.open);
  if (!pipe.some((p) => p.count)) {
    return emptyState('🤝', 'Сделок пока нет', 'Веди каждую продажу от первого звонка до оплаты, и станет видно, сколько денег «в пути».',
      '<button class="btn btn-primary" data-action="add-deal">Добавить сделку</button>');
  }
  return open.map((p) => `<div class="stage-head"><span>${esc(p.name)}</span><span class="muted">${p.count ? `${p.count} · ${moneyShort(p.sum)}` : ''}</span></div>
      ${p.deals.map(card).join('')}`).join('')
    + `<details class="closed"><summary class="stage-head"><span>Закрытые</span><span class="muted">${closed.map((p) => `${p.name}: ${p.count}`).join(' · ')}</span></summary>
      ${closed.flatMap((p) => p.deals).sort((a, c) => (c.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 30).map(card).join('')}</details>`;
}

function clientsView(b) {
  const all = active('clients').filter((c) => c.businessId === b.id);
  const q = query.trim().toLowerCase();
  const list = all.filter((c) => !q || [c.name, c.company, c.phone, c.telegram].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, c) => (a.status === 'active' ? 0 : 1) - (c.status === 'active' ? 0 : 1) || a.name.localeCompare(c.name));
  const paid = (cid) => state.transactions.filter((t) => t.clientId === cid && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  if (!all.length) {
    return emptyState('👥', 'Клиентов пока нет', 'Записывай клиентов с телефоном и заметками. Аврора посчитает, сколько каждый принёс.',
      '<button class="btn btn-primary" data-action="add-client">Добавить клиента</button>');
  }
  return `<input class="search" id="client-search" type="search" placeholder="Поиск по имени, компании, телефону" value="${esc(query)}">
    <ul class="list card">${list.map((c) => `<li class="row-item" data-action="edit-client" data-id="${c.id}">
      <span class="row-icon">${icon('person', { size: 18 })}</span>
      <div class="grow"><span class="row-title">${esc(c.name)}${c.company ? ` <span class="muted">· ${esc(c.company)}</span>` : ''}</span>
        <span class="row-sub">${esc(CLIENT_STATUS[c.status] || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</span></div>
      <span class="row-amount small">${paid(c.id) ? moneyShort(paid(c.id)) : ''}</span>
    </li>`).join('') || '<li class="row-item muted">Никого не найдено</li>'}</ul>`;
}

function subsView(b) {
  const subs = active('subscriptions').filter((s) => s.businessId === b.id).sort((a, c) => (a.active === false) - (c.active === false) || (a.nextDate || '').localeCompare(c.nextDate || ''));
  if (!subs.length) {
    return emptyState('🔁', 'Регулярных платежей нет', b.kind === 'saas' ? 'Добавь подписки клиентов: Аврора посчитает регулярный доход в месяц (MRR) и напомнит о датах оплаты.' : 'Абонентское обслуживание касс, лицензии, аренда оборудования: Аврора напомнит, кто и когда должен заплатить.',
      '<button class="btn btn-primary" data-action="add-sub">Добавить платёж</button>');
  }
  const act = subs.filter((s) => s.active !== false);
  const off = subs.filter((s) => s.active === false);
  return `<div class="card total-line"><span class="muted">Регулярный доход в месяц</span><b>${money(mrr(b.id))}</b></div>
    <ul class="list card">${act.map(payRow).join('')}</ul>
    ${off.length ? `<h2 class="section-title">Неактивные</h2><ul class="list card">${off.map((s) => `<li class="row-item" data-action="edit-sub" data-id="${s.id}">
      <span class="row-icon">${icon('repeat', { size: 18 })}</span><div class="grow"><span class="row-title muted">${esc(clientName(s.clientId) || s.title)}</span></div>
      <span class="row-amount muted">${money(s.amount)} ${esc(PERIODS[s.period]?.name || '')}</span></li>`).join('')}</ul>` : ''}`;
}

function finView(b) {
  const m = bizMonthStats(b.id);
  const list = sortedTransactions(b.id).slice(0, 80);
  return `<div class="row gap">
      <button class="btn btn-ghost grow" data-action="biz-income">${icon('arrowDown', { size: 18 })} Доход</button>
      <button class="btn btn-ghost grow" data-action="biz-expense">${icon('arrowUp', { size: 18 })} Расход</button>
    </div>
    <button class="btn btn-ghost btn-block" data-action="biz-draw">Вывести прибыль на личный счёт</button>
    <section class="card mt">
      <h3 class="card-title">Расходы за ${monthName(today().slice(0, 7)).toLowerCase()}</h3>
      ${m.cats.length ? hbars(m.cats.map((c) => ({ label: c.cat.name, emoji: c.cat.emoji, value: c.sum })), money) : '<p class="muted small">Расходов в этом месяце нет</p>'}
    </section>
    <h2 class="section-title">Операции</h2>
    ${list.length ? `<ul class="list card">${list.map((t) => {
      const c = byId('categories', t.categoryId);
      const isT = t.type === 'transfer';
      const title = isT ? 'Перевод' : (c?.name || 'Операция');
      const sub = [humanDate(t.date), t.note, isT ? `${byId('accounts', t.accountId)?.name || ''} → ${byId('accounts', t.toAccountId)?.name || ''}` : ''].filter(Boolean).join(' · ');
      const amt = isT ? money(t.amount) : money(t.type === 'income' ? t.amount : -t.amount, { sign: true });
      return `<li class="row-item" data-action="edit-tx" data-id="${t.id}"><span class="row-icon">${isT ? '🔁' : c?.emoji || '📎'}</span>
        <div class="grow"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></div>
        <span class="row-amount ${t.type === 'income' ? 'pos' : ''}">${amt}</span></li>`;
    }).join('')}</ul>` : '<p class="muted center pad">Операций пока нет</p>'}`;
}

export function render() {
  const list = active('businesses');
  const b = current();
  if (!b) {
    return `<header class="page-head"><h1>Бизнес</h1></header>
      ${emptyState('💼', 'Бизнесов пока нет', 'Добавь свой бизнес, чтобы вести клиентов, сделки, платежи и прибыль отдельно от личных денег.', '<button class="btn btn-primary" data-action="add-biz">Добавить бизнес</button>')}`;
  }
  const m = bizMonthStats(b.id);
  const subs = activeSubs(b.id);
  const due = duePayments(b.id, 0);
  const overdueSum = due.filter((s) => s.nextDate < today()).reduce((s, x) => s + Number(x.amount), 0);
  const openDeals = pipeline(b.id).filter((p) => p.open);
  const activeClients = active('clients').filter((c) => c.businessId === b.id && c.status === 'active').length;
  const body = { overview, deals: dealsView, clients: clientsView, subs: subsView, fin: finView }[seg](b);

  return `
  <header class="page-head">
    <div><p class="eyebrow">${esc(monthName(today().slice(0, 7)))}</p><h1>Бизнес</h1></div>
    <button class="icon-btn lg tinted" data-action="add-menu" aria-label="Добавить">${icon('plus', { size: 22, w: 2.2 })}</button>
  </header>

  <div class="biz-switch" role="tablist">
    ${list.map((x) => `<button role="tab" class="biz-pill ${x.id === b.id ? 'on' : ''}" aria-selected="${x.id === b.id}" data-action="pick" data-id="${x.id}" style="--c:${x.color}">${mono(x, 22)}<span>${esc(x.name)}</span></button>`).join('')}
    <button class="biz-pill add" data-action="add-biz" aria-label="Добавить бизнес">${icon('plus', { size: 16, w: 2.2 })}</button>
  </div>

  <section class="card biz-hero" style="--c:${b.color}" data-action="edit-biz">
    <div class="biz-hero-top">${mono(b, 40)}<div class="grow"><b>${esc(b.name)}</b><p class="muted small">${esc(b.about || '')}</p></div>
      <span class="muted small">${icon('chevron', { size: 16 })}</span></div>
    <p class="eyebrow mt">Выручка за месяц</p>
    <p class="hero-num">${money(m.income)}</p>
    ${b.revenueGoal ? `${bar(m.income / b.revenueGoal)}<p class="muted small">${pct(m.income, b.revenueGoal)}% от цели ${moneyShort(b.revenueGoal)}</p>` : ''}
    <div class="hero-split">
      <div><span class="muted">Расходы</span><b>${moneyShort(m.expense)}</b></div>
      <div><span class="muted">Прибыль</span><b class="${m.profit >= 0 ? 'pos' : 'neg'}">${moneyShort(m.profit)}</b></div>
    </div>
  </section>

  <div class="stat-grid">
    <button class="card stat" data-action="seg" data-seg="subs"><span class="muted">${subs.length ? 'Регулярный доход' : 'На счёте бизнеса'}</span><b>${subs.length ? moneyShort(mrr(b.id)) + '/мес' : moneyShort(bizBalance(b))}</b></button>
    <button class="card stat" data-action="seg" data-seg="clients"><span class="muted">Активных клиентов</span><b>${activeClients}</b></button>
    <button class="card stat" data-action="seg" data-seg="deals"><span class="muted">Сделки в работе</span><b>${moneyShort(openDeals.reduce((s, p) => s + p.sum, 0))}</b></button>
    <button class="card stat" data-action="seg" data-seg="subs"><span class="muted">Должны сейчас</span><b class="${overdueSum ? 'neg' : ''}">${moneyShort(overdueSum)}</b></button>
  </div>

  <div class="segmented sticky scroll" role="tablist">
    ${SEGS.map(([v, l]) => `<button role="tab" class="${seg === v ? 'on' : ''}" aria-selected="${seg === v}" data-action="seg" data-seg="${v}">${l}</button>`).join('')}
  </div>
  <div class="seg-body">${body}</div>`;
}

export function mount(container, rerender) {
  const input = container.querySelector('#client-search');
  if (input) {
    input.addEventListener('input', () => {
      query = input.value;
      const pos = input.selectionStart;
      rerender();
      const again = document.getElementById('client-search');
      again?.focus(); again?.setSelectionRange(pos, pos);
    });
  }
}

function addMenu() {
  const b = current();
  if (!b) return businessForm();
  const close = openSheet({
    title: `Добавить · ${b.name}`,
    body: `<div class="menu-list card">
      ${[['m-income', 'arrowDown', 'Доход'], ['m-expense', 'arrowUp', 'Расход'], ['m-deal', 'funnel', 'Сделка'], ['m-client', 'person', 'Клиент'], ['m-sub', 'repeat', 'Регулярный платёж']]
        .map(([a, ic, l]) => `<button class="menu-item" data-m="${a}">${icon(ic, { size: 20 })}<span>${l}</span>${icon('chevron', { size: 16, cls: 'muted' })}</button>`).join('')}
    </div>`,
    onMount(el) {
      el.addEventListener('click', (e) => {
        const m = e.target.closest('[data-m]')?.dataset.m;
        if (!m) return;
        close();
        setTimeout(() => ({
          'm-income': () => txForm(null, 'income', { businessId: b.id }),
          'm-expense': () => txForm(null, 'expense', { businessId: b.id }),
          'm-deal': () => dealForm(null, b.id),
          'm-client': () => clientForm(null, b.id),
          'm-sub': () => subscriptionForm(null, b.id),
        })[m](), 240);
      });
    },
  });
}

export const actions = {
  pick: (el, _e, rerender) => { bizId = el.dataset.id; rerender(); },
  seg: (el, _e, rerender) => { seg = el.dataset.seg; rerender(); },
  'add-menu': () => addMenu(),
  'add-biz': () => businessForm(),
  'edit-biz': () => businessForm(current()),
  'add-deal': () => dealForm(null, current().id),
  'add-client': () => clientForm(null, current().id),
  'add-sub': () => subscriptionForm(null, current().id),
  'edit-deal': (el) => dealForm(byId('deals', el.dataset.id)),
  'deal-next': (el) => moveDeal(byId('deals', el.dataset.id), 1),
  'deal-back': (el) => moveDeal(byId('deals', el.dataset.id), -1),
  'edit-client': (el) => clientForm(byId('clients', el.dataset.id)),
  'edit-sub': (el) => subscriptionForm(byId('subscriptions', el.dataset.id)),
  pay: (el) => payForm(byId('subscriptions', el.dataset.id)),
  'edit-tx': (el) => txForm(byId('transactions', el.dataset.id)),
  'biz-income': () => txForm(null, 'income', { businessId: current().id }),
  'biz-expense': () => txForm(null, 'expense', { businessId: current().id }),
  'biz-draw': () => txForm(null, 'transfer', { businessId: current().id }),
};

