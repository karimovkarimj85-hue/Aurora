// Состояние приложения в памяти + запись в IndexedDB + вычисления (балансы, прогресс целей).
import { db, COLLECTIONS } from './db.js';
import { uid, today, addDays, monthKey, parseIso, isoDate, setCurrency, clamp, daysBetween } from './util.js';

export const DEFAULT_CATEGORIES = [
  ['food', '🛒', 'Продукты', 'expense'],
  ['cafe', '☕', 'Кафе и еда вне дома', 'expense'],
  ['transport', '🚕', 'Транспорт', 'expense'],
  ['home', '🏠', 'Жильё и коммуналка', 'expense'],
  ['health', '💪', 'Спорт и здоровье', 'expense'],
  ['sport_food', '🥩', 'Спортпит', 'expense'],
  ['learning', '📚', 'Обучение и книги', 'expense'],
  ['clothes', '👕', 'Одежда', 'expense'],
  ['fun', '🎮', 'Развлечения', 'expense'],
  ['subs', '📱', 'Связь и подписки', 'expense'],
  ['gifts', '🎁', 'Подарки', 'expense'],
  ['loan', '', 'Кредиты и ипотека', 'expense'],
  ['p2p_out', '', 'Переводы', 'expense', 'personal', true],
  ['other', '📦', 'Другое', 'expense'],
  ['salary', '💼', 'Зарплата', 'income'],
  ['side', '🧩', 'Подработка', 'income'],
  ['gift_in', '🎉', 'Подарок', 'income'],
  ['p2p_in', '', 'Пополнения и переводы', 'income', 'personal', true],
  ['other_in', '➕', 'Прочий доход', 'income'],
  // Бизнес
  ['biz_sale', '🧾', 'Продажи', 'income', 'biz'],
  ['biz_sub', '🔁', 'Подписки', 'income', 'biz'],
  ['biz_impl', '🛠', 'Внедрение и настройка', 'income', 'biz'],
  ['biz_service', '🧰', 'Обслуживание', 'income', 'biz'],
  ['biz_in_other', '➕', 'Прочий доход', 'income', 'biz'],
  ['biz_purchase', '📦', 'Закупка товара', 'expense', 'biz'],
  ['biz_salary', '👥', 'Зарплаты и подрядчики', 'expense', 'biz'],
  ['biz_ads', '📣', 'Реклама и маркетинг', 'expense', 'biz'],
  ['biz_soft', '💻', 'Сервисы и хостинг', 'expense', 'biz'],
  ['biz_rent', '🏢', 'Аренда и офис', 'expense', 'biz'],
  ['biz_tax', '🏛', 'Налоги и сборы', 'expense', 'biz'],
  ['biz_delivery', '🚚', 'Доставка', 'expense', 'biz'],
  ['biz_other', '📎', 'Прочие расходы', 'expense', 'biz'],
].map(([id, emoji, name, kind, scope, neutral], order) => ({ id, emoji, name, kind, order, scope: scope || 'personal', neutral: !!neutral }));
// «Нейтральные» категории — перемещения своих денег (переводы между своими картами, пополнения наличными):
// показываются в операциях, но не считаются доходом или расходом в аналитике.
export const isNeutral = (catId) => !!state.categories.find((c) => c.id === catId)?.neutral;

export const DEAL_STAGES = [
  { id: 'lead', name: 'Новый лид', open: true },
  { id: 'talks', name: 'Переговоры', open: true },
  { id: 'demo', name: 'Демо / КП', open: true },
  { id: 'invoice', name: 'Счёт выставлен', open: true },
  { id: 'won', name: 'Оплачено', open: false },
  { id: 'lost', name: 'Отказ', open: false },
];
export const CLIENT_STATUS = { lead: 'Потенциальный', active: 'Активный', paused: 'Пауза', lost: 'Ушёл' };
export const PERIODS = { month: { name: 'в месяц', months: 1 }, quarter: { name: 'в квартал', months: 3 }, year: { name: 'в год', months: 12 } };
export const BIZ_KINDS = { pos: 'Продажа и внедрение', saas: 'Подписка (SaaS)', other: 'Другое' };

