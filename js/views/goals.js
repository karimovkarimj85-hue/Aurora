import {
  state, active, byId, remove, goalProgress, metricEntries, latestMetric, metricProgress, habitStats,
  piggySaved, METRIC_PRESETS, streak, isDone, toggleTask, save, weekProgress,
} from '../store.js';
import { tile, GOAL_ICON, icon } from '../icons.js';
import { esc, num, money, humanDate, today, addDays, daysBetween, plural, parseIso } from '../util.js';
import { ring, bar, openSheet, emptyState, confirmSheet, toast } from '../ui.js';
import { lineChart, columns } from '../charts.js';
import { goalForm, metricForm, taskForm, piggyMoveForm, screentimeForm } from '../forms.js';

const KIND_LABEL = { body: 'Тело', money: 'Деньги', mind: 'Мозг и привычки', custom: 'Цель' };

function deadlineText(g) {
  if (!g.deadline) return '';
  const d = daysBetween(today(), g.deadline);
  if (d < 0) return 'срок прошёл';
  return `осталось ${d} ${plural(d, 'день', 'дня', 'дней')}`;
}

function goalSummary(g) {
  if (g.kind === 'body') {
    return (g.metrics || []).map((m) => {
      const p = METRIC_PRESETS[m.key]; const cur = latestMetric(g.id, m.key)?.value ?? m.start;
      return `<span class="pill">${p.label}: <b>${cur != null ? num(cur, true) : '—'}</b>${m.target != null ? ` → ${num(m.target, true)}` : ''} ${p.unit}</span>`;
    }).join('');
  }
  if (g.kind === 'money') {
    const p = byId('piggies', g.piggyId);
    return p ? `<span class="pill">${money(piggySaved(p.id))}${p.target ? ` из ${money(p.target)}` : ''}</span>` : '';
  }
  if (g.kind === 'mind') {
    const { habits, rate } = habitStats(g.id);
    return `<span class="pill">${habits.length} ${plural(habits.length, 'привычка', 'привычки', 'привычек')}</span>${rate != null ? `<span class="pill">за 7 дней: <b>${Math.round(rate * 100)}%</b></span>` : ''}`;
  }
  return '';
}

function screenTimeSection() {
  const entries = [...state.screentime].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today(), -i);
    const e = entries.find((x) => x.date === d);
    last7.push({ label: humanDate(d), short: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][parseIso(d).getDay()], value: e ? e.totalMinutes / 60 : 0 });
  }
  const withData = last7.filter((x) => x.value > 0);
  const avg = withData.length ? withData.reduce((a, b) => a + b.value, 0) / withData.length : 0;
  const lastEntry = entries[entries.length - 1];
  return `<section class="section">
    <div class="section-head"><h2 class="section-title">Экранное время</h2><button class="link" data-action="add-screentime">＋ Добавить</button></div>
    <div class="card">
      ${entries.length ? `
        <p class="muted">В среднем за неделю: <b>${num(avg, true)} ч/день</b></p>
        ${columns(last7, { fmt: (v) => `${num(v, true)} ч` })}
        ${lastEntry?.apps?.length ? `<p class="eyebrow mt">Топ приложений · ${esc(humanDate(lastEntry.date))}</p>
          <ul class="mini-list">${[...lastEntry.apps].sort((a, b) => b.minutes - a.minutes).slice(0, 5).map((a) => `<li><span>${esc(a.name)}</span><b>${a.minutes} мин</b></li>`).join('')}</ul>` : ''}
        <button class="btn btn-ghost btn-block" data-action="list-screentime">Все записи</button>`
        : `<p class="muted">Скриншот «Экранного времени» можно отправить Авроре: она сама разберёт цифры. Меньше бесцельного скролла — больше времени на цели.</p>`}
    </div>
  </section>`;
}

