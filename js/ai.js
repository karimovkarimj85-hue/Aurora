// Встроенный ИИ: Claude через Anthropic SDK прямо из браузера (ключ хранится только на устройстве).
import Anthropic from '../vendor/anthropic-sdk-1.5.0.mjs';
import {
  state, save, remove, active, byId, accountBalance, piggySaved, monthStats, goalProgress,
  latestMetric, todayTasks, isDone, streak, toggleTask, METRIC_PRESETS, sortedTransactions, habitStats, upsertMetric,
  personalAccounts, DEAL_STAGES, PERIODS, bizMonthStats, mrr, duePayments, pipeline, businessAccount, paySubscription,
  clientName, bizBalance, addMonths,
} from './store.js';
import { today, money, monthKey, addDays, CURRENCIES, num } from './util.js';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'самый умный (по умолчанию)', fallback: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'быстрее и дешевле', fallback: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'самый дешёвый', fallback: false },
];

export const EFFORTS = [
  { id: 'low', name: 'Быстро', note: 'для записи трат и коротких вопросов' },
  { id: 'medium', name: 'Вдумчиво', note: 'для советов и планов' },
  { id: 'high', name: 'Глубоко', note: 'для подробного разбора, дороже' },
];

const SYSTEM = () => {
  const cur = CURRENCIES.find((c) => c.code === state.settings.currency) || CURRENCIES[0];
  return `Ты — Аврора, личный помощник в одноимённом приложении на iPhone. Твоя задача — помогать пользователю${state.settings.name ? ` по имени ${state.settings.name}` : ''} вести финансы и двигаться к целям.

Цели пользователя, о которых ты знаешь заранее:
• Тело: не просто похудеть, а «подсушиться» — снизить процент жира и вернуть мышцам тонус (рекомпозиция).
• Мозг: вернуть ясность, фокус и тонус головы через привычки.
• Деньги: копить на большие цели, в том числе на свой дом.
• Бизнес: у пользователя свои бизнесы — ZK POS (POS-системы: продажа, внедрение и обслуживание касс) и Gain CRM (CRM-система по подписке). Помогай вести клиентов, сделки, регулярные платежи и прибыль. Деньги бизнеса учитываются отдельно от личных.
Актуальные цифры, цели, задачи и балансы бери через инструмент get_overview, не выдумывай их.

Валюта пользователя: ${cur.name} (${cur.symbol}). Все суммы — в этой валюте.

Как работать:
• Пиши по-русски, коротко и по делу, дружелюбно, без канцелярита. На простой ввод вроде «кофе 350» отвечай одной строкой после записи.
• Если пользователь сообщает о трате, доходе, замере, задаче или экранном времени — сразу записывай через инструменты, не переспрашивая, когда смысл ясен. Если неясна только сумма или тип, уточни одним вопросом.
• Суммы вида «1,5к», «40k», «2 млн» переводи в числа. Дата по умолчанию — сегодня; «вчера» — вчерашняя дата.
• Скриншот «Экранного времени» iPhone: извлеки общую длительность и время по приложениям и запиши через log_screen_time. Чек или скриншот банка: извлеки сумму, категорию и дату и запиши трату.
• Экспорт чата из Telegram (текст или JSON): анализируй переписку по просьбе пользователя — темы, настроение, сколько времени уходит, договорённости и задачи из неё (предложи добавить их).
• Советы по рекомпозиции давай на основе доказательных принципов: умеренный дефицит калорий, достаточно белка, силовые тренировки, сон, шаги. Ты не врач: при проблемах со здоровьем советуй обратиться к специалисту.
• Финансовые советы — практичные: бюджет, подушка безопасности, регулярные отчисления в копилки. Не рекомендуй конкретные рискованные инвестиции.
• Если в сообщении речь о бизнесе (клиент, продажа, касса, внедрение, подписка, лид), записывай в бизнес через add_transaction с полем business или бизнес-инструментами. Название бизнеса бери из get_overview; если бизнес неочевиден — спроси.
• Для бизнес-советов: следи за воронкой, просроченными оплатами, регулярным доходом (MRR), маржой и тем, какие клиенты приносят больше всего.
• Используй эмодзи умеренно. Не используй таблицы Markdown — экран телефона узкий; списки допустимы.`;
};