export const METRIC_PRESETS = {
  weight: { label: 'Вес', unit: 'кг' },
  bodyFat: { label: '% жира', unit: '%' },
  waist: { label: 'Талия', unit: 'см' },
  chest: { label: 'Грудь', unit: 'см' },
  arm: { label: 'Бицепс', unit: 'см' },
};

const DEFAULT_SETTINGS = {
  name: '',
  currency: 'UZS',
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  theme: 'system',
  onboarded: false,
};

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  accounts: [], transactions: [], categories: [], piggies: [],
  goals: [], metrics: [], tasks: [], screentime: [],
  businesses: [], clients: [], deals: [], subscriptions: [],
  rules: [], inbox: [], products: [], activities: [],
  chat: [],
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

export async function load() {
  const [settings, chat, ...cols] = await Promise.all([
    db.getMeta('settings'),
    db.getMeta('chat'),
    ...COLLECTIONS.map((c) => db.all(c)),
  ]);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.chat = chat || [];
  COLLECTIONS.forEach((c, i) => { state[c] = cols[i] || []; });
  // Добавляем недостающие стандартные категории (в т.ч. бизнес-категории для старых данных)
  const have = new Set(state.categories.map((c) => c.id));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.id)).map((c) => ({ ...c }));
  for (const c of state.categories) {
    const def = DEFAULT_CATEGORIES.find((d) => d.id === c.id);
    if (def && (c.scope !== def.scope || c.order !== def.order || !!c.neutral !== def.neutral)) {
      c.scope = def.scope; c.order = def.order; c.neutral = def.neutral; missing.push(c);
    }
  }
  if (missing.length) {
    await db.bulkPut('categories', missing);
    const map = new Map(state.categories.map((c) => [c.id, c]));
    for (const m of missing) map.set(m.id, m);
    state.categories = [...map.values()];
  }
  state.categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  await migrate();
  setCurrency(state.settings.currency);
}

/** Разовые донастройки старых данных */
async function migrate() {
  const st = state.settings;
  if (!st.onboarded || st.migratedV4) return;
  // Валюта — узбекский сум (по просьбе владельца). Карты 1/2/3 из первой настройки — это Tez, TBC и Ипотека банк.
  if (st.currency === 'RUB') st.currency = 'UZS';
  const rename = { 'Карта 1': { name: 'Tez', bank: 'Tez', last4: '4004' }, 'Карта 2': { name: 'TBC', bank: 'TBC Bank' }, 'Карта 3': { name: 'Ипотека банк', bank: 'Ipoteka Bank' } };
  for (const a of state.accounts) {
    const r = rename[a.name];
    if (r && !a.businessId && !a.last4) {
      Object.assign(a, { ...r, type: 'card', last4: r.last4 || null });
      await db.put('accounts', a);
    }
  }
  st.migratedV4 = true;
  await db.setMeta('settings', st);
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  if (patch.currency) setCurrency(patch.currency);
  await db.setMeta('settings', state.settings);
  emit();
}

export async function saveChat(messages) {
  state.chat = messages;
  await db.setMeta('chat', messages);
}

/** Создать или обновить запись. Возвращает сохранённый объект. */
export async function save(collection, obj) {
  const item = { ...obj };
  if (!item.id) { item.id = uid(); item.createdAt = new Date().toISOString(); }
  item.updatedAt = new Date().toISOString();
  const list = state[collection];
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  await db.put(collection, item);
  emit();
  return item;
}

export async function remove(collection, id) {
  state[collection] = state[collection].filter((x) => x.id !== id);
  await db.del(collection, id);
  emit();
}

export const byId = (collection, id) => state[collection].find((x) => x.id === id);
export const active = (collection) => state[collection].filter((x) => !x.archived);
export const archived = (collection) => state[collection].filter((x) => x.archived);

// ---------- Финансы ----------

