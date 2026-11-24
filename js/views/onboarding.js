// Первый запуск: имя, валюта, счета, цели.
import { save, saveSettings, seedBusinesses } from '../store.js';
import { wordmark } from '../icons.js';
import { esc, CURRENCIES, parseAmount, today, setCurrency, currency } from '../util.js';
import { toast } from '../ui.js';

let step = 0;
const draft = {
  name: '',
  currency: 'UZS',
  accounts: [
    { name: 'Наличные', type: 'cash', balance: '400000' },
    { name: 'Tez', type: 'card', balance: '40000', bank: 'Tez', last4: '4004' },
    { name: 'TBC', type: 'card', balance: '0', bank: 'TBC Bank' },
    { name: 'Ипотека банк', type: 'card', balance: '0', bank: 'Ipoteka Bank' },
  ],
  body: true, mind: true, house: true, cushion: true,
  weight: '', weightT: '', fat: '', fatT: '', waist: '', waistT: '',
  houseTarget: '', houseDeadline: '', cushionTarget: '',
};

function collect(container) {
  const form = container.querySelector('form');
  if (!form) return;
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^acc_(\d+)_(name|type|balance)$/);
    if (m) draft.accounts[Number(m[1])][m[2]] = v;
    else if (k in draft && typeof draft[k] !== 'boolean') draft[k] = v;
  }
  for (const k of ['body', 'mind', 'house', 'cushion']) {
    const el = form.querySelector(`[name=${k}]`);
    if (el) draft[k] = el.checked;
  }
}

const dots = () => `<div class="ob-dots">${[0, 1, 2].map((i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>`;