// ---------- Инструменты ----------

function tools() {
  const expenseCats = state.categories.filter((c) => c.kind === 'expense' && c.scope !== 'biz').map((c) => c.id);
  const incomeCats = state.categories.filter((c) => c.kind === 'income' && c.scope !== 'biz').map((c) => c.id);
  const bizExp = state.categories.filter((c) => c.kind === 'expense' && c.scope === 'biz').map((c) => c.id);
  const bizInc = state.categories.filter((c) => c.kind === 'income' && c.scope === 'biz').map((c) => c.id);
  const bizNames = state.businesses.filter((b) => !b.archived).map((b) => b.name);
  const t = (name, description, properties, required = []) => ({
    name, description, eager_input_streaming: true,
    input_schema: { type: 'object', properties, required, additionalProperties: false },
  });
  return [
    t('get_overview', 'Сводка данных пользователя: счета и балансы, копилки, расходы и доходы за месяц, цели и прогресс, задачи на сегодня, привычки, экранное время, список категорий. Вызывай перед советами и анализом.', {}),
    t('list_transactions', 'Список операций за период (для анализа трат).', {
      from: { type: 'string', description: 'Начальная дата YYYY-MM-DD' },
      to: { type: 'string', description: 'Конечная дата YYYY-MM-DD' },
      category: { type: 'string', description: 'id категории (необязательно)' },
      business: { type: 'string', description: 'Название бизнеса — тогда вернутся операции этого бизнеса; без него — личные' },
      limit: { type: 'integer', description: 'Максимум записей, по умолчанию 100' },
    }),
    t('add_transaction', 'Записать расход или доход (личный или бизнеса).', {
      type: { type: 'string', enum: ['expense', 'income'] },
      amount: { type: 'number', description: 'Сумма, положительное число' },
      business: { type: 'string', description: `Название бизнеса, если операция бизнесовая: ${bizNames.join(', ') || 'нет'}. Для личных не передавай.` },
      client: { type: 'string', description: 'Клиент бизнеса (имя или компания), если есть' },
      category: { type: 'string', enum: [...expenseCats, ...incomeCats, ...bizExp, ...bizInc], description: `Категория. Личные расходы: ${expenseCats.join(', ')}. Личные доходы: ${incomeCats.join(', ')}. Бизнес-расходы: ${bizExp.join(', ')}. Бизнес-доходы: ${bizInc.join(', ')}.` },
      account: { type: 'string', description: 'Название счёта, если пользователь его указал (иначе не передавай)' },
      date: { type: 'string', description: 'YYYY-MM-DD, по умолчанию сегодня' },
      note: { type: 'string', description: 'Короткий комментарий, например «кофе»' },
    }, ['type', 'amount', 'category']),
    t('add_task', 'Добавить задачу или привычку.', {
      title: { type: 'string' },
      due: { type: 'string', description: 'Дата YYYY-MM-DD для разовой задачи' },
      repeat: { type: 'string', enum: ['none', 'daily', 'weekly'], description: 'weekly — N раз в неделю (см. times_per_week)' },
      times_per_week: { type: 'integer', description: 'Для weekly: сколько раз в неделю, 1–7' },
      goal: { type: 'string', description: 'Название цели, к которой относится задача' },
      important: { type: 'boolean' },
    }, ['title']),
    t('complete_task', 'Отметить задачу или привычку выполненной сегодня.', {
      task: { type: 'string', description: 'Название задачи (можно примерно)' },
    }, ['task']),
    t('log_metric', 'Записать замер тела в цель «тело».', {
      metric: { type: 'string', enum: Object.keys(METRIC_PRESETS), description: 'weight — вес кг, bodyFat — % жира, waist — талия см, chest — грудь см, arm — бицепс см' },
      value: { type: 'number' },
      date: { type: 'string', description: 'YYYY-MM-DD, по умолчанию сегодня' },
    }, ['metric', 'value']),
    t('piggy_deposit', 'Положить деньги в копилку (или забрать — отрицательная сумма).', {
      piggy: { type: 'string', description: 'Название копилки' },
      amount: { type: 'number' },
      account: { type: 'string', description: 'Название счёта, с которого переводим' },
    }, ['piggy', 'amount']),
    t('create_piggy', 'Создать новую копилку.', {
      name: { type: 'string' },
      target: { type: 'number', description: 'Целевая сумма' },
      deadline: { type: 'string', description: 'YYYY-MM-DD' },
      emoji: { type: 'string' },
    }, ['name']),
    t('add_client', 'Добавить клиента в бизнес.', {
      business: { type: 'string', description: `Бизнес: ${bizNames.join(', ')}` },
      name: { type: 'string' },
      company: { type: 'string' },
      phone: { type: 'string' },
      telegram: { type: 'string' },
      status: { type: 'string', enum: ['lead', 'active', 'paused', 'lost'] },
      note: { type: 'string' },
    }, ['business', 'name']),
    t('add_deal', 'Создать сделку (продажу) в воронке бизнеса.', {
      business: { type: 'string', description: `Бизнес: ${bizNames.join(', ')}` },
      title: { type: 'string', description: 'Что продаём' },
      amount: { type: 'number' },
      client: { type: 'string', description: 'Имя клиента или компании; если такого нет — создастся' },
      stage: { type: 'string', enum: DEAL_STAGES.map((s) => s.id), description: DEAL_STAGES.map((s) => `${s.id} — ${s.name}`).join(', ') },
      expected_date: { type: 'string', description: 'Ожидаемая дата оплаты YYYY-MM-DD' },
    }, ['business', 'title']),
    t('update_deal', 'Изменить этап или сумму сделки. При этапе won можно сразу записать оплату (record_payment=true).', {
      deal: { type: 'string', description: 'Название сделки или клиента (можно примерно)' },
      stage: { type: 'string', enum: DEAL_STAGES.map((s) => s.id) },
      amount: { type: 'number' },
      record_payment: { type: 'boolean', description: 'Записать доход на сумму сделки (только для won)' },
    }, ['deal']),
    t('add_subscription', 'Добавить регулярный платёж клиента: подписка на CRM, абонентское обслуживание касс и т.п.', {
      business: { type: 'string', description: `Бизнес: ${bizNames.join(', ')}` },
      client: { type: 'string' },
      title: { type: 'string', description: 'Тариф или услуга' },
      amount: { type: 'number' },
      period: { type: 'string', enum: Object.keys(PERIODS) },
      next_date: { type: 'string', description: 'Дата следующей оплаты YYYY-MM-DD' },
    }, ['business', 'client', 'amount']),
    t('record_subscription_payment', 'Отметить, что клиент оплатил регулярный платёж (запишет доход и сдвинет дату следующей оплаты).', {
      client: { type: 'string', description: 'Клиент или название тарифа' },
      amount: { type: 'number', description: 'Если отличается от обычной суммы' },
    }, ['client']),
    t('log_screen_time', 'Записать экранное время за день (например, со скриншота «Экранного времени»).', {
      date: { type: 'string', description: 'YYYY-MM-DD' },
      total_minutes: { type: 'integer' },
      apps: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, minutes: { type: 'integer' } }, required: ['name', 'minutes'], additionalProperties: false },
      },
    }, ['date', 'total_minutes']),
  ];
}

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
function fuzzy(list, query, key = 'name') {
  const q = norm(query);
  if (!q) return null;
  return list.find((x) => norm(x[key]) === q)
    || list.find((x) => norm(x[key]).includes(q) || q.includes(norm(x[key])))
    || null;
}
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fail = (msg) => { throw new Error(msg); };