export function accountBalance(accId) {
  const acc = byId('accounts', accId);
  let b = Number(acc?.initial) || 0;
  for (const t of state.transactions) {
    const a = Number(t.amount) || 0;
    if (t.type === 'expense' && t.accountId === accId) b -= a;
    else if (t.type === 'income' && t.accountId === accId) b += a;
    else if (t.type === 'transfer') {
      if (t.accountId === accId) b -= a;
      if (t.toAccountId === accId) b += a;
    } else if (t.type === 'piggy' && t.accountId === accId) b -= a; // a<0 — снятие из копилки
  }
  return Math.round(b * 100) / 100;
}

export function piggySaved(piggyId) {
  const p = byId('piggies', piggyId);
  let s = Number(p?.initial) || 0;
  for (const t of state.transactions) if (t.type === 'piggy' && t.piggyId === piggyId) s += Number(t.amount) || 0;
  return Math.round(s * 100) / 100;
}

export const personalAccounts = () => active('accounts').filter((a) => !a.businessId);
export const totalBalance = () => personalAccounts().reduce((s, a) => s + accountBalance(a.id), 0);
export const totalSaved = () => active('piggies').reduce((s, p) => s + piggySaved(p.id), 0);

export function monthStats(key = monthKey(today())) {
  let income = 0; let expense = 0;
  const byCat = {};
  for (const t of state.transactions) {
    if (t.businessId || monthKey(t.date) !== key || isNeutral(t.categoryId)) continue;
    const a = Number(t.amount) || 0;
    if (t.type === 'income') income += a;
    if (t.type === 'expense') { expense += a; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + a; }
  }
  const cats = Object.entries(byCat)
    .map(([id, sum]) => ({ cat: byId('categories', id) || { id, name: 'Без категории', emoji: '❔' }, sum }))
    .sort((a, b) => b.sum - a.sum);
  return { income, expense, net: income - expense, cats };
}

export function expenseBetween(from, to) {
  return state.transactions
    .filter((t) => t.type === 'expense' && !t.businessId && !isNeutral(t.categoryId) && t.date >= from && t.date <= to)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export const sortedTransactions = (businessId = null) => state.transactions
  .filter((t) => (businessId ? t.businessId === businessId : !t.businessId))
  .sort((a, b) => (b.date + (b.time || '') + (b.createdAt || '')).localeCompare(a.date + (a.time || '') + (a.createdAt || '')));

/** Нужно откладывать в месяц, чтобы успеть к сроку */
export function piggyMonthlyNeed(p) {
  if (!p.target || !p.deadline) return null;
  const left = p.target - piggySaved(p.id);
  if (left <= 0) return 0;
  const months = Math.max(1, daysBetween(today(), p.deadline) / 30.4);
  return Math.ceil(left / months);
}

// ---------- Задачи и привычки ----------

export function weekStart(iso = today()) {
  const d = parseIso(iso);
  const wd = (d.getDay() + 6) % 7; // пн = 0
  return addDays(iso, -wd);
}

export function isDone(task, day = today()) {
  if (!task.repeat || task.repeat === 'none') return !!task.done;
  const dates = task.doneDates || [];
  return dates.includes(day);
}

/** Для задач «N раз в неделю»: сколько выполнено на этой неделе и сколько нужно */
export function weekProgress(task, day = today()) {
  const ws = weekStart(day);
  const done = (task.doneDates || []).filter((d) => d >= ws && d <= addDays(ws, 6)).length;
  return { done, target: Number(task.timesPerWeek) || 1 };
}

export function streak(task) {
  if (task.repeat !== 'daily') return 0;
  const set = new Set(task.doneDates || []);
  let d = today();
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export async function toggleTask(task, day = today()) {
  const t = { ...task };
  if (!t.repeat || t.repeat === 'none') {
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
  } else {
    const dates = new Set(t.doneDates || []);
    if (dates.has(day)) dates.delete(day);
    else dates.add(day);
    t.doneDates = [...dates].sort().slice(-400);
  }
  return save('tasks', t);
}

export function todayTasks() {
  const t = today();
  return active('tasks').filter((task) => {
    if (task.repeat === 'daily' || task.repeat === 'weekly') return true;
    if (task.done) return task.doneAt && isoDate(task.doneAt) === t;
    return !task.due || task.due <= t;
  });
}

// ---------- Цели ----------

export const metricEntries = (goalId, key) => state.metrics
  .filter((m) => m.goalId === goalId && m.key === key)
  .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));

