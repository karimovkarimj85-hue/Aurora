// Формы бизнес-модуля: бизнес, клиент, сделка, регулярный платёж.
import {
  state, save, remove, byId, active, DEAL_STAGES, CLIENT_STATUS, PERIODS, BIZ_KINDS,
  businessAccount, paySubscription, clientName, accountBalance,
} from './store.js';
import { openSheet, toast, confirmSheet } from './ui.js';
import { esc, today, parseAmount, money, currency } from './util.js';
import { txForm } from './forms.js';

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const amountField = (name, value, label = 'Сумма', required = false) => `
  <label class="field"><span>${label}</span>
    <div class="amount-wrap"><input name="${name}" class="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${value ?? ''}" ${required ? 'required' : ''}>
    <span class="amount-cur">${esc(currency())}</span></div></label>`;
const num = (v) => { const n = parseAmount(v); return Number.isFinite(n) ? n : null; };
const COLORS = ['#FF9F0A', '#0A84FF', '#30D158', '#BF5AF2', '#FF375F', '#64D2FF', '#FFD60A', '#8E8E93'];

function clientSelect(bizId, sel, allowNew = true) {
  const list = active('clients').filter((c) => c.businessId === bizId);
  return `<select name="clientId">${opt('', 'Без клиента', !sel)}${list.map((c) => opt(c.id, clientName(c.id), c.id === sel)).join('')}${allowNew ? opt('__new', '＋ Новый клиент…', false) : ''}</select>`;
}
async function resolveClient(d, bizId) {
  if (d.clientId !== '__new') return d.clientId || null;
  const name = (d.newClient || '').trim();
  if (!name) throw new Error('Укажи имя нового клиента');
  const c = await save('clients', { businessId: bizId, name, status: 'lead' });
  return c.id;
}
const newClientField = `<label class="field" data-newclient hidden><span>Имя нового клиента</span><input name="newClient" placeholder="Например: Магазин «Балу»"></label>`;
const bindNewClient = (el) => {
  const sel = el.querySelector('select[name=clientId]');
  const box = el.querySelector('[data-newclient]');
  const sync = () => { box.hidden = sel.value !== '__new'; };
  sel?.addEventListener('change', sync); sync();
};

// ---------------- Бизнес ----------------

export function businessForm(existing = null) {
  const b = existing || { kind: 'other', color: COLORS[2] };
  openSheet({
    title: existing ? 'Бизнес' : 'Новый бизнес',
    body: `<form class="form">
      <label class="field"><span>Название</span><input name="name" value="${esc(b.name || '')}" required ${existing ? '' : 'autofocus'}></label>
      <label class="field"><span>Чем занимается</span><input name="about" value="${esc(b.about || '')}" placeholder="Коротко"></label>
      <label class="field"><span>Модель</span><select name="kind">${Object.entries(BIZ_KINDS).map(([k, v]) => opt(k, v, k === b.kind)).join('')}</select></label>
      <div class="field"><span>Цвет</span><div class="chips">${COLORS.map((c) => `<label class="chip-radio color"><input type="radio" name="color" value="${c}" ${c === b.color ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}</div></div>
      <label class="field"><span>Цель выручки в месяц (необязательно)</span><input name="revenueGoal" inputmode="decimal" value="${b.revenueGoal ?? ''}" placeholder="например, 2 млн"></label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Создать'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>${existing.archived ? 'Вернуть из архива' : 'В архив'}</button>` : ''}
    </form>`,
    onMount(el, close) {
      el.querySelector('[data-arch]')?.addEventListener('click', async () => {
        await save('businesses', { ...existing, archived: !existing.archived }); close(); toast('Готово');
      });
    },
    async onSubmit(d) {
      const item = { ...(existing || {}), name: d.name.trim(), about: d.about.trim(), kind: d.kind, color: d.color || b.color, revenueGoal: num(d.revenueGoal) };
      const saved = await save('businesses', item);
      if (!existing) {
        const acc = await save('accounts', { name: `Счёт ${saved.name}`, type: 'card', initial: 0, businessId: saved.id });
        await save('businesses', { ...saved, accountId: acc.id });
      }
      toast('Сохранено');
    },
  });
}

// ---------------- Клиент ----------------

export function clientForm(existing = null, bizId = existing?.businessId) {
  const c = existing || { status: 'lead', businessId: bizId };
  openSheet({
    title: existing ? 'Клиент' : 'Новый клиент',
    body: `<form class="form">
      <label class="field"><span>Имя / контактное лицо</span><input name="name" value="${esc(c.name || '')}" required ${existing ? '' : 'autofocus'}></label>
      <label class="field"><span>Компания / точка</span><input name="company" value="${esc(c.company || '')}" placeholder="Например: Кафе «Самса»"></label>
      <div class="row gap">
        <label class="field grow"><span>Телефон</span><input name="phone" type="tel" value="${esc(c.phone || '')}" placeholder="+998…"></label>
        <label class="field grow"><span>Telegram</span><input name="telegram" value="${esc(c.telegram || '')}" placeholder="@username" autocapitalize="off"></label>
      </div>
      <label class="field"><span>Статус</span><select name="status">${Object.entries(CLIENT_STATUS).map(([k, v]) => opt(k, v, k === c.status)).join('')}</select></label>
      <label class="field"><span>Заметки</span><textarea name="note" rows="3" placeholder="Что важно помнить: оборудование, тариф, пожелания">${esc(c.note || '')}</textarea></label>
      ${existing ? `<div class="row gap">
        ${c.phone ? `<a class="btn btn-ghost grow" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">Позвонить</a>` : ''}
        ${c.telegram ? `<a class="btn btn-ghost grow" href="https://t.me/${esc(c.telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">Telegram</a>` : ''}
      </div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-deal>＋ Сделка с клиентом</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить клиента</button>` : ''}
    </form>`,
    onMount(el, close) {
      el.querySelector('[data-deal]')?.addEventListener('click', () => { close(); dealForm(null, c.businessId, { clientId: c.id }); });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Удалить клиента?', 'Сделки и платежи клиента останутся, но без привязки к нему.')) {
          await remove('clients', existing.id); close(); toast('Удалено');
        }
      });
    },
    async onSubmit(d) {
      await save('clients', {
        ...(existing || {}), businessId: c.businessId, name: d.name.trim(), company: d.company.trim(),
        phone: d.phone.trim(), telegram: d.telegram.trim(), status: d.status, note: d.note.trim(),
      });
      toast('Клиент сохранён');
    },
  });
}

