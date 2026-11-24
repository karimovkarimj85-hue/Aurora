import {
  state, active, totalBalance, totalSaved, monthStats, todayTasks, isDone, toggleTask,
  goalProgress, streak, byId, bizMonthStats, duePayments, clientName,
} from '../store.js';
import { icon, tile, GOAL_COLOR } from '../icons.js';
import { dueSteps } from '../deals.js';
import { smartTips, dailyTip } from '../tips.js';
import { money, moneyShort, greeting, esc, today, fullDate } from '../util.js';
import { ring } from '../ui.js';
import { txForm, taskForm, metricForm, goalForm } from '../forms.js';

export function render() {
  const s = state.settings;
  const m = monthStats();
  const tasks = todayTasks().sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || Number(!!b.important) - Number(!!a.important));
  const goals = active('goals');
  const tips = smartTips().slice(0, 3);

  return `
  <header class="page-head">
    <div>
      <p class="eyebrow">${esc(fullDate())}</p>
      <h1>${esc(greeting())}${s.name ? ', ' + esc(s.name) : ''}</h1>
    </div>
    <button class="icon-btn lg" data-action="nav" data-to="settings" aria-label="Настройки">${icon('gear', { size: 21 })}</button>
  </header>

  <section class="card hero" data-action="nav" data-to="money">
    <p class="eyebrow">Всего денег</p>
    <p class="hero-num">${money(totalBalance() + totalSaved())}</p>
    <div class="hero-split">
      <div><span class="muted">На счетах</span><b>${moneyShort(totalBalance())}</b></div>
      <div><span class="muted">В копилках</span><b>${moneyShort(totalSaved())}</b></div>
    </div>
    <div class="hero-split">
      <div><span class="muted">Доход за месяц</span><b class="pos">${moneyShort(m.income)}</b></div>
      <div><span class="muted">Расход за месяц</span><b class="neg">${moneyShort(m.expense)}</b></div>
    </div>
  </section>

  <section class="quick">
    <button class="quick-btn" data-action="add-expense"><span class="q-ic" style="--tile:var(--c-red)">${icon('arrowUp', { size: 20, w: 2.4 })}</span>Расход</button>
    <button class="quick-btn" data-action="add-income"><span class="q-ic" style="--tile:var(--c-green)">${icon('arrowDown', { size: 20, w: 2.4 })}</span>Доход</button>
    <button class="quick-btn" data-action="add-task"><span class="q-ic" style="--tile:var(--c-blue)">${icon('check', { size: 20, w: 2.6 })}</span>Задача</button>
    <button class="quick-btn" data-action="add-metric"><span class="q-ic" style="--tile:var(--c-orange)">${icon('scale', { size: 20, w: 2.2 })}</span>Замер</button>
  </section>

  ${tips.length ? `<section class="section">
    <h2 class="section-title">Подсказки</h2>
    <div class="tips">${tips.map((t) => `<button class="tip" data-action="nav" data-to="${t.tab}">${tile(t.icon)}<span>${esc(t.text)}</span></button>`).join('')}</div>
  </section>` : ''}

  <section class="section">
    <div class="section-head"><h2 class="section-title">Сегодня</h2><button class="link" data-action="nav" data-to="tasks">Все задачи</button></div>
    ${tasks.length ? `<ul class="checklist">${tasks.slice(0, 8).map((t) => {
      const done = isDone(t); const st = streak(t); const g = t.goalId ? byId('goals', t.goalId) : null;
      return `<li class="${done ? 'done' : ''}">
        <button class="check-btn" data-action="toggle-task" data-id="${t.id}" aria-label="${done ? 'Снять отметку' : 'Отметить выполненной'}">${done ? icon('check', { size: 14, w: 3 }) : ''}</button>
        <div class="grow"><span class="task-title">${t.important ? icon('star', { size: 14, w: 2, cls: 'inline' }) + ' ' : ''}${esc(t.title)}</span>
          <span class="task-meta">${g ? esc(g.title) : ''}${st > 1 ? ` · ${icon('flame', { size: 12, w: 2, cls: 'inline' })} ${st}` : ''}${t.due && t.due < today() && !done ? ' · <span class="neg">просрочено</span>' : ''}</span></div>
      </li>`;
    }).join('')}</ul>` : `<button class="card empty-mini" data-action="add-task">На сегодня задач нет. Добавить?</button>`}
  </section>

  ${bizBlock()}

  <section class="section">
    <div class="section-head"><h2 class="section-title">Цели</h2><button class="link" data-action="nav" data-to="goals">Все цели</button></div>
    ${goals.length ? `<div class="hscroll">${goals.map((g) => `
      <button class="goal-mini card" data-action="nav" data-to="goals">
        ${ring(goalProgress(g), 54, 6, GOAL_COLOR[g.kind])}
        <span class="goal-mini-title">${esc(g.title)}</span>
      </button>`).join('')}</div>` : `<button class="card empty-mini" data-action="add-goal">Поставь первую цель</button>`}
  </section>

  <section class="card tip-day">
    <p class="eyebrow">Совет дня</p>
    <p>${esc(dailyTip())}</p>
  </section>
  `;
}

function bizBlock() {
  const list = active('businesses');
  if (!list.length) return '';
  const due = duePayments(null, 0);
  const steps = dueSteps();
  return `<section class="section">
    <div class="section-head"><h2 class="section-title">Бизнес</h2><button class="link" data-action="nav" data-to="business">Открыть</button></div>
    <ul class="list card">${list.map((b) => {
      const m = bizMonthStats(b.id);
      return `<li class="row-item" data-action="nav" data-to="business">
        <span class="biz-mono" style="--c:${b.color};width:32px;height:32px;font-size:12px">${esc(b.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>
        <div class="grow"><span class="row-title">${esc(b.name)}</span><span class="row-sub">Выручка ${moneyShort(m.income)} · прибыль ${moneyShort(m.profit)}</span></div>
        ${icon('chevron', { size: 16, cls: 'muted' })}</li>`;
    }).join('')}
    ${due.map((s) => `<li class="row-item" data-action="nav" data-to="business">
        ${tile('repeat', 'warn')}
        <div class="grow"><span class="row-title">${esc(clientName(s.clientId) || s.title || 'Платёж')}</span><span class="row-sub neg">${s.nextDate < today() ? 'Просрочен платёж' : 'Платёж сегодня'} · ${esc(byId('businesses', s.businessId)?.name || '')}</span></div>
        <span class="row-amount">${money(s.amount)}</span></li>`).join('')}
    ${steps.map((d) => `<li class="row-item" data-action="nav" data-to="business">
        ${tile('clock', d.nextDate < today() ? 'warn' : '')}
        <div class="grow"><span class="row-title">${esc(d.nextStep)}</span><span class="row-sub ${d.nextDate < today() ? 'neg' : ''}">${esc(d.title)} · ${esc(byId('businesses', d.businessId)?.name || '')}</span></div></li>`).join('')}
    </ul>
  </section>`;
}

export const actions = {
  'add-expense': () => txForm(null, 'expense'),
  'add-income': () => txForm(null, 'income'),
  'add-task': () => taskForm(),
  'add-goal': () => goalForm(),
  'add-metric': () => {
    const g = active('goals').find((x) => x.kind === 'body');
    if (g) metricForm(g); else goalForm(null, 'body');
  },
  'toggle-task': (el) => {
    const t = byId('tasks', el.dataset.id);
    if (t) toggleTask(t);
  },
};
