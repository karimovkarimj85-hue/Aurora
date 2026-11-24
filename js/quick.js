// Умный ввод без ИИ: «кофе 350», «зарплата 85к», «вес 82,4», «задача: позвонить Самсе», «ZK POS доход 4 млн».
// Работает офлайн и без ключа API. С ключом ту же работу делает Claude, но гибче.
import {
  save, remove, active, personalAccounts, byId, businessAccount, upsertMetric, METRIC_PRESETS,
  accountBalance, monthStats, totalBalance, totalSaved, bizMonthStats, mrr, duePayments, clientName, goalProgress,
  latestMetric, todayTasks, isDone, piggySaved,
} from './store.js';
import { parseAmount, today, addDays, money } from './util.js';
import { parseBankMessage, guessCategory, previewImport, commitImport } from './bank.js';
import { dealPaid } from './deals.js';

const INCOME_WORDS = /(зарплат|зп\b|аванс|доход|получил|пришл[оа]|поступ|продал|продажа|оплатил[аи]? мне|вернули|подарили|кешбэк|кэшбэк|\+)/i;

function findAmount(text) {
  const re = /([+-]?\d[\d\s]*(?:[.,]\d+)?)\s*(млн|m|тыс|к|k)?(?![а-яёa-z\d%])/gi;
  let best = null;
  for (const m of text.matchAll(re)) {
    const v = parseAmount(m[1].replace(/\s/g, '') + (m[2] || ''));
    if (!Number.isFinite(v) || v <= 0) continue;
    const cand = { value: v, raw: m[0].trim(), mult: !!m[2] };
    // предпочитаем число с «к/тыс/млн», иначе — самое большое (количество обычно меньше суммы)
    if (!best || (cand.mult && !best.mult) || (cand.mult === best.mult && cand.value > best.value)) best = cand;
  }
  return best;
}

function relDate(text) {
  if (/позавчера/i.test(text)) return addDays(today(), -2);
  if (/вчера/i.test(text)) return addDays(today(), -1);
  return today();
}