/** Записать замер; если за этот день уже есть значение — обновить его */
export async function upsertMetric(goalId, key, value, date) {
  const existing = state.metrics.find((m) => m.goalId === goalId && m.key === key && m.date === date);
  return save('metrics', { ...(existing || {}), goalId, key, value, date });
}

export function latestMetric(goalId, key) {
  const list = metricEntries(goalId, key);
  return list.length ? list[list.length - 1] : null;
}

export function metricProgress(goal, m) {
  const cur = latestMetric(goal.id, m.key)?.value ?? m.start;
  if (m.start == null || m.target == null || m.start === m.target || cur == null) return null;
  return clamp((m.start - cur) / (m.start - m.target), 0, 1);
}

export function habitStats(goalId, days = 7) {
  const habits = active('tasks').filter((t) => t.goalId === goalId && t.repeat === 'daily');
  if (!habits.length) return { habits, rate: null };
  let done = 0; let possible = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today(), -i);
    for (const h of habits) {
      const created = h.createdAt ? isoDate(h.createdAt) : '0000';
      const did = (h.doneDates || []).includes(d);
      if (d >= created || did) { possible++; if (did) done++; }
    }
  }
  return { habits, rate: possible ? done / possible : null };
}

/** Прогресс цели 0..1 или null, если считать не из чего */
export function goalProgress(goal) {
  if (goal.kind === 'money') {
    const p = byId('piggies', goal.piggyId);
    if (!p || !p.target) return null;
    return clamp(piggySaved(p.id) / p.target, 0, 1);
  }
  if (goal.kind === 'body') {
    const parts = (goal.metrics || []).map((m) => metricProgress(goal, m)).filter((x) => x != null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  }
  if (goal.kind === 'mind') return habitStats(goal.id).rate;
  return goal.manualProgress != null ? goal.manualProgress / 100 : null;
}

// ---------- Бизнес ----------

export function addMonths(iso, n) {
  const d = parseIso(iso);
  const day = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return isoDate(r);
}

export const businessAccount = (biz) => byId('accounts', biz?.accountId) || active('accounts').find((a) => a.businessId === biz?.id);
export const bizBalance = (biz) => active('accounts').filter((a) => a.businessId === biz.id).reduce((s, a) => s + accountBalance(a.id), 0);

export function bizMonthStats(bizId, key = monthKey(today())) {
  let income = 0; let expense = 0; const byCat = {};
  for (const t of state.transactions) {
    if (t.businessId !== bizId || monthKey(t.date) !== key) continue;
    const a = Number(t.amount) || 0;
    if (t.type === 'income') income += a;
    if (t.type === 'expense') { expense += a; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + a; }
  }
  const cats = Object.entries(byCat)
    .map(([id, sum]) => ({ cat: byId('categories', id) || { id, name: 'Без категории', emoji: '❔' }, sum }))
    .sort((a, b) => b.sum - a.sum);
  return { income, expense, profit: income - expense, cats };
}

/** Выручка и прибыль по месяцам (последние n месяцев) */
export function bizTrend(bizId, n = 6) {
  const out = [];
  const now = today();
  for (let i = n - 1; i >= 0; i--) {
    const key = monthKey(addMonths(now.slice(0, 8) + '01', -i));
    out.push({ key, ...bizMonthStats(bizId, key) });
  }
  return out;
}

export const monthlyAmount = (s) => (Number(s.amount) || 0) / (PERIODS[s.period]?.months || 1);
export const activeSubs = (bizId) => active('subscriptions').filter((s) => s.businessId === bizId && s.active !== false);
export const mrr = (bizId) => activeSubs(bizId).reduce((sum, s) => sum + monthlyAmount(s), 0);

export function duePayments(bizId = null, days = 7) {
  const limit = addDays(today(), days);
  return active('subscriptions')
    .filter((s) => s.active !== false && (!bizId || s.businessId === bizId) && s.nextDate && s.nextDate <= limit)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

export function pipeline(bizId) {
  const deals = active('deals').filter((d) => d.businessId === bizId);
  return DEAL_STAGES.map((st) => {
    const list = deals.filter((d) => d.stage === st.id);
    return { ...st, count: list.length, sum: list.reduce((s, d) => s + (Number(d.amount) || 0), 0), deals: list };
  });
}

/** Сделки без движения больше N дней */
export function staleDeals(days = 7) {
  const t = today();
  return active('deals').filter((d) => {
    const st = DEAL_STAGES.find((s) => s.id === d.stage);
    if (!st?.open) return false;
    const last = (d.stageChangedAt || d.updatedAt || d.createdAt || '').slice(0, 10);
    return last && daysBetween(last, t) >= days;
  });
}

export const clientName = (id) => {
  const c = byId('clients', id);
  return c ? (c.company ? `${c.name} · ${c.company}` : c.name) : '';
};

/** Отметить платёж по подписке: доход в бизнес + следующая дата */
export async function paySubscription(sub, { amount, accountId, date } = {}) {
  const biz = byId('businesses', sub.businessId);
  const acc = byId('accounts', accountId) || businessAccount(biz);
  const tx = await save('transactions', {
    type: 'income', amount: Number(amount ?? sub.amount), categoryId: sub.categoryId || 'biz_sub',
    accountId: acc?.id, businessId: sub.businessId, subscriptionId: sub.id, clientId: sub.clientId,
    date: date || today(), note: sub.title || clientName(sub.clientId),
  });
  const prevNext = sub.nextDate;
  await save('subscriptions', { ...sub, nextDate: addMonths(sub.nextDate || today(), PERIODS[sub.period]?.months || 1), lastPaid: date || today() });
  return { tx, prevNext };
}

/** Стартовые бизнесы: ZK POS и Gain CRM (создаются один раз) */
export async function seedBusinesses() {
  if (state.settings.bizSeeded) return;
  const seeds = [
    { name: 'ZK POS', kind: 'pos', color: '#FF9F0A', about: 'POS-системы: продажа, внедрение и обслуживание' },
    { name: 'Gain CRM', kind: 'saas', color: '#0A84FF', about: 'CRM-система по подписке' },
  ];
  for (const s of seeds) {
    if (state.businesses.some((b) => b.name === s.name)) continue;
    const biz = await save('businesses', s);
    const acc = await save('accounts', { name: `Счёт ${s.name}`, type: 'card', initial: 0, businessId: biz.id });
    await save('businesses', { ...biz, accountId: acc.id });
  }
  await saveSettings({ bizSeeded: true });
}

// ---------- Резервная копия ----------

export function exportData() {
  const data = { app: 'aurora', version: 1, exportedAt: new Date().toISOString(), settings: { ...state.settings, apiKey: '' } };
  for (const c of COLLECTIONS) data[c] = state[c];
  return data;
}

export async function importData(data) {
  if (!data || data.app !== 'aurora') throw new Error('Это не файл резервной копии Авроры');
  for (const c of COLLECTIONS) {
    await db.clear(c);
    const items = Array.isArray(data[c]) ? data[c] : [];
    if (items.length) await db.bulkPut(c, items);
  }
  const keepKey = state.settings.apiKey;
  await db.setMeta('settings', { ...DEFAULT_SETTINGS, ...data.settings, apiKey: keepKey, onboarded: true });
  await load();
  emit();
}

export async function resetAll() {
  for (const c of COLLECTIONS) await db.clear(c);
  await db.setMeta('settings', { ...DEFAULT_SETTINGS });
  await db.setMeta('chat', []);
  await load();
  emit();
}