function overview() {
  const t = today();
  const m = monthStats();
  const prevKey = monthKey(addDays(t.slice(0, 8) + '01', -1));
  const prev = monthStats(prevKey);
  const st = [...state.screentime].filter((x) => x.date >= addDays(t, -6)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    today: t,
    currency: state.settings.currency,
    accounts: personalAccounts().map((a) => ({ name: a.name, type: a.type, balance: accountBalance(a.id) })),
    businesses: active('businesses').map((b) => {
      const ms = bizMonthStats(b.id);
      return {
        name: b.name, model: b.kind, about: b.about, balance: bizBalance(b), revenue_goal: b.revenueGoal || null,
        this_month: { revenue: ms.income, expenses: ms.expense, profit: ms.profit, top_expenses: ms.cats.slice(0, 5).map((c) => ({ category: c.cat.name, sum: c.sum })) },
        mrr: mrr(b.id),
        pipeline: pipeline(b.id).filter((p) => p.count).map((p) => ({ stage: p.name, count: p.count, sum: p.sum, deals: p.open ? p.deals.slice(0, 10).map((d) => ({ title: d.title, amount: d.amount, client: clientName(d.clientId), expected: d.expectedDate })) : undefined })),
        clients_total: active('clients').filter((c) => c.businessId === b.id).length,
        payments_next_14_days: duePayments(b.id, 14).map((s) => ({ client: clientName(s.clientId), title: s.title, amount: s.amount, date: s.nextDate, overdue: s.nextDate < t })),
      };
    }),
    piggies: active('piggies').map((p) => ({ name: p.name, saved: piggySaved(p.id), target: p.target, deadline: p.deadline })),
    this_month: { income: m.income, expense: m.expense, top_categories: m.cats.slice(0, 6).map((c) => ({ category: c.cat.name, sum: c.sum })) },
    previous_month: { income: prev.income, expense: prev.expense },
    goals: active('goals').map((g) => ({
      title: g.title, kind: g.kind, deadline: g.deadline, why: g.why,
      progress_percent: goalProgress(g) == null ? null : Math.round(goalProgress(g) * 100),
      metrics: g.kind === 'body' ? (g.metrics || []).map((mm) => ({ metric: mm.key, start: mm.start, target: mm.target, current: latestMetric(g.id, mm.key)?.value ?? null, last_date: latestMetric(g.id, mm.key)?.date ?? null })) : undefined,
      habits_week_rate: g.kind === 'mind' ? habitStats(g.id).rate : undefined,
    })),
    today_tasks: todayTasks().map((x) => ({ title: x.title, repeat: x.repeat || 'none', done: isDone(x), streak: streak(x), due: x.due || null })),
    screen_time_last7: st.map((x) => ({ date: x.date, minutes: x.totalMinutes, top: (x.apps || []).slice(0, 5) })),
    categories: state.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  };
}

