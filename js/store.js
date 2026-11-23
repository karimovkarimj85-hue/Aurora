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
  ['other', '📦', 'Другое', 'expense'],
  ['salary', '💼', 'Зарплата', 'income'],
  ['side', '🧩', 'Подработка', 'income'],
  ['gift_in', '🎉', 'Подарок', 'income'],
  ['other_in', '➕', 'Прочий доход', 'income'],
].map(([id, emoji, name, kind], order) => ({ id, emoji, name, kind, order }));

export const METRIC_PRESETS = {
  weight: { label: 'Вес', unit: 'кг' },
  bodyFat: { label: '% жира', unit: '%' },
  waist: { label: 'Талия', unit: 'см' },
  chest: { label: 'Грудь', unit: 'см' },
  arm: { label: 'Бицепс', unit: 'см' },
};

const DEFAULT_SETTINGS = {
  name: '',
  currency: 'RUB',
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  onboarded: false,
};

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  accounts: [], transactions: [], categories: [], piggies: [],
  goals: [], metrics: [], tasks: [], screentime: [],
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
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    await db.bulkPut('categories', state.categories);
  }
  state.categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  setCurrency(state.settings.currency);
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

export const totalBalance = () => active('accounts').reduce((s, a) => s + accountBalance(a.id), 0);
export const totalSaved = () => active('piggies').reduce((s, p) => s + piggySaved(p.id), 0);

export function monthStats(key = monthKey(today())) {
  let income = 0; let expense = 0;
  const byCat = {};
  for (const t of state.transactions) {
    if (monthKey(t.date) !== key) continue;
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
    .filter((t) => t.type === 'expense' && t.date >= from && t.date <= to)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

export const sortedTransactions = () => [...state.transactions]
  .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));

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