export function render() {
  const goals = active('goals');
  return `
  <header class="page-head"><h1>Цели</h1>
    <div class="row gap"><button class="icon-btn lg" data-action="nav" data-to="tasks" aria-label="Задачи и привычки">${icon('checklist', { size: 20 })}</button>
    <button class="icon-btn lg tinted" data-action="add-goal" aria-label="Новая цель">${icon('plus', { size: 22, w: 2.2 })}</button></div></header>
  ${goals.length ? goals.map((g) => {
    const p = goalProgress(g);
    return `<article class="card goal" data-action="open-goal" data-id="${g.id}">
      <div class="goal-head">
        ${ring(p, 64, 7)}
        <div class="grow">
          <p class="eyebrow">${KIND_LABEL[g.kind]}${g.deadline ? ' · ' + esc(deadlineText(g)) : ''}</p>
          <h3>${icon(GOAL_ICON[g.kind] || 'target', { size: 18, cls: 'inline' })} ${esc(g.title)}</h3>
          ${g.why ? `<p class="muted small">«${esc(g.why)}»</p>` : ''}
        </div>
      </div>
      <div class="pills">${goalSummary(g)}</div>
    </article>`;
  }).join('') : emptyState('target', 'Целей пока нет', 'Поставь цель: рельефное тело, ясная голова, свой дом. Аврора будет считать прогресс.',
    '<button class="btn btn-primary" data-action="add-goal">Поставить цель</button>')}
  ${screenTimeSection()}
  `;
}

function openGoal(g) {
  const p = goalProgress(g);
  let body = `<div class="goal-detail-head">${ring(p, 84, 8)}<div>
      <p class="eyebrow">${KIND_LABEL[g.kind]}</p>
      ${g.deadline ? `<p class="muted">До ${esc(humanDate(g.deadline))} · ${esc(deadlineText(g))}</p>` : ''}
      ${g.why ? `<p class="small">«${esc(g.why)}»</p>` : ''}
    </div></div>`;

  if (g.kind === 'body') {
    body += `<button class="btn btn-primary btn-block" data-act="metric">＋ Новый замер</button>`;
    for (const m of g.metrics || []) {
      const preset = METRIC_PRESETS[m.key];
      const entries = metricEntries(g.id, m.key);
      const mp = metricProgress(g, m);
      const cur = entries[entries.length - 1]?.value;
      const first = entries[0]?.value;
      body += `<section class="card flat">
        <div class="section-head"><h3 class="card-title">${preset.label}</h3>
          <span class="muted">${cur != null ? `${num(cur, true)} ${preset.unit}` : '—'}${first != null && cur != null && entries.length > 1 ? ` (${cur - first > 0 ? '+' : ''}${num(cur - first, true)})` : ''}</span></div>
        ${mp != null ? bar(mp) : ''}
        ${lineChart(entries.map((e) => ({ date: e.date, value: e.value })), { unit: preset.unit, target: m.target })}
        ${entries.length ? `<details><summary class="muted small">История (${entries.length})</summary>
          <ul class="mini-list">${[...entries].reverse().map((e) => `<li><span>${esc(humanDate(e.date))}</span><b>${num(e.value, true)} ${preset.unit}</b>
            <button class="icon-btn sm" data-del-metric="${e.id}" aria-label="Удалить замер">${icon('close', { size: 14 })}</button></li>`).join('')}</ul></details>` : ''}
      </section>`;
    }
    const linked = active('tasks').filter((t) => t.goalId === g.id);
    body += habitsBlock(linked, g);
  }
  if (g.kind === 'money') {
    const pg = byId('piggies', g.piggyId);
    if (pg) {
      body += `<section class="card flat"><p>В копилке: <b>${money(piggySaved(pg.id))}</b>${pg.target ? ` из ${money(pg.target)}` : ''}</p>
        ${pg.target ? bar(piggySaved(pg.id) / pg.target) : ''}
        <div class="row gap mt"><button class="btn btn-primary grow" data-act="piggy-in">＋ Отложить</button>
        <button class="btn btn-ghost grow" data-act="piggy-out">Забрать</button></div></section>`;
    }
    body += habitsBlock(active('tasks').filter((t) => t.goalId === g.id), g);
  }
  if (g.kind === 'mind' || g.kind === 'custom') {
    body += habitsBlock(active('tasks').filter((t) => t.goalId === g.id), g);
  }
  body += `<div class="row gap mt"><button class="btn btn-ghost grow" data-act="edit">Изменить</button>
    <button class="btn btn-ghost grow" data-act="archive">В архив</button></div>`;

  openSheet({
    title: g.title,
    body,
    wide: true,
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        const delM = e.target.closest('[data-del-metric]')?.dataset.delMetric;
        const tog = e.target.closest('[data-toggle]')?.dataset.toggle;
        if (delM) {
          if (await confirmSheet('Удалить замер?', 'Значение пропадёт из истории и графика.')) {
            await remove('metrics', delM); close(); openGoal(byId('goals', g.id));
          }
          return;
        }
        if (tog) { await toggleTask(byId('tasks', tog)); close(); openGoal(byId('goals', g.id)); return; }
        if (!act) return;
        if (act === 'metric') { close(); metricForm(g); }
        if (act === 'edit') { close(); goalForm(g); }
        if (act === 'archive') {
          await save('goals', { ...g, archived: true }); close(); toast('Цель в архиве');
        }
        if (act === 'habit') { close(); taskForm(null, { goalId: g.id, repeat: 'daily' }); }
        if (act === 'piggy-in') { close(); piggyMoveForm(byId('piggies', g.piggyId), 'in'); }
        if (act === 'piggy-out') { close(); piggyMoveForm(byId('piggies', g.piggyId), 'out'); }
      });
    },
  });
}