function findBiz(name) {
  const list = active('businesses');
  if (!list.length) fail('У пользователя нет бизнесов');
  const b = fuzzy(list, name) || (list.length === 1 ? list[0] : null);
  if (!b) fail(`Бизнес «${name || ''}» не найден. Есть: ${list.map((x) => x.name).join(', ')}`);
  return b;
}

async function findOrCreateClient(biz, query, status = 'lead') {
  const list = active('clients').filter((c) => c.businessId === biz.id);
  const q = norm(query);
  const found = list.find((c) => norm(c.name) === q || norm(c.company) === q)
    || list.find((c) => (q && (norm(c.name).includes(q) || norm(c.company).includes(q))));
  if (found) return found;
  return save('clients', { businessId: biz.id, name: String(query).slice(0, 80), status });
}

function bodyGoal() {
  return active('goals').find((g) => g.kind === 'body');
}

/** Выполнить инструмент. Возвращает {text, label, undo?} или бросает ошибку. */
async function execute(name, input) {
  const i = input || {};
  switch (name) {
    case 'get_overview':
      return { text: JSON.stringify(overview()), label: null };
    case 'list_transactions': {
      const from = isDate(i.from) ? i.from : addDays(today(), -30);
      const to = isDate(i.to) ? i.to : today();
      const bz = i.business ? findBiz(i.business) : null;
      const list = sortedTransactions(bz?.id || null)
        .filter((x) => x.date >= from && x.date <= to && (!i.category || x.categoryId === i.category))
        .slice(0, Math.min(Number(i.limit) || 100, 300))
        .map((x) => ({
          date: x.date, type: x.type, amount: x.amount,
          category: byId('categories', x.categoryId)?.name, note: x.note || undefined,
          account: byId('accounts', x.accountId)?.name,
        }));
      return { text: JSON.stringify(list), label: null };
    }
    case 'add_transaction': {
      if (!['expense', 'income'].includes(i.type)) fail('type должен быть expense или income');
      const amount = Number(i.amount);
      if (!(amount > 0)) fail('Сумма должна быть больше нуля');
      const biz = i.business ? findBiz(i.business) : null;
      let cat = byId('categories', i.category);
      if (biz && (!cat || cat.scope !== 'biz')) cat = byId('categories', i.type === 'income' ? 'biz_in_other' : 'biz_other');
      if (!biz && (!cat || cat.scope === 'biz')) cat = byId('categories', i.type === 'income' ? 'other_in' : 'other');
      const accounts = biz ? active('accounts').filter((a) => a.businessId === biz.id) : personalAccounts();
      if (!accounts.length) fail('Нет подходящего счёта — попроси добавить счёт');
      const acc = (biz ? null : fuzzy(accounts, i.account)) || (biz ? businessAccount(biz) : null) || accounts[0];
      const client = biz && i.client ? await findOrCreateClient(biz, i.client) : null;
      const tx = await save('transactions', {
        type: i.type, amount, categoryId: cat.id, accountId: acc.id, businessId: biz?.id, clientId: client?.id,
        date: isDate(i.date) ? i.date : today(), note: (i.note || '').slice(0, 120),
      });
      return {
        text: `Записано${biz ? ` в бизнес ${biz.name}` : ''}. Баланс «${acc.name}»: ${money(accountBalance(acc.id))}`,
        label: `${biz ? biz.name + ': ' : ''}${i.type === 'income' ? 'доход' : 'расход'} ${money(amount)} · ${cat.emoji} ${cat.name}${i.note ? ' · ' + i.note : ''}`,
        undo: () => remove('transactions', tx.id),
      };
    }
    case 'add_task': {
      if (!i.title) fail('Нужно название задачи');
      const goal = fuzzy(active('goals'), i.goal, 'title');
      const repeat = ['none', 'daily', 'weekly'].includes(i.repeat) ? i.repeat : 'none';
      const task = await save('tasks', {
        title: String(i.title).slice(0, 140), repeat, due: repeat === 'none' && isDate(i.due) ? i.due : null,
        goalId: goal?.id || null, important: !!i.important, doneDates: [],
        timesPerWeek: repeat === 'weekly' ? Math.min(7, Math.max(1, Number(i.times_per_week) || 1)) : undefined,
      });
      return {
        text: 'Задача добавлена',
        label: `Задача: ${task.title}${repeat === 'daily' ? ' · каждый день' : repeat === 'weekly' ? ' · по неделям' : ''}`,
        undo: () => remove('tasks', task.id),
      };
    }
    case 'complete_task': {
      const task = fuzzy(active('tasks'), i.task, 'title');
      if (!task) fail(`Задача «${i.task}» не найдена. Существующие: ${active('tasks').map((x) => x.title).join(', ') || 'нет'}`);
      if (isDone(task)) return { text: 'Уже отмечена выполненной', label: `✓ ${task.title}` };
      await toggleTask(task);
      return { text: 'Отмечено', label: `✓ ${task.title}`, undo: () => toggleTask(byId('tasks', task.id)) };
    }
    case 'log_metric': {
      const preset = METRIC_PRESETS[i.metric];
      if (!preset) fail('Неизвестная метрика');
      const value = Number(i.value);
      if (!(value > 0)) fail('Значение должно быть больше нуля');
      let g = bodyGoal();
      if (!g) {
        g = await save('goals', { kind: 'body', title: 'Рельеф и тонус', emoji: '💪', metrics: [{ key: i.metric, start: value, target: null }] });
      } else if (!(g.metrics || []).some((m) => m.key === i.metric)) {
        g = await save('goals', { ...g, metrics: [...(g.metrics || []), { key: i.metric, start: value, target: null }] });
      }
      const date = isDate(i.date) ? i.date : today();
      const prevM = state.metrics.find((x) => x.goalId === g.id && x.key === i.metric && x.date === date);
      const prevCopy = prevM ? { ...prevM } : null;
      const m = await upsertMetric(g.id, i.metric, value, date);
      return {
        text: 'Замер записан', label: `${preset.label}: ${value} ${preset.unit}`,
        undo: () => (prevCopy ? save('metrics', prevCopy) : remove('metrics', m.id)),
      };
    }
    case 'piggy_deposit': {
      const p = fuzzy(active('piggies'), i.piggy);
      if (!p) fail(`Копилка «${i.piggy}» не найдена. Есть: ${active('piggies').map((x) => x.name).join(', ') || 'нет'}`);
      const amount = Number(i.amount);
      if (!amount) fail('Сумма не может быть нулём');
      if (amount < 0 && -amount > piggySaved(p.id)) fail('В копилке меньше денег');
      const accounts = active('accounts');
      if (!accounts.length) fail('Нет счетов');
      const acc = fuzzy(accounts, i.account) || accounts[0];
      const tx = await save('transactions', { type: 'piggy', piggyId: p.id, accountId: acc.id, amount, date: today() });
      return {
        text: `Готово. В копилке: ${money(piggySaved(p.id))}`,
        label: `${p.emoji || '🐷'} ${amount > 0 ? 'В копилку' : 'Из копилки'} «${p.name}»: ${money(Math.abs(amount))}`,
        undo: () => remove('transactions', tx.id),
      };
    }
    case 'create_piggy': {
      if (!i.name) fail('Нужно название');
      const p = await save('piggies', {
        name: String(i.name).slice(0, 60), emoji: i.emoji || '🐷', target: Number(i.target) > 0 ? Number(i.target) : null,
        deadline: isDate(i.deadline) ? i.deadline : null, initial: 0,
      });
      return { text: 'Копилка создана', label: `${p.emoji} Копилка «${p.name}»`, undo: () => remove('piggies', p.id) };
    }
    case 'add_client': {
      const biz = findBiz(i.business);
      if (!i.name) fail('Нужно имя клиента');
      const c = await save('clients', {
        businessId: biz.id, name: String(i.name).slice(0, 80), company: i.company || '', phone: i.phone || '',
        telegram: i.telegram || '', status: ['lead', 'active', 'paused', 'lost'].includes(i.status) ? i.status : 'lead', note: i.note || '',
      });
      return { text: 'Клиент добавлен', label: `${biz.name}: клиент ${c.name}${c.company ? ' · ' + c.company : ''}`, undo: () => remove('clients', c.id) };
    }
    case 'add_deal': {
      const biz = findBiz(i.business);
      if (!i.title) fail('Нужно название сделки');
      const client = i.client ? await findOrCreateClient(biz, i.client) : null;
      const stage = DEAL_STAGES.some((s) => s.id === i.stage) ? i.stage : 'lead';
      const d = await save('deals', {
        businessId: biz.id, title: String(i.title).slice(0, 120), amount: Number(i.amount) || 0, clientId: client?.id || null,
        stage, expectedDate: isDate(i.expected_date) ? i.expected_date : null, stageChangedAt: new Date().toISOString(),
      });
      return { text: 'Сделка создана', label: `${biz.name}: сделка «${d.title}» ${d.amount ? money(d.amount) : ''}`, undo: () => remove('deals', d.id) };
    }
    case 'update_deal': {
      const deals = active('deals');
      const d = fuzzy(deals, i.deal, 'title') || deals.find((x) => fuzzy([{ name: clientName(x.clientId) }], i.deal));
      if (!d) fail(`Сделка «${i.deal}» не найдена. Есть: ${deals.map((x) => x.title).join(', ') || 'нет'}`);
      const prev = { ...d };
      const patch = { ...d };
      if (i.stage && DEAL_STAGES.some((s) => s.id === i.stage)) {
        patch.stage = i.stage; patch.stageChangedAt = new Date().toISOString();
        patch.closedAt = ['won', 'lost'].includes(i.stage) ? new Date().toISOString() : null;
      }
      if (Number(i.amount) > 0) patch.amount = Number(i.amount);
      await save('deals', patch);
      let tx = null;
      if (i.record_payment && patch.stage === 'won' && patch.amount > 0) {
        const biz = byId('businesses', d.businessId);
        tx = await save('transactions', {
          type: 'income', amount: patch.amount, categoryId: 'biz_sale', accountId: businessAccount(biz)?.id,
          businessId: d.businessId, dealId: d.id, clientId: d.clientId, date: today(), note: d.title,
        });
      }
      const st = DEAL_STAGES.find((s) => s.id === patch.stage);
      return {
        text: `Сделка обновлена${tx ? ', оплата записана' : ''}`,
        label: `Сделка «${d.title}» → ${st?.name || ''}${tx ? ` · +${money(patch.amount)}` : ''}`,
        undo: async () => { await save('deals', prev); if (tx) await remove('transactions', tx.id); },
      };
    }
    case 'add_subscription': {
      const biz = findBiz(i.business);
      const amount = Number(i.amount);
      if (!(amount > 0)) fail('Нужна сумма');
      const client = await findOrCreateClient(biz, i.client, 'active');
      const s = await save('subscriptions', {
        businessId: biz.id, clientId: client.id, title: i.title || '', amount,
        period: PERIODS[i.period] ? i.period : 'month', nextDate: isDate(i.next_date) ? i.next_date : addMonths(today(), 1),
        categoryId: biz.kind === 'saas' ? 'biz_sub' : 'biz_service', active: true,
      });
      return { text: 'Регулярный платёж добавлен', label: `${biz.name}: ${client.name} · ${money(amount)} ${PERIODS[s.period].name}`, undo: () => remove('subscriptions', s.id) };
    }
    case 'record_subscription_payment': {
      const subs = active('subscriptions').filter((s) => s.active !== false);
      const q = norm(i.client);
      const s = subs.find((x) => norm(clientName(x.clientId)).includes(q) || norm(x.title).includes(q) || (q && q.includes(norm(byId('clients', x.clientId)?.name))));
      if (!s) fail(`Регулярный платёж для «${i.client}» не найден`);
      const prevSub = { ...s };
      const { tx } = await paySubscription(s, { amount: Number(i.amount) > 0 ? Number(i.amount) : s.amount });
      return {
        text: `Оплата записана, следующая — ${byId('subscriptions', s.id).nextDate}`,
        label: `Оплата ${clientName(s.clientId) || s.title}: ${money(tx.amount)}`,
        undo: async () => { await remove('transactions', tx.id); await save('subscriptions', prevSub); },
      };
    }
    case 'log_screen_time': {
      if (!isDate(i.date)) fail('Нужна дата YYYY-MM-DD');
      const total = Math.round(Number(i.total_minutes));
      if (!(total >= 0)) fail('Нужно total_minutes');
      const apps = Array.isArray(i.apps) ? i.apps.filter((a) => a && a.name).map((a) => ({ name: String(a.name).slice(0, 40), minutes: Math.round(Number(a.minutes) || 0) })) : [];
      const existing = state.screentime.find((x) => x.date === i.date);
      const prevCopy = existing ? { ...existing } : null;
      const rec = await save('screentime', { ...(existing || {}), date: i.date, totalMinutes: total, apps });
      return {
        text: 'Экранное время записано',
        label: `📱 Экранное время ${Math.floor(total / 60)} ч ${total % 60} мин`,
        undo: () => (prevCopy ? save('screentime', prevCopy) : remove('screentime', rec.id)),
      };
    }
    default:
      fail(`Неизвестный инструмент ${name}`);
  }
  return null;
}