export function render() {
  setCurrency(draft.currency);
  if (step === 0) {
    return `<div class="onboarding">
      <img class="app-icon big" src="icons/icon.svg" alt="">
      <h1 class="ob-title">${wordmark(220)}</h1>
      <p class="brand-sub">BY GAIN TECH</p>
      <p class="muted center">Твои деньги, тело и голова в одном месте. Всё хранится только на этом телефоне.</p>
      <form class="card form">
        <label class="field"><span>Как к тебе обращаться?</span><input name="name" value="${esc(draft.name)}" placeholder="Имя" autocomplete="given-name"></label>
        <label class="field"><span>Валюта</span><select name="currency">${CURRENCIES.map((c) => `<option value="${c.code}" ${c.code === draft.currency ? 'selected' : ''}>${c.symbol} — ${c.name}</option>`).join('')}</select></label>
      </form>
      ${dots()}
      <button class="btn btn-primary btn-block" data-action="ob-next">Начать</button>
    </div>`;
  }
  if (step === 1) {
    return `<div class="onboarding">
      <h1 class="ob-title">Твои деньги</h1>
      <p class="muted center">Я уже заполнила то, что ты рассказал. Поправь, если нужно.</p>
      <form class="card form">
        ${draft.accounts.map((a, i) => `<div class="acc-row">
          <select name="acc_${i}_type" aria-label="Тип">${[['cash', 'Нал'], ['card', 'Карта'], ['savings', 'Вклад']].map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input name="acc_${i}_name" value="${esc(a.name)}" aria-label="Название">
          <input name="acc_${i}_balance" value="${esc(a.balance)}" inputmode="decimal" aria-label="Баланс" class="right">
          <span class="muted">${esc(currency())}</span>
        </div>`).join('')}
        <button type="button" class="btn btn-ghost btn-block" data-action="ob-add-acc">＋ Ещё счёт</button>
      </form>
      ${dots()}
      <div class="row gap"><button class="btn btn-ghost grow" data-action="ob-back">Назад</button><button class="btn btn-primary grow" data-action="ob-next">Дальше</button></div>
    </div>`;
  }
  return `<div class="onboarding">
    <h1 class="ob-title">Твои цели</h1>
    <p class="muted center">Цифры можно оставить пустыми и заполнить позже.</p>
    <form class="form">
      <section class="card ob-goal">
        <label class="check big"><input type="checkbox" name="body" ${draft.body ? 'checked' : ''}> <b>Рельеф и тонус</b></label>
        <p class="hint">Снизить % жира и вернуть мышцам тонус. Укажи «сейчас → цель».</p>
        <div class="metric-row"><span class="metric-name">Вес, кг</span><input name="weight" inputmode="decimal" value="${esc(draft.weight)}" placeholder="сейчас"><span class="muted">→</span><input name="weightT" inputmode="decimal" value="${esc(draft.weightT)}" placeholder="цель"></div>
        <div class="metric-row"><span class="metric-name">% жира</span><input name="fat" inputmode="decimal" value="${esc(draft.fat)}" placeholder="сейчас"><span class="muted">→</span><input name="fatT" inputmode="decimal" value="${esc(draft.fatT)}" placeholder="цель"></div>
        <div class="metric-row"><span class="metric-name">Талия, см</span><input name="waist" inputmode="decimal" value="${esc(draft.waist)}" placeholder="сейчас"><span class="muted">→</span><input name="waistT" inputmode="decimal" value="${esc(draft.waistT)}" placeholder="цель"></div>
      </section>
      <section class="card ob-goal">
        <label class="check big"><input type="checkbox" name="mind" ${draft.mind ? 'checked' : ''}> <b>Ясная голова</b></label>
        <p class="hint">Добавлю привычки: чтение 20 минут, сон до 23:30, первый час без телефона.</p>
      </section>
      <section class="card ob-goal">
        <label class="check big"><input type="checkbox" name="house" ${draft.house ? 'checked' : ''}> <b>Свой дом</b></label>
        <label class="field"><span>Сколько нужно, ${esc(currency())}</span><input name="houseTarget" inputmode="decimal" value="${esc(draft.houseTarget)}" placeholder="например, 5 млн"></label>
        <label class="field"><span>К какой дате</span><input type="date" name="houseDeadline" value="${esc(draft.houseDeadline)}"></label>
      </section>
      <section class="card ob-goal">
        <label class="check big"><input type="checkbox" name="cushion" ${draft.cushion ? 'checked' : ''}> <b>Подушка безопасности</b></label>
        <p class="hint">Деньги на 3–6 месяцев жизни на случай форс-мажора. Это первая копилка, которую стоит собрать.</p>
        <label class="field"><span>Цель, ${esc(currency())}</span><input name="cushionTarget" inputmode="decimal" value="${esc(draft.cushionTarget)}" placeholder="например, 300к"></label>
      </section>
    </form>
    ${dots()}
    <div class="row gap"><button class="btn btn-ghost grow" data-action="ob-back">Назад</button><button class="btn btn-primary grow" data-action="ob-finish">Готово</button></div>
  </div>`;
}

const n = (v) => { const x = parseAmount(v); return Number.isFinite(x) ? x : null; };

async function finish() {
  for (const a of draft.accounts) {
    if (!a.name.trim()) continue;
    await save('accounts', { name: a.name.trim(), type: a.type, initial: n(a.balance) || 0, bank: a.bank || '', last4: a.last4 || null });
  }
  if (draft.body) {
    const metrics = [
      { key: 'weight', start: n(draft.weight), target: n(draft.weightT) },
      { key: 'bodyFat', start: n(draft.fat), target: n(draft.fatT) },
      { key: 'waist', start: n(draft.waist), target: n(draft.waistT) },
    ];
    const g = await save('goals', { kind: 'body', title: 'Рельеф и тонус', why: 'Сухое, сильное тело и энергия каждый день', metrics });
    for (const m of metrics) if (m.start != null) await save('metrics', { goalId: g.id, key: m.key, value: m.start, date: today() });
    for (const title of ['Белок по норме (1,6–2 г/кг)', '8 000+ шагов']) await save('tasks', { title, repeat: 'daily', goalId: g.id, doneDates: [] });
    await save('tasks', { title: 'Силовая тренировка', repeat: 'weekly', timesPerWeek: 3, goalId: g.id, doneDates: [] });
    await save('tasks', { title: 'Сделать замеры и фото «до»', repeat: 'none', due: today(), goalId: g.id, important: true });
  }
  if (draft.mind) {
    const g = await save('goals', { kind: 'mind', title: 'Ясная голова', why: 'Фокус, память и спокойствие' });
    for (const title of ['Чтение 20 минут', 'Лечь спать до 23:30', 'Первый час без телефона']) await save('tasks', { title, repeat: 'daily', goalId: g.id, doneDates: [] });
  }
  if (draft.cushion) {
    await save('piggies', { name: 'Подушка безопасности', icon: 'shield', target: n(draft.cushionTarget), initial: 0 });
  }
  if (draft.house) {
    const p = await save('piggies', { name: 'Свой дом', icon: 'house', target: n(draft.houseTarget), deadline: draft.houseDeadline || null, initial: 0 });
    await save('goals', { kind: 'money', title: 'Свой дом', piggyId: p.id, deadline: draft.houseDeadline || null, why: 'Своё пространство и спокойствие' });
  }
  await seedBusinesses();
  await saveSettings({ name: draft.name.trim(), currency: draft.currency, onboarded: true, migratedV4: true });
  toast('Добро пожаловать в Аврору');
}

export const actions = {
  'ob-next': (_el, _e, rerender, container) => {
    collect(container);
    step = Math.min(2, step + 1);
    rerender(); window.scrollTo(0, 0);
  },
  'ob-back': (_el, _e, rerender, container) => {
    collect(container);
    step = Math.max(0, step - 1);
    rerender(); window.scrollTo(0, 0);
  },
  'ob-add-acc': (_el, _e, rerender, container) => {
    collect(container);
    draft.accounts.push({ name: '', type: 'card', balance: '0' });
    rerender();
  },
  'ob-finish': async (el, _e, _rerender, container) => {
    collect(container);
    el.disabled = true;
    try { await finish(); location.hash = '#today'; } catch (e) { console.error(e); toast('Ошибка: ' + e.message); el.disabled = false; }
  },
};
