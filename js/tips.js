// Подсказки: умные (по твоим данным) + полезные советы по целям.
import { dueSteps } from './deals.js';
import {
  state, active, monthStats, expenseBetween, piggyMonthlyNeed, duePayments, staleDeals, clientName, personalAccounts,
  latestMetric, todayTasks, isDone, byId, accountBalance,
} from './store.js';
import { today, addDays, monthKey, money, daysBetween, plural } from './util.js';

const BODY_TIPS = [
  'Чтобы сушиться без потери мышц, нужно 1,6–2,2 г белка на кг веса каждый день.',
  'Дефицит 300–500 ккал в день: жир уходит, а силовые показатели держатся.',
  'Силовые 3–4 раза в неделю — главный сигнал телу сохранять мышцы на сушке.',
  'Сон 7–9 часов снижает тягу к сладкому и помогает восстанавливаться.',
  '8–10 тысяч шагов в день — простой способ сжечь лишнее без вреда для тренировок.',
  'Взвешивайся утром натощак и смотри на тренд за неделю, а не на одну цифру.',
  'Замеры талии честнее весов: на рекомпозиции вес может стоять, а талия уменьшаться.',
  'Вода: примерно 30–35 мл на кг веса. Жажду легко спутать с голодом.',
];

const MIND_TIPS = [
  'Первый час после пробуждения без телефона — лучший старт для фокуса.',
  '20 минут чтения в день — это примерно 15–20 книг в год.',
  'Техника «помидора»: 25 минут работы, 5 минут отдыха, без уведомлений.',
  'Тренировки улучшают не только тело, но и память и концентрацию.',
  'Записывай 3 вещи, за которые благодарен сегодня: это снижает тревожность.',
  'Учи что-то новое по 30 минут: язык, навык, курс. Мозгу нужна нагрузка, как мышцам.',
];

const MONEY_TIPS = [
  'Правило 50/30/20: 50% на нужное, 30% на желания, 20% в копилку.',
  'Сначала заплати себе: переводи в копилку в день дохода, а не то, что осталось.',
  'Держи подушку безопасности на 3–6 месяцев расходов отдельно от целей.',
  'Большие суммы наличными дома рискованны. Подумай о вкладе или накопительном счёте.',
  'Записывай траты сразу: через неделю мелочи забываются, а на них уходит много.',
];