/** Подпись для карточки действия в истории чата */
export function describeTool(name, input = {}) {
  switch (name) {
    case 'add_transaction': return `${input.type === 'income' ? 'Доход' : 'Расход'} ${money(input.amount)}${input.note ? ' · ' + input.note : ''}`;
    case 'add_task': return `Задача: ${input.title || ''}`;
    case 'complete_task': return `✓ ${input.task || ''}`;
    case 'log_metric': return `${METRIC_PRESETS[input.metric]?.label || 'Замер'}: ${num(input.value, true)} ${METRIC_PRESETS[input.metric]?.unit || ''}`;
    case 'piggy_deposit': return `Копилка «${input.piggy}»: ${money(input.amount)}`;
    case 'create_piggy': return `Копилка «${input.name}»`;
    case 'add_client': return `Клиент ${input.name || ''}`;
    case 'add_deal': return `Сделка «${input.title || ''}»`;
    case 'update_deal': return `Сделка «${input.deal || ''}»`;
    case 'add_subscription': return `Регулярный платёж: ${input.client || ''}`;
    case 'record_subscription_payment': return `Оплата: ${input.client || ''}`;
    case 'log_screen_time': return `📱 Экранное время ${Math.floor((input.total_minutes || 0) / 60)} ч ${(input.total_minutes || 0) % 60} мин`;
    default: return null; // чтение данных не показываем
  }
}