function habitsBlock(tasks, g) {
  return `<section class="card flat">
    <div class="section-head"><h3 class="card-title">Привычки и задачи</h3><button class="link" data-act="habit">＋ Добавить</button></div>
    ${tasks.length ? `<ul class="checklist">${tasks.map((t) => {
      const done = isDone(t); const st = streak(t);
      return `<li class="${done ? 'done' : ''}"><button class="check-btn" data-toggle="${t.id}" aria-label="Отметить">${done ? icon('check', { size: 14, w: 3 }) : ''}</button>
        <div class="grow"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${t.repeat === 'daily' ? 'каждый день' : t.repeat === 'weekly' ? `${weekProgress(t).done}/${weekProgress(t).target} на неделе` : (t.due ? esc(humanDate(t.due)) : '')}${st > 1 ? ` · ${icon('flame', { size: 12, w: 2, cls: 'inline' })} ${st}` : ''}</span></div></li>`;
    }).join('')}</ul>` : `<p class="muted small">${g.kind === 'body' ? 'Например: «Силовая тренировка», «Белок 150 г», «10 000 шагов».' : 'Добавь ежедневные действия, которые приближают к цели.'}</p>`}
  </section>`;
}

function listScreentime() {
  const entries = [...state.screentime].sort((a, b) => b.date.localeCompare(a.date));
  const close = openSheet({
    title: 'Экранное время',
    body: `<ul class="list card">${entries.map((e) => `<li class="row-item" data-st="${e.id}">
      ${tile('phoneapp')}<div class="grow"><span class="row-title">${esc(humanDate(e.date))}</span>
      <span class="row-sub">${esc((e.apps || []).slice(0, 3).map((a) => a.name).join(', '))}</span></div>
      <span class="row-amount">${Math.floor(e.totalMinutes / 60)} ч ${e.totalMinutes % 60} мин</span></li>`).join('')}</ul>`,
    onMount(el) {
      el.addEventListener('click', (ev) => {
        const id = ev.target.closest('[data-st]')?.dataset.st;
        if (id) { close(); screentimeForm(byId('screentime', id)); }
      });
    },
  });
}

export const actions = {
  'add-goal': () => goalForm(),
  'open-goal': (el) => openGoal(byId('goals', el.dataset.id)),
  'add-screentime': () => screentimeForm(),
  'list-screentime': () => listScreentime(),
};
