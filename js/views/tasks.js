import { active, byId, isDone, toggleTask, streak, save, weekProgress } from '../store.js';
import { icon } from '../icons.js';
import { esc, humanDate, today, isoDate } from '../util.js';
import { emptyState, toast } from '../ui.js';
import { taskForm } from '../forms.js';

let seg = 'today';

export function weekLabel(t) {
  const { done, target } = weekProgress(t);
  return `${done}/${target} на этой неделе${done >= target ? ' · готово' : ''}`;
}

function row(t) {
  const done = isDone(t); const st = streak(t); const g = t.goalId ? byId('goals', t.goalId) : null;
  const overdue = (!t.repeat || t.repeat === 'none') && !t.done && t.due && t.due < today();
  const meta = [
    t.repeat === 'daily' ? 'каждый день' : t.repeat === 'weekly' ? weekLabel(t) : t.due ? esc(humanDate(t.due)) : '',
    g ? esc(g.title) : '',
    st > 1 ? `${icon('flame', { size: 12, w: 2, cls: 'inline' })} ${st} ${st < 5 ? 'дня' : 'дней'} подряд` : '',
  ].filter(Boolean).join(' · ');
  return `<li class="${done ? 'done' : ''}">
    <button class="check-btn" data-action="toggle" data-id="${t.id}" aria-label="${done ? 'Снять отметку' : 'Выполнено'}">${done ? icon('check', { size: 14, w: 3 }) : ''}</button>
    <div class="grow" data-action="edit" data-id="${t.id}">
      <span class="task-title">${t.important ? icon('star', { size: 14, w: 2, cls: 'inline' }) + ' ' : ''}${esc(t.title)}</span>
      <span class="task-meta">${meta}${overdue ? ' · <span class="neg">просрочено</span>' : ''}</span>
      ${t.note ? `<span class="task-note">${esc(t.note)}</span>` : ''}
    </div>
  </li>`;
}

function list(items, emptyText) {
  return items.length ? `<ul class="checklist card">${items.map(row).join('')}</ul>` : `<p class="muted center pad">${emptyText}</p>`;
}

export function render() {
  const all = active('tasks');
  const t = today();
  const habits = all.filter((x) => x.repeat === 'daily' || x.repeat === 'weekly');
  const once = all.filter((x) => !x.repeat || x.repeat === 'none');
  const byImportance = (a, b) => Number(!!b.important) - Number(!!a.important) || (a.due || '9').localeCompare(b.due || '9');
  let body = '';
  if (seg === 'today') {
    const todayOnce = once.filter((x) => (!x.done && (!x.due || x.due <= t)) || (x.done && x.doneAt && isoDate(x.doneAt) === t)).sort(byImportance);
    const doneCount = habits.filter((h) => isDone(h)).length;
    body = `<h2 class="section-title">Привычки <span class="muted">${doneCount}/${habits.length}</span></h2>
      ${list(habits, 'Добавь ежедневные привычки: тренировка, чтение, сон.')}
      <h2 class="section-title">Задачи на сегодня</h2>
      ${list(todayOnce, 'Задач на сегодня нет')}`;
  } else if (seg === 'upcoming') {
    const up = once.filter((x) => !x.done && x.due && x.due > t).sort((a, b) => a.due.localeCompare(b.due));
    body = list(up, 'Запланированных задач нет');
  } else {
    const done = once.filter((x) => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    body = done.length ? `${list(done.slice(0, 50), '')}
      <button class="btn btn-ghost btn-block" data-action="archive-done">Убрать выполненные в архив</button>` : `<p class="muted center pad">Пока ничего не выполнено</p>`;
  }
  return `
  <header class="page-head"><button class="icon-btn lg" data-action="nav" data-to="today" aria-label="Назад">${icon('back', { size: 20, w: 2.2 })}</button><h1 class="grow">Задачи</h1>
    <button class="icon-btn lg tinted" data-action="add" aria-label="Новая задача">${icon('plus', { size: 22, w: 2.2 })}</button></header>
  <div class="segmented sticky" role="tablist">
    ${[['today', 'Сегодня'], ['upcoming', 'Впереди'], ['done', 'Выполнено']].map(([v, l]) => `
      <button role="tab" class="${seg === v ? 'on' : ''}" aria-selected="${seg === v}" data-action="seg" data-seg="${v}">${l}</button>`).join('')}
  </div>
  ${!all.length ? emptyState('checklist', 'Задач пока нет', 'Разбей цели на маленькие шаги. Ежедневные привычки дают самый большой результат.',
    '<button class="btn btn-primary" data-action="add">Добавить задачу</button>') : body}
  <button class="fab" data-action="add" aria-label="Новая задача">${icon('plus', { size: 28, w: 2.2 })}</button>`;
}

export const actions = {
  seg: (el, _e, rerender) => { seg = el.dataset.seg; rerender(); },
  add: () => taskForm(),
  edit: (el) => taskForm(byId('tasks', el.dataset.id)),
  toggle: async (el) => {
    const t = byId('tasks', el.dataset.id);
    if (!t) return;
    const was = isDone(t);
    await toggleTask(t);
    if (!was) toast('Готово');
  },
  'archive-done': async () => {
    const done = active('tasks').filter((x) => (!x.repeat || x.repeat === 'none') && x.done);
    for (const t of done) await save('tasks', { ...t, archived: true });
    toast(`В архиве: ${done.length}`);
  },
};