// ---------- Диалог ----------

export const undoRegistry = new Map();
export const undone = new Set();

function nowStamp() {
  const d = new Date();
  const s = d.toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `[Сейчас: ${s}; дата ${today()}]`;
}
export const isStamp = (block) => block?.type === 'text' && block.text.startsWith('[Сейчас:');

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Ключ API не подходит. Проверь его в настройках.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Нет доступа к модели с этим ключом. Попробуй другую модель в настройках.';
  if (err instanceof Anthropic.RateLimitError) return 'Слишком много запросов. Подожди минуту и попробуй снова.';
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err.error?.error?.message || err.message || '';
    if (/credit balance/i.test(msg)) return 'На балансе Anthropic закончились деньги. Пополни его на platform.claude.com.';
    return `Запрос отклонён: ${msg}`;
  }
  if (err instanceof Anthropic.APIConnectionError) return 'Нет связи с сервером ИИ. Проверь интернет.';
  if (err instanceof Anthropic.InternalServerError) return 'Сервер ИИ временно недоступен. Попробуй позже.';
  if (err instanceof Anthropic.APIError) return `Ошибка ИИ: ${err.message}`;
  return err?.message || 'Неизвестная ошибка';
}

/**
 * Один ход диалога: отправить сообщение, выполнить инструменты, вернуть обновлённую историю.
 * history — массив сообщений API (только добавляем в конец, ничего не меняем).
 */