// ---------------- Сделка ----------------

export function dealForm(existing = null, bizId = existing?.businessId, preset = {}) {
  const dl = existing || { stage: 'lead', businessId: bizId, ...preset };
  openSheet({
    title: existing ? 'Сделка' : 'Новая сделка',
    body: `<form class="form">
      <label class="field"><span>Что продаём</span><input name="title" value="${esc(dl.title || '')}" placeholder="Например: 2 кассы + внедрение" required ${existing ? '' : 'autofocus'}></label>
      ${amountField('amount', dl.amount, 'Сумма сделки')}
      <label class="field"><span>Клиент</span>${clientSelect(dl.businessId, dl.clientId)}</label>
      ${newClientField}
      <label class="field"><span>Этап</span><select name="stage">${DEAL_STAGES.map((s) => opt(s.id, s.name, s.id === dl.stage)).join('')}</select></label>
      <label class="field"><span>Ожидаемая дата оплаты</span><input type="date" name="expectedDate" value="${esc(dl.expectedDate || '')}"></label>
      <label class="field"><span>Заметки</span><textarea name="note" rows="2">${esc(dl.note || '')}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-arch>В архив</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить сделку</button>` : ''}
    </form>`,
    onMount(el, close) {
      bindNewClient(el);
      el.querySelector('[data-arch]')?.addEventListener('click', async () => { await save('deals', { ...existing, archived: true }); close(); toast('Сделка в архиве'); });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Удалить сделку?', 'Записанные оплаты останутся в финансах.')) { await remove('deals', existing.id); close(); toast('Удалено'); }
      });
    },
    async onSubmit(d) {
      const clientId = await resolveClient(d, dl.businessId);
      const stageChanged = !existing || existing.stage !== d.stage;
      const saved = await save('deals', {
        ...(existing || {}), businessId: dl.businessId, title: d.title.trim(), amount: num(d.amount) || 0,
        clientId, stage: d.stage, expectedDate: d.expectedDate || null, note: d.note.trim(),
        stageChangedAt: stageChanged ? new Date().toISOString() : existing.stageChangedAt,
        closedAt: ['won', 'lost'].includes(d.stage) ? (existing?.closedAt || new Date().toISOString()) : null,
      });
      if (clientId && d.stage === 'won') {
        const c = byId('clients', clientId);
        if (c && c.status !== 'active') await save('clients', { ...c, status: 'active' });
      }
      toast('Сделка сохранена');
      if (stageChanged && d.stage === 'won' && saved.amount > 0 && !state.transactions.some((t) => t.dealId === saved.id)) {
        setTimeout(() => offerDealPayment(saved), 260);
      }
    },
  });
}

/** После «Оплачено» — предложить записать доход */
export function offerDealPayment(deal) {
  txForm(null, 'income', {
    businessId: deal.businessId,
    preset: { amount: deal.amount, categoryId: 'biz_sale', note: deal.title, dealId: deal.id, clientId: deal.clientId },
  });
}

export async function moveDeal(deal, dir) {
  const i = DEAL_STAGES.findIndex((s) => s.id === deal.stage);
  const next = DEAL_STAGES[Math.min(DEAL_STAGES.length - 2, Math.max(0, i + dir))]; // не перескакиваем на «Отказ»
  if (!next || next.id === deal.stage) return;
  const saved = await save('deals', { ...deal, stage: next.id, stageChangedAt: new Date().toISOString(), closedAt: next.id === 'won' ? new Date().toISOString() : null });
  toast(`«${deal.title}» → ${next.name}`);
  if (next.id === 'won' && saved.amount > 0 && !state.transactions.some((t) => t.dealId === saved.id)) offerDealPayment(saved);
}

// ---------------- Регулярный платёж (подписка / обслуживание) ----------------

export function subscriptionForm(existing = null, bizId = existing?.businessId) {
  const biz = byId('businesses', bizId);
  const s = existing || { businessId: bizId, period: 'month', nextDate: today(), active: true, categoryId: biz?.kind === 'saas' ? 'biz_sub' : 'biz_service' };
  openSheet({
    title: existing ? 'Регулярный платёж' : 'Новый регулярный платёж',
    body: `<form class="form">
      <p class="hint">${biz?.kind === 'saas' ? 'Подписка клиента на CRM: тариф, сумма и дата следующей оплаты.' : 'Абонентское обслуживание, лицензия или аренда оборудования.'} Аврора напомнит о дате и посчитает регулярный доход в месяц.</p>
      <label class="field"><span>Клиент</span>${clientSelect(bizId, s.clientId)}</label>
      ${newClientField}
      <label class="field"><span>Тариф / услуга</span><input name="title" value="${esc(s.title || '')}" placeholder="${biz?.kind === 'saas' ? 'Например: Тариф «Бизнес», 5 пользователей' : 'Например: Обслуживание 2 касс'}"></label>
      <div class="row gap">
        <div class="grow">${amountField('amount', s.amount, 'Сумма', true)}</div>
        <label class="field" style="width:130px"><span>Период</span><select name="period">${Object.entries(PERIODS).map(([k, v]) => opt(k, v.name, k === s.period)).join('')}</select></label>
      </div>
      <label class="field"><span>Следующая оплата</span><input type="date" name="nextDate" value="${esc(s.nextDate || today())}" required></label>
      <label class="field"><span>Категория дохода</span><select name="categoryId">${state.categories.filter((c) => c.scope === 'biz' && c.kind === 'income').map((c) => opt(c.id, `${c.emoji} ${c.name}`, c.id === s.categoryId)).join('')}</select></label>
      <label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> Активна</label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? `<button class="btn btn-ghost btn-block" type="button" data-pay>✓ Отметить оплату</button>
        <button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить</button>` : ''}
    </form>`,
    onMount(el, close) {
      bindNewClient(el);
      el.querySelector('[data-pay]')?.addEventListener('click', () => { close(); payForm(existing); });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Удалить платёж?', 'Уже полученные оплаты останутся в финансах.')) { await remove('subscriptions', existing.id); close(); toast('Удалено'); }
      });
    },
    async onSubmit(d) {
      const amount = num(d.amount);
      if (!(amount > 0)) throw new Error('Укажи сумму');
      const clientId = await resolveClient(d, bizId);
      await save('subscriptions', {
        ...(existing || {}), businessId: bizId, clientId, title: d.title.trim(), amount, period: d.period,
        nextDate: d.nextDate, categoryId: d.categoryId, active: !!d.active,
      });
      if (clientId && d.active) {
        const c = byId('clients', clientId);
        if (c && c.status === 'lead') await save('clients', { ...c, status: 'active' });
      }
      toast('Сохранено');
    },
  });
}

export function payForm(sub) {
  const biz = byId('businesses', sub.businessId);
  const accs = active('accounts').filter((a) => a.businessId === sub.businessId);
  const def = businessAccount(biz);
  openSheet({
    title: 'Оплата получена',
    body: `<form class="form">
      <p class="muted">${esc(clientName(sub.clientId) || sub.title || 'Платёж')}${sub.title && sub.clientId ? ` · ${esc(sub.title)}` : ''}</p>
      ${amountField('amount', sub.amount, 'Сумма', true)}
      <label class="field"><span>На счёт</span><select name="accountId">${accs.map((a) => opt(a.id, `${a.name} · ${money(accountBalance(a.id))}`, a.id === def?.id)).join('')}</select></label>
      <label class="field"><span>Дата</span><input type="date" name="date" value="${today()}"></label>
      <button class="btn btn-primary btn-block" type="submit">Записать оплату</button>
    </form>`,
    async onSubmit(d) {
      const amount = num(d.amount);
      if (!(amount > 0)) throw new Error('Укажи сумму');
      await paySubscription(sub, { amount, accountId: d.accountId, date: d.date || today() });
      toast(`Оплата ${money(amount)} записана ✓`);
    },
  });
}
