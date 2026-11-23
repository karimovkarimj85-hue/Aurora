export const CURRENCIES = [
  { code: 'RUB', symbol: '₽', name: 'Рубль' },
  { code: 'UZS', symbol: 'сум', name: 'Узбекский сум' },
  { code: 'KZT', symbol: '₸', name: 'Тенге' },
  { code: 'USD', symbol: '$', name: 'Доллар' },
  { code: 'EUR', symbol: '€', name: 'Евро' },
];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let currencySymbol = '₽';
export function setCurrency(code) {
  currencySymbol = (CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]).symbol;
}
export const currency = () => currencySymbol;

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const num = (n, frac = false) => (frac ? nf2 : nf).format(Number(n) || 0);
export const money = (n, { sign = false } = {}) => {
  const v = Number(n) || 0;
  const s = sign && v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${nf.format(Math.abs(v))} ${currencySymbol}`;
};
/** Компактно: 1,2 млн / 400 тыс. */
export function moneyShort(n) {
  const v = Math.abs(Number(n) || 0);
  const s = n < 0 ? '−' : '';
  if (v >= 1e6) return `${s}${nf2.format(Math.round(v / 1e4) / 100)} млн ${currencySymbol}`;
  if (v >= 1e4) return `${s}${nf.format(Math.round(v / 1e3))} тыс ${currencySymbol}`;
  return `${s}${nf.format(v)} ${currencySymbol}`;
}

/** Локальная дата в формате YYYY-MM-DD */
export function isoDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const today = () => isoDate();
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
export const monthKey = (iso) => iso.slice(0, 7);

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function humanDate(iso) {
  if (!iso) return '';
  const t = today();
  if (iso === t) return 'Сегодня';
  if (iso === addDays(t, -1)) return 'Вчера';
  if (iso === addDays(t, 1)) return 'Завтра';
  const d = parseIso(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}, ${WD[d.getDay()]}`;
}
export function fullDate(d = new Date()) {
  return `${WD_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
};
export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const pct = (v, total) => (total > 0 ? clamp(Math.round((v / total) * 100), 0, 100) : 0);

/** Разбор суммы: "1 500", "1,5к", "40k", "2.5 млн" */
export function parseAmount(str) {
  if (typeof str === 'number') return str;
  let s = String(str || '').trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
  let mult = 1;
  if (/(млн|m)$/.test(s)) { mult = 1e6; s = s.replace(/(млн|m)$/, ''); }
  else if (/(к|k|тыс)$/.test(s)) { mult = 1e3; s = s.replace(/(к|k|тыс)$/, ''); }
  const v = parseFloat(s);
  return Number.isFinite(v) ? Math.round(v * mult * 100) / 100 : NaN;
}

export function haptic() {
  try { navigator.vibrate?.(8); } catch { /* iOS не поддерживает — ок */ }
}