export async function runTurn(history, userBlocks, { onText, onToolDone, onStatus, signal } = {}) {
  const s = state.settings;
  if (!s.apiKey) throw new Error('Добавь ключ API в настройках, чтобы Аврора могла думать.');
  const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
  const messages = [...history, { role: 'user', content: [{ type: 'text', text: nowStamp() }, ...userBlocks] }];

  try {
    for (let step = 0; step < 8; step++) {
      onStatus?.(step === 0 ? 'думаю…' : 'продолжаю…');
      const params = {
        model: model.id,
        max_tokens: 16000,
        system: SYSTEM(),
        tools: tools(),
        tool_choice: { type: 'auto' },
        cache_control: { type: 'ephemeral' },
        output_config: { effort: s.effort || 'low' },
        messages,
      };
      if (model.fallback) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }
      const stream = client.beta.messages.stream(params, { signal });
      stream.on('text', (delta) => onText?.(delta));
      const msg = await stream.finalMessage();
      messages.push({ role: 'assistant', content: msg.content });

      if (msg.stop_reason === 'refusal') {
        onStatus?.('');
        return { messages, note: 'Аврора не может ответить на этот запрос. Попробуй переформулировать.' };
      }
      if (msg.stop_reason === 'max_tokens') {
        return { messages, note: 'Ответ получился слишком длинным и оборвался.' };
      }
      if (msg.stop_reason === 'pause_turn') continue;
      if (msg.stop_reason !== 'tool_use') return { messages };

      // Выполняем все вызовы инструментов и отвечаем одним сообщением
      const results = [];
      for (const block of msg.content) {
        if (block.type !== 'tool_use') continue;
        onStatus?.('записываю…');
        try {
          const input = block.input && typeof block.input === 'object' ? block.input : null;
          if (!input) throw new Error('INVALID_JSON: аргументы инструмента не распознаны, повтори вызов');
          const r = await execute(block.name, input);
          if (r.undo) undoRegistry.set(block.id, r.undo);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: r.text });
          if (r.label) onToolDone?.({ id: block.id, label: r.label, ok: true });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true });
          if (describeTool(block.name, block.input)) onToolDone?.({ id: block.id, label: e.message, ok: false });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return { messages, note: 'Слишком много шагов подряд — остановилась.' };
  } catch (err) {
    if (err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError) return { messages: history, aborted: true };
    console.error(err);
    // Если ход не завершён, откатываем незавершённые сообщения, чтобы история оставалась корректной.
    return { messages: history, error: friendlyError(err) };
  }
}

/** Быстрая проверка ключа */
export async function testKey(apiKey, modelId) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.messages.create({
      model: modelId, max_tokens: 64, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Ответь одним словом: ок' }],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}
