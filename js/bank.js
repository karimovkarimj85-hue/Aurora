// Карты и банковские уведомления: разбор SMS, автокатегории с обучением, сверка баланса, автоимпорт.
// Работает без сервера: SMS попадают в Аврору вставкой или через «Команды» iOS → ntfy.sh → Аврора.
import { state, save, active, personalAccounts, accountBalance, byId, saveSettings } from './store.js';
import { today, isoDate } from './util.js';

// ---------- Разбор текста ----------

const CUR = '(?:₽|р\\.?|руб\\.?|rub|uzs|сум|so[\'’`]?m|sum|₸|kzt|тг|\\$|usd|€|eur)';
const NUM = '(\\d{1,3}(?:[ \\u00a0]?\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const INCOME = /(зачисл|поступл|пополн|перевод от|получен|возврат|refund|income|credit(?!\s*card)|kirim|tushum|qabul qilindi|o[’']?tkazma kel|cashback|кешбэк|кэшбэк)/i;
const EXPENSE = /(покупк|оплат|списан|снят|выдач|перевод\b|перевод на|debit|purchase|payment|pokupka|oplata|xarid|to[’']?lov|chiqim|yechib|yechildi|spisanie|bankomat|atm|комисси)/i;
const BALANCE = /(баланс|остаток|доступно|balance|balans|bal\.?|qoldiq|ostatok|dostupno)\s*[:=]?\s*/i;
const CARD_WORDS = /^(HUMO|HUMOCARD|UZCARD|VISA|MASTERCARD|MC|MIR|МИР|KARTA|КАРТА|CARD|ECMC|MAESTRO|UNIONPAY|UPI|SMS|INFO|UZS|RUB|USD|EUR|KZT|SUM|ОПЛАТА|ПОКУПКА|СПИСАНИЕ|PAYMENT|POKUPKA|OPLATA|BALANS|БАЛАНС)$/i;

const toNum = (s) => Number(String(s).replace(/[\s ]/g, '').replace(',', '.'));

function findDate(text) {
  const m = text.match(/(\d{2})[./-](\d{2})[./-](\d{2,4})(?:[ ,T]+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  let y = Number(m[3]); if (y < 100) y += 2000;
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) return null;
  const iso = isoDate(d);
  return iso > today() ? null : iso;
}

/**
 * Разобрать одно SMS/уведомление банка.
 * @returns {{type:'expense'|'income', amount:number, last4:string|null, merchant:string, balance:number|null, date:string, raw:string}|null}
 */
export function parseBankMessage(raw, fallbackDate = today()) {
  const text = String(raw || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 8) return null;

  // Баланс отрезаем, чтобы не спутать с суммой операции
  let balance = null; let body = text;
  const bm = text.match(new RegExp(BALANCE.source + '(?:' + CUR + '\\s?)?' + NUM + '\\s?' + CUR + '?', 'i'));
  if (bm) { balance = toNum(bm[2]); body = text.replace(bm[0], ' '); }

  // Сумма: число рядом с валютой, затем — число со знаком
  let amount = null; let am = body.match(new RegExp('([+-−])?\\s?' + NUM + '\\s?' + CUR, 'i'));
  if (!am) am = body.match(new RegExp(CUR + '\\s?' + NUM, 'i'));
  if (am) amount = toNum(am[2] ?? am[1]);
  if (!am) {
    const sm = body.match(/([+-−])\s?(\d[\d\s]*[.,]?\d{0,2})/);
    if (sm) { amount = toNum(sm[2]); am = sm; }
  }
  if (!(amount > 0)) return null;

  // Тип операции
  let type = null;
  const sign = am && am[1];
  if (sign === '+') type = 'income';
  else if (sign === '-' || sign === '−') type = 'expense';
  else if (INCOME.test(body) && !/(перевод на|списан)/i.test(body)) type = 'income';
  else if (EXPENSE.test(body)) type = 'expense';
  if (!type) return null;

  // Карта: *1234, •1234, карта 1234, card ...1234
  const cm = text.match(/(?:\*|•|·|x{2,}|х{2,}|\.{2,}|карт[аеуы]?\s*(?:№\s*)?|card\s*|karta\s*|humo\s*|uzcard\s*|(?:mir|мир|visa|mc|ecmc|maestro)[-\s])\s?(\d{4})\b/i);
  const last4 = cm ? cm[1] : null;

  // Продавец: самая «заглавная» фраза без служебных слов
  let merchant = '';
  const after = body.slice((am?.index || 0) + (am?.[0]?.length || 0));
  const candidates = (after + ' | ' + body).match(/[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9&'’.*\-_/]+(?:\s+[A-ZА-ЯЁ0-9&'’.*\-_/]{2,}){0,3}/g) || [];
  for (const c of candidates) {
    const words = c.split(/\s+/).map((w) => w.replace(/[.,;:]+$/, '')).filter((w) => w && !CARD_WORDS.test(w) && !/^\*?\d+$/.test(w) && !/^\d/.test(w));
    if (words.length && words.join(' ').length >= 3) { merchant = words.join(' ').replace(/[.,;:]+$/, ''); break; }
  }
  if (!merchant && type === 'income') {
    const om = body.match(/(?:от|from|dan)\s+([A-ZА-ЯЁ][^.+,;:\d]{1,30})/);
    if (om) merchant = om[1].trim();
  }
  if (!merchant) {
    const lm = after.match(/(?:в|at|v|магазин|merchant)\s+([^,;]+?)(?:[,;.]|$)/i);
    if (lm) merchant = lm[1].trim();
  }
  return { type, amount, last4, merchant: merchant.slice(0, 60), balance, date: findDate(text) || fallbackDate, raw: text };
}

/** Разделить вставленный текст на отдельные сообщения */
export function splitMessages(text) {
  const parts = String(text || '').split(/\n\s*\n|(?=\n(?:HUMO|UZCARD|VISA|MIR|Покупка|Оплата|Списание|Зачисление|Пополнение|Perevod|Pokupka|Oplata)\b)/i);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 8);
}

// ---------- Автокатегории ----------

const KEYWORDS = [
  ['food', /(продукт|корзинк|супермаркет|pyaterochk|magnit|perekrestok|vkusvill|azbuka|korzinka|makro|havas|carrefour|baraka|пятёрочк|пятерочк|магнит|перекр[её]ст|ашан|auchan|лента|lenta|вкусвилл|grocery|supermarket|market|магазин продукт|oziq|dixy|дикси|metro c&c)/i],
  ['cafe', /(cafe|кафе|kafe|kofe|coffee|кофе|evos|kfc|burger|бургер|pizza|пицц|restoran|ресторан|chayxona|starbucks|bon!?|safia|les ailes|oqtepa|lavash|макдон|mcdonald|вкусно и точка|шоколадниц|yandex.?eda|яндекс.?еда|express24|wolt|delivery club)/i],
  ['transport', /(yandex.?go|yandex.?taxi|яндекс.?go|taxi|такси|uber|bolt|mytaxi|metro|метро|автобус|bus|azs|азс|бензин|fuel|uzbekneftegaz|lukoil|лукойл|газпромнефть|parking|парковк)/i],
  ['subs', /(beeline|билайн|ucell|uzmobile|mobiuz|mts|мтс|tele2|теле2|megafon|мегафон|netflix|spotify|apple\.com|itunes|google|youtube|yandex.?plus|яндекс.?плюс|icloud|chatgpt|openai|anthropic|claude)/i],
  ['health', /(apteka|аптек|pharm|clinic|клиник|med|fitness|фитнес|gym|спортзал|world class|стоматолог)/i],
  ['clothes', /(zara|lc waikiki|h&m|bershka|pull&bear|mango|uniqlo|adidas|nike|reebok|одежд|обув|wildberries|ozon|uzum)/i],
  ['home', /(коммунал|жкх|kommunal|elektr|электр|gaz|газ|suv|водоканал|hududgaz|аренда|ijara|интернет|internet|turon|uztelecom)/i],
  ['learning', /(курс|course|udemy|coursera|книг|book|школ|school|university|универс)/i],
  ['fun', /(cinema|кино|steam|playstation|xbox|game|игр|concert|концерт|park|парк)/i],
];

export const normMerchant = (m) => String(m || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim().slice(0, 40);

export function guessCategory(p, { business = false } = {}) {
  const key = normMerchant(p.merchant);
  const rule = key && state.rules.find((r) => r.id === key);
  if (rule && byId('categories', rule.categoryId)) return rule.categoryId;
  if (business) {
    const h = `${p.merchant} ${p.raw}`;
    const BIZ = p.type === 'income'
      ? [['biz_sub', /(подписк|тариф|абонент|subscription)/i], ['biz_impl', /(внедрен|настройк|установк|интеграц)/i], ['biz_service', /(обслуж|сервис|ремонт|поддержк)/i]]
      : [['biz_soft', /(хостинг|сервер|домен|vps|cloud|облак|софт|лицензи|github|aws|google|apple)/i], ['biz_ads', /(реклам|таргет|маркетинг|smm|продвиж|ads)/i],
        ['biz_salary', /(зарплат|оклад|подрядчик|фриланс|премия|сотрудник)/i], ['biz_rent', /(аренд|офис|склад)/i], ['biz_tax', /(налог|ндс|патент|пошлин|soliq)/i],
        ['biz_purchase', /(закуп|оборудован|товар|поставщик|моноблок|принтер|сканер|касс)/i], ['biz_delivery', /(доставк|логист|курьер|почт)/i]];
    for (const [cat, re] of BIZ) if (re.test(h)) return cat;
    return p.type === 'income' ? 'biz_sale' : 'biz_other';
  }
  if (p.type === 'income') return /(зарплат|salary|oylik|ish haqi|аванс)/i.test(p.raw) ? 'salary' : 'other_in';
  const hay = `${p.merchant} ${p.raw}`;
  for (const [cat, re] of KEYWORDS) if (re.test(hay)) return cat;
  return 'other';
}

/** Запомнить: этот продавец → эта категория (вызывается, когда пользователь меняет категорию) */
export async function learnRule(merchant, categoryId) {
  const key = normMerchant(merchant);
  if (!key || !categoryId) return;
  await save('rules', { id: key, categoryId, merchant });
}

// ---------- Импорт ----------

const hashOf = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
};

export function findCard(last4) {
  if (!last4) return null;
  return active('accounts').find((a) => a.last4 === last4) || null;
}

/** Подготовить черновики операций из текста (ничего не сохраняет) */
export function previewImport(text, { fallbackDate } = {}) {
  const msgs = Array.isArray(text) ? text : splitMessages(text);
  return msgs.map((raw) => {
    const p = parseBankMessage(raw, fallbackDate);
    if (!p) return { raw, ok: false };
    const hash = hashOf(p.raw);
    const dup = state.transactions.some((t) => t.importHash === hash);
    const card = findCard(p.last4);
    return { ...p, ok: true, hash, dup, accountId: card?.id || null, categoryId: guessCategory(p, { business: !!card?.businessId }) };
  });
}

/**
 * Сохранить разобранные операции. Неизвестные карты создаются автоматически.
 * Если в SMS есть баланс — баланс карты в Авроре сверяется с банком.
 */
export async function commitImport(items, { source = 'sms' } = {}) {
  let added = 0; let cardsCreated = 0;
  for (const it of items) {
    if (!it.ok || it.dup || it.skip) continue;
    let acc = it.accountId ? byId('accounts', it.accountId) : findCard(it.last4);
    if (!acc) {
      if (it.last4) {
        acc = await save('accounts', { name: `Карта •${it.last4}`, type: 'card', last4: it.last4, bank: '', initial: 0 });
        cardsCreated++;
      } else acc = personalAccounts().find((a) => a.type === 'card') || personalAccounts()[0];
    }
    if (!acc) continue;
    await save('transactions', {
      type: it.type, amount: it.amount, categoryId: it.categoryId || guessCategory(it), accountId: acc.id,
      businessId: acc.businessId || undefined, date: it.date || today(), note: it.merchant || '',
      merchant: it.merchant || '', importHash: it.hash, source,
    });
    added++;
    if (it.balance != null && Number.isFinite(it.balance)) {
      const fresh = byId('accounts', acc.id);
      const diff = Math.round((it.balance - accountBalance(acc.id)) * 100) / 100;
      if (diff !== 0) await save('accounts', { ...fresh, initial: (Number(fresh.initial) || 0) + diff, syncedAt: new Date().toISOString() });
    }
  }
  return { added, cardsCreated };
}

/** Сохранить нераспознанные сообщения, чтобы разобрать вручную или с ИИ */
export async function keepUnparsed(raws) {
  for (const raw of raws) {
    const hash = hashOf(raw);
    if (state.inbox.some((x) => x.id === hash)) continue;
    await save('inbox', { id: hash, raw, receivedAt: new Date().toISOString() });
  }
}

// ---------- Автоимпорт через ntfy.sh ----------
// «Команды» iOS: автоматизация «Сообщение от банка» → POST текста на https://ntfy.sh/<секретная-тема>.
// Аврора при открытии забирает новые сообщения. ntfy.sh хранит сообщения около 12 часов.

export const NTFY = 'https://ntfy.sh';

export function newTopic() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return 'aurora-' + [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

export async function syncNtfy({ silent = true } = {}) {
  const topic = state.settings.ntfyTopic;
  if (!topic) return { added: 0, skipped: true };
  const since = state.settings.ntfyLastId || '24h';
  const res = await fetch(`${NTFY}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Сервис ntfy ответил ${res.status}`);
  const lines = (await res.text()).split('\n').filter(Boolean);
  const msgs = []; let lastId = null;
  for (const line of lines) {
    try {
      const m = JSON.parse(line);
      if (m.event === 'message' && m.message) { msgs.push({ text: m.message, date: isoDate(new Date(m.time * 1000)) }); lastId = m.id; }
    } catch { /* пропускаем битую строку */ }
  }
  if (!msgs.length) { await saveSettings({ ntfySyncedAt: new Date().toISOString() }); return { added: 0 }; }
  const items = msgs.flatMap((m) => previewImport([m.text], { fallbackDate: m.date }));
  const { added, cardsCreated } = await commitImport(items, { source: 'auto' });
  await keepUnparsed(items.filter((i) => !i.ok).map((i) => i.raw));
  await saveSettings({ ntfyLastId: lastId, ntfySyncedAt: new Date().toISOString() });
  return { added, cardsCreated, unparsed: items.filter((i) => !i.ok).length, silent };
}