export function smartTips() {
  const tips = [];
  const t = today();

  // Финансы: сравнение трат с прошлым месяцем на ту же дату
  const day = Number(t.slice(8, 10));
  const thisMonth = monthStats();
  const prevStart = monthKey(addDays(t.slice(0, 8) + '01', -1)) + '-01';
  const prevSame = expenseBetween(prevStart, addDays(prevStart, day - 1));
  if (prevSame > 0 && thisMonth.expense > prevSame * 1.15) {
    tips.push({ icon: 'trend', text: `Траты в этом месяце на ${Math.round((thisMonth.expense / prevSame - 1) * 100)}% выше, чем в прошлом на эту же дату.`, tab: 'money' });
  }
  if (thisMonth.cats[0] && thisMonth.expense > 0 && thisMonth.cats[0].sum / thisMonth.expense > 0.4 && thisMonth.cats.length > 1) {
    tips.push({ icon: 'search', text: `Больше всего денег уходит на «${thisMonth.cats[0].cat.name}»: ${Math.round(thisMonth.cats[0].sum / thisMonth.expense * 100)}% трат месяца.`, tab: 'money' });
  }
  const noTxDays = state.transactions.length ? daysBetween(state.transactions.map((x) => x.date).sort().pop(), t) : null;
  if (noTxDays != null && noTxDays >= 3) {
    tips.push({ icon: 'pencil', text: `Ты не записывал траты уже ${noTxDays} ${plural(noTxDays, 'день', 'дня', 'дней')}. Быстро добавь их через «+» или напиши Авроре.`, tab: 'money' });
  }

  // Наличка
  const cash = personalAccounts().filter((a) => a.type === 'cash').reduce((s, a) => s + accountBalance(a.id), 0);
  if (cash >= 200000 && cash > 0.7 * (cash + personalAccounts().filter((a) => a.type !== 'cash').reduce((s, a) => s + accountBalance(a.id), 0))) {
    tips.push({ icon: 'lightbulb', text: `Почти все деньги (${money(cash)}) лежат наличными. Часть можно положить на накопительный счёт, чтобы они приносили процент.`, tab: 'money' });
  }

  // Бизнес: просроченные и сегодняшние платежи, зависшие сделки
  const due = duePayments(null, 0);
  const latePay = due.filter((s) => s.nextDate < t);
  if (latePay.length) {
    const sum = latePay.reduce((a, s) => a + Number(s.amount), 0);
    tips.push({ icon: 'creditcard', text: `${latePay.length} ${plural(latePay.length, 'клиент просрочил', 'клиента просрочили', 'клиентов просрочили')} оплату на ${money(sum)}. Напомни им.`, tab: 'business' });
  }
  const todayDue = due.filter((s) => s.nextDate === t);
  if (todayDue.length) tips.push({ icon: 'calendar', text: `Сегодня ждём оплату: ${todayDue.map((s) => clientName(s.clientId) || s.title).slice(0, 3).join(', ')}.`, tab: 'business' });
  const steps = dueSteps();
  if (steps.length) tips.push({ icon: 'clock', text: `Сегодня по сделкам: ${steps.slice(0, 2).map((d) => d.nextStep).join('; ')}${steps.length > 2 ? ` и ещё ${steps.length - 2}` : ''}.`, tab: 'business' });
  const stale = staleDeals(7);
  if (stale.length) tips.push({ icon: 'funnel', text: `${stale.length} ${plural(stale.length, 'сделка не двигается', 'сделки не двигаются', 'сделок не двигаются')} больше недели. Свяжись с клиентами: «${stale[0].title}».`, tab: 'business' });

  // Копилки
  for (const p of active('piggies')) {
    const need = piggyMonthlyNeed(p);
    if (need && need > 0) tips.push({ icon: 'piggy', text: `«${p.name}»: чтобы успеть к сроку, откладывай около ${money(need)} в месяц.`, tab: 'money' });
  }

  // Тело: давно не взвешивался
  for (const g of active('goals').filter((x) => x.kind === 'body')) {
    const w = latestMetric(g.id, 'weight') || latestMetric(g.id, 'bodyFat');
    const d = w ? daysBetween(w.date, t) : null;
    if (d == null) tips.push({ icon: 'scale', text: `Добавь первый замер для цели «${g.title}», чтобы видеть прогресс.`, tab: 'goals' });
    else if (d >= 7) tips.push({ icon: 'scale', text: `Последний замер был ${d} ${plural(d, 'день', 'дня', 'дней')} назад. Взвесься утром натощак.`, tab: 'goals' });
  }

  // Задачи
  const overdue = active('tasks').filter((x) => (!x.repeat || x.repeat === 'none') && !x.done && x.due && x.due < t);
  if (overdue.length) tips.push({ icon: 'clock', text: `${overdue.length} ${plural(overdue.length, 'задача просрочена', 'задачи просрочены', 'задач просрочено')}. Перенеси их или отметь выполненными.`, tab: 'tasks' });
  const habits = todayTasks().filter((x) => x.repeat === 'daily');
  const left = habits.filter((h) => !isDone(h));
  if (habits.length && !left.length) tips.push({ icon: 'flame', text: 'Все привычки на сегодня выполнены. Так держать!', tab: 'tasks' });

  // Финансовая цель без копилки
  for (const g of active('goals').filter((x) => x.kind === 'money' && !byId('piggies', x.piggyId))) {
    tips.push({ icon: 'piggy', text: `Привяжи копилку к цели «${g.title}», тогда прогресс будет считаться сам.`, tab: 'goals' });
  }
  return tips;
}

/** Совет дня: меняется раз в сутки */
export function dailyTip() {
  const kinds = new Set(active('goals').map((g) => g.kind));
  let pool = [...MONEY_TIPS];
  if (kinds.has('body') || !kinds.size) pool = pool.concat(BODY_TIPS);
  if (kinds.has('mind') || !kinds.size) pool = pool.concat(MIND_TIPS);
  const n = Math.floor(Date.now() / 86400000);
  return pool[n % pool.length];
}