/** Разобрать фразу в действие (ничего не сохраняет) */
export function parseQuick(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  // SMS банка
  if (/(\*|•|карт[аы]|card|humo|uzcard)\s?\d{4}/i.test(t) && parseBankMessage(t)) return { kind: 'sms', text: t };

  // Замеры тела
  const metric = [
    ['weight', /(?:^|\s)(?:вес|вешу|взвесил\S*)\s*[:=]?\s*(\d+[.,]?\d*)/i],
    ['bodyFat', /(?:жир\S*|%\s*жира)\s*[:=]?\s*(\d+[.,]?\d*)/i],
    ['waist', /(?:талия|талию)\s*[:=]?\s*(\d+[.,]?\d*)/i],
  ].map(([key, re]) => { const m = t.match(re); return m ? { key, value: parseAmount(m[1]) } : null; }).filter(Boolean);
  if (metric.length) return { kind: 'metric', metrics: metric, date: relDate(t) };

  // Задача
  const task = t.match(/^(?:задача|задачу|напомни(?:ть)?|надо|нужно|сделать)\s*[:\-]?\s*(.+)$/i);
  if (task) {
    const due = /завтра/i.test(t) ? addDays(today(), 1) : /послезавтра/i.test(t) ? addDays(today(), 2) : today();
    return { kind: 'task', title: task[1].replace(/\s*(завтра|послезавтра|сегодня)\s*/i, ' ').trim(), due };
  }

  // Деньги
  const amt = findAmount(t);
  if (!amt) return null;
  const biz = active('businesses').find((b) => new RegExp(b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t));
  const type = /(расход|потратил|купил|оплатил(?!\s*мне)|заплатил|минус|-\s*\d)/i.test(t) ? 'expense' : INCOME_WORDS.test(t) ? 'income' : 'expense';
  const note = t.replace(amt.raw, ' ').replace(biz ? new RegExp(biz.name, 'i') : /$^/, ' ')
    .replace(/(потратил[аи]?|купил[аи]?|заплатил[аи]?|оплатил[аи]?|получил[аи]?|на|за|в|расход|доход|руб\S*|сум\S*|₽|вчера|позавчера|сегодня)(?=\s|$)/gi, ' ')
    .replace(/[:,.;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const categoryId = guessCategory({ type, merchant: note, raw: t }, { business: !!biz });
  return { kind: 'tx', type, amount: amt.value, note, categoryId, businessId: biz?.id || null, date: relDate(t) };
}

/** Выполнить разобранное действие. Возвращает {text, undo} */
export async function runQuick(p) {
  if (!p) return null;
  if (p.kind === 'sms') {
    const items = previewImport(p.text);
    const { added } = await commitImport(items, { source: 'chat' });
    return { text: added ? `Записала ${added} операц. из SMS банка.` : 'Эта операция уже записана.' };
  }
  if (p.kind === 'metric') {
    let g = active('goals').find((x) => x.kind === 'body');
    if (!g) g = await save('goals', { kind: 'body', title: 'Рельеф и тонус', metrics: p.metrics.map((m) => ({ key: m.key, start: m.value, target: null })) });
    const saved = [];
    for (const m of p.metrics) saved.push(await upsertMetric(g.id, m.key, m.value, p.date));
    return {
      text: `Записала: ${p.metrics.map((m) => `${METRIC_PRESETS[m.key].label.toLowerCase()} ${String(m.value).replace('.', ',')} ${METRIC_PRESETS[m.key].unit}`).join(', ')}.`,
      undo: async () => { for (const m of saved) await remove('metrics', m.id); },
    };
  }
  if (p.kind === 'task') {
    const task = await save('tasks', { title: p.title, repeat: 'none', due: p.due, doneDates: [] });
    return { text: `Добавила задачу «${task.title}»${p.due !== today() ? ' на завтра' : ''}.`, undo: () => remove('tasks', task.id) };
  }
  if (p.kind === 'tx') {
    const biz = p.businessId ? byId('businesses', p.businessId) : null;
    const acc = biz ? businessAccount(biz) : (personalAccounts().find((a) => a.type === 'card') || personalAccounts()[0]);
    if (!acc) return { text: 'Сначала добавь счёт во вкладке «Деньги».' };
    const tx = await save('transactions', {
      type: p.type, amount: p.amount, categoryId: p.categoryId, accountId: acc.id, businessId: biz?.id, date: p.date, note: p.note,
    });
    const cat = byId('categories', p.categoryId);
    return {
      text: `${p.type === 'income' ? 'Доход' : 'Расход'} ${money(p.amount)}${biz ? ` в ${biz.name}` : ''} · ${cat?.name || ''}${p.note ? ` · ${p.note}` : ''}. Счёт «${acc.name}»: ${money(accountBalance(acc.id))}. Категорию можно поменять, нажав на операцию.`,
      undo: () => remove('transactions', tx.id),
    };
  }
  return null;
}

/** Сводка для «Спросить Claude»: компактный текст о финансах, бизнесе и целях */
export function claudeBrief(question = '') {
  const m = monthStats();
  const lines = [
    'Я веду учёт в приложении «Аврора». Вот мои актуальные данные. Помоги разобраться.',
    '',
    `Личные деньги: на счетах ${money(totalBalance())}, в копилках ${money(totalSaved())}.`,
    `Этот месяц: доход ${money(m.income)}, расход ${money(m.expense)}. Топ трат: ${m.cats.slice(0, 5).map((c) => `${c.cat.name} ${money(c.sum)}`).join(', ') || 'нет'}.`,
    `Копилки: ${active('piggies').map((p) => `${p.name} ${money(piggySaved(p.id))}${p.target ? ` из ${money(p.target)}` : ''}`).join('; ') || 'нет'}.`,
  ];
  for (const b of active('businesses')) {
    const s = bizMonthStats(b.id);
    const open = active('deals').filter((d) => d.businessId === b.id && !['won', 'lost'].includes(d.stage));
    lines.push(`Бизнес ${b.name} (${b.about || ''}): выручка за месяц ${money(s.income)}, расходы ${money(s.expense)}, прибыль ${money(s.profit)}, регулярный доход ${money(mrr(b.id))}/мес; сделок в работе ${open.length} на ${money(open.reduce((x, d) => x + Number(d.amount || 0), 0))}${open.length ? ` (${open.slice(0, 5).map((d) => `${d.title} — ${money(d.amount)}, получено ${money(dealPaid(d))}`).join('; ')})` : ''}; платежей к получению на неделе: ${duePayments(b.id, 7).map((x) => `${clientName(x.clientId) || x.title} ${money(x.amount)}`).join(', ') || 'нет'}.`);
  }
  for (const g of active('goals')) {
    const pr = goalProgress(g);
    const extra = g.kind === 'body' ? ` (${(g.metrics || []).map((x) => `${METRIC_PRESETS[x.key]?.label}: ${latestMetric(g.id, x.key)?.value ?? x.start ?? '—'} → ${x.target ?? '—'}`).join(', ')})` : '';
    lines.push(`Цель «${g.title}»: прогресс ${pr == null ? '—' : Math.round(pr * 100) + '%'}${extra}.`);
  }
  const tt = todayTasks();
  lines.push(`Задачи на сегодня: ${tt.map((x) => `${x.title}${isDone(x) ? ' (сделано)' : ''}`).join(', ') || 'нет'}.`);
  lines.push('', question ? `Мой вопрос: ${question}` : 'Дай короткий разбор: что хорошо, что улучшить и 3 конкретных шага на неделю.');
  return lines.join('\n');
}

export const CLAUDE_URL = 'https://claude.ai/new';
