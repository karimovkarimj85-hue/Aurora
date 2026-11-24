// Сделки: позиции из прайс-листа, скидка, частичные оплаты, следующий шаг, история.
import {
  state, save, remove, byId, active, DEAL_STAGES, businessAccount, clientName, accountBalance,
} from './store.js';
import { openSheet, toast, confirmSheet, bar } from './ui.js';
import { esc, today, parseAmount, money, currency, humanDate, num as fmtNum } from './util.js';
import { icon } from './icons.js';

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const n = (v) => { const x = parseAmount(v); return Number.isFinite(x) ? x : 0; };
export const PRODUCT_KINDS = { product: 'Товар', service: 'Услуга', license: 'Лицензия / подписка' };
const stageName = (id) => DEAL_STAGES.find((s) => s.id === id)?.name || '';

// ---------- Расчёты ----------

export const itemsTotal = (items = []) => items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
export const dealPaid = (deal) => state.transactions
  .filter((t) => t.dealId === deal.id && t.type === 'income')
  .reduce((s, t) => s + (Number(t.amount) || 0), 0);
export const dealLeft = (deal) => Math.max(0, (Number(deal.amount) || 0) - dealPaid(deal));
export const dealActivities = (deal) => state.activities.filter((a) => a.dealId === deal.id)
  .sort((a, b) => (b.at || '').localeCompare(a.at || ''));

export async function logActivity(deal, kind, text) {
  return save('activities', { dealId: deal.id, clientId: deal.clientId || null, businessId: deal.businessId, kind, text, at: new Date().toISOString() });
}

/** Следующие шаги на сегодня и просроченные (для «Сегодня» и подсказок) */
export function dueSteps(day = today()) {
  return active('deals').filter((d) => d.nextStep && d.nextDate && d.nextDate <= day && DEAL_STAGES.find((s) => s.id === d.stage)?.open)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

export async function setStage(deal, stage) {
  if (deal.stage === stage) return deal;
  const saved = await save('deals', {
    ...deal, stage, stageChangedAt: new Date().toISOString(),
    closedAt: ['won', 'lost'].includes(stage) ? new Date().toISOString() : null,
  });
  await logActivity(saved, 'stage', `Этап: ${stageName(stage)}`);
  if (stage === 'won' && saved.clientId) {
    const c = byId('clients', saved.clientId);
    if (c && c.status !== 'active') await save('clients', { ...c, status: 'active' });
  }
  return saved;
}

export async function moveDeal(deal, dir) {
  const i = DEAL_STAGES.findIndex((s) => s.id === deal.stage);
  const next = DEAL_STAGES[Math.min(DEAL_STAGES.length - 2, Math.max(0, i + dir))]; // «Отказ» — только явно
  if (!next || next.id === deal.stage) return;
  const saved = await setStage(deal, next.id);
  toast(`«${deal.title}» → ${next.name}`);
  if (next.id === 'won' && dealLeft(saved) > 0) setTimeout(() => dealPayForm(saved), 200);
}

/** Записать оплату по сделке (предоплата, частичная или полная) */
export async function recordDealPayment(deal, { amount, accountId, date, note } = {}) {
  const biz = byId('businesses', deal.businessId);
  const acc = byId('accounts', accountId) || businessAccount(biz);
  const paidBefore = dealPaid(deal);
  const isFirst = paidBefore === 0;
  const tx = await save('transactions', {
    type: 'income', amount, categoryId: 'biz_sale', accountId: acc?.id, businessId: deal.businessId,
    dealId: deal.id, clientId: deal.clientId, date: date || today(),
    note: note || `${deal.title}${isFirst && amount < deal.amount ? ' (предоплата)' : ''}`,
  });
  await logActivity(deal, 'payment', `Оплата ${money(amount)}${amount < (deal.amount - paidBefore) ? ` · осталось ${money(deal.amount - paidBefore - amount)}` : ' · оплачено полностью'}`);
  let fresh = byId('deals', deal.id);
  if (dealLeft(fresh) <= 0 && fresh.stage !== 'won') fresh = await setStage(fresh, 'won');
  return { tx, deal: fresh };
}

// ---------- Форма оплаты ----------

export function dealPayForm(deal) {
  const left = dealLeft(deal);
  const accs = active('accounts').filter((a) => a.businessId === deal.businessId);
  const def = businessAccount(byId('businesses', deal.businessId));
  openSheet({
    title: 'Оплата по сделке',
    body: `<form class="form">
      <p class="muted">${esc(deal.title)}${deal.clientId ? ` · ${esc(clientName(deal.clientId))}` : ''}</p>
      <div class="pay-summary"><div><span class="muted small">Сумма сделки</span><b>${money(deal.amount)}</b></div>
        <div><span class="muted small">Осталось получить</span><b>${money(left)}</b></div></div>
      <label class="field"><span>Получено</span><div class="amount-wrap"><input name="amount" class="amount" inputmode="decimal" value="${left || ''}" required autofocus><span class="amount-cur">${esc(currency())}</span></div></label>
      ${left > 0 ? `<div class="chips">${[0.3, 0.5, 1].map((k) => `<button type="button" class="chip" data-part="${Math.round(left * k)}">${k === 1 ? 'Всё' : `${k * 100}%`}</button>`).join('')}</div>` : ''}
      <label class="field"><span>На счёт</span><select name="accountId">${accs.map((a) => opt(a.id, `${a.name} · ${money(accountBalance(a.id))}`, a.id === def?.id)).join('')}</select></label>
      <label class="field"><span>Дата</span><input type="date" name="date" value="${today()}"></label>
      <button class="btn btn-primary btn-block" type="submit">Записать оплату</button>
    </form>`,
    onMount(el) {
      el.querySelectorAll('[data-part]').forEach((b) => b.addEventListener('click', () => { el.querySelector('[name=amount]').value = b.dataset.part; }));
    },
    async onSubmit(d) {
      const amount = n(d.amount);
      if (!(amount > 0)) throw new Error('Укажи сумму');
      const { deal: fresh } = await recordDealPayment(deal, { amount, accountId: d.accountId, date: d.date });
      toast(dealLeft(fresh) > 0 ? `Получено ${money(amount)} · осталось ${money(dealLeft(fresh))}` : `Сделка оплачена полностью`);
    },
  });
}

// ---------- Форма сделки с позициями ----------

function clientSelect(bizId, sel) {
  const list = active('clients').filter((c) => c.businessId === bizId);
  return `<select name="clientId">${opt('', 'Без клиента', !sel)}${list.map((c) => opt(c.id, clientName(c.id), c.id === sel)).join('')}${opt('__new', 'Новый клиент…', false)}</select>`;
}

export function dealForm(existing = null, bizId = existing?.businessId, preset = {}) {
  const dl = existing || { stage: 'lead', businessId: bizId, items: [], discount: 0, ...preset };
  let items = (dl.items || []).map((it) => ({ ...it }));
  const products = active('products').filter((p) => p.businessId === dl.businessId);
  openSheet({
    title: existing ? 'Изменить сделку' : 'Новая сделка',
    body: `<form class="form" novalidate>
      <label class="field"><span>Название</span><input name="title" value="${esc(dl.title || '')}" placeholder="Например: Автоматизация кафе «Самса»" required ${existing ? '' : 'autofocus'}></label>
      <label class="field"><span>Клиент</span>${clientSelect(dl.businessId, dl.clientId)}</label>
      <label class="field" data-newclient hidden><span>Имя нового клиента</span><input name="newClient" placeholder="Имя или компания"></label>

      <div class="field"><span>Позиции</span>
        <div class="card items-card"><ul class="items" data-items></ul>
          <div class="row gap items-add">
            ${products.length ? `<select data-addprod class="grow">${opt('', 'Добавить из прайса…', true)}${products.map((p) => opt(p.id, `${p.name} · ${money(p.price)}`, false)).join('')}</select>` : ''}
            <button type="button" class="mini-btn" data-additem>${icon('plus', { size: 14, w: 2.2 })} Позиция</button>
          </div>
        </div>
        ${products.length ? '' : '<p class="hint">Заполни прайс-лист бизнеса, и позиции будут подставляться в одно касание.</p>'}
      </div>
      <div class="row gap">
        <label class="field grow"><span>Скидка, ${esc(currency())}</span><input name="discount" inputmode="decimal" value="${dl.discount || ''}" placeholder="0"></label>
        <label class="field grow"><span>Итого</span><input name="amount" inputmode="decimal" value="${dl.amount ?? ''}" placeholder="0" data-total></label>
      </div>

      <label class="field"><span>Этап</span><select name="stage">${DEAL_STAGES.map((s) => opt(s.id, s.name, s.id === dl.stage)).join('')}</select></label>
      <div class="row gap">
        <label class="field grow"><span>Следующий шаг</span><input name="nextStep" value="${esc(dl.nextStep || '')}" placeholder="Позвонить, отправить КП…"></label>
        <label class="field" style="width:150px"><span>Когда</span><input type="date" name="nextDate" value="${esc(dl.nextDate || '')}"></label>
      </div>
      <label class="field"><span>Ожидаемая оплата</span><input type="date" name="expectedDate" value="${esc(dl.expectedDate || '')}"></label>
      <label class="field"><span>Заметки</span><textarea name="note" rows="2">${esc(dl.note || '')}</textarea></label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Создать сделку'}</button>
      ${existing ? `<button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить сделку</button>` : ''}
    </form>`,
    onMount(el, close) {
      const list = el.querySelector('[data-items]');
      const total = el.querySelector('[data-total]');
      const disc = el.querySelector('[name=discount]');
      const sel = el.querySelector('select[name=clientId]');
      sel.addEventListener('change', () => { el.querySelector('[data-newclient]').hidden = sel.value !== '__new'; });
      const recalc = () => { if (items.length) total.value = Math.max(0, itemsTotal(items) - n(disc.value)); total.readOnly = items.length > 0; };
      const draw = () => {
        list.innerHTML = items.map((it, i) => `<li class="item-row">
          <input class="item-name" data-f="name" data-i="${i}" value="${esc(it.name || '')}" placeholder="Название">
          <input class="item-qty" data-f="qty" data-i="${i}" value="${it.qty ?? 1}" inputmode="decimal" aria-label="Количество">
          <span class="muted">×</span>
          <input class="item-price" data-f="price" data-i="${i}" value="${it.price ?? ''}" inputmode="decimal" placeholder="Цена" aria-label="Цена">
          <button type="button" class="icon-btn sm" data-rm="${i}" aria-label="Убрать">${icon('close', { size: 14 })}</button>
        </li>`).join('') || '<li class="muted small items-empty">Без позиций: укажи итог вручную</li>';
        recalc();
      };
      list.addEventListener('input', (e) => {
        const f = e.target.dataset.f; const i = Number(e.target.dataset.i);
        if (!f) return;
        items[i][f] = f === 'name' ? e.target.value : n(e.target.value);
        recalc();
      });
      list.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { items.splice(Number(rm.dataset.rm), 1); draw(); } });
      disc.addEventListener('input', recalc);
      el.querySelector('[data-additem]').addEventListener('click', () => { items.push({ name: '', qty: 1, price: 0 }); draw(); list.querySelector('li:last-child .item-name')?.focus(); });
      el.querySelector('[data-addprod]')?.addEventListener('change', (e) => {
        const p = byId('products', e.target.value);
        if (p) {
          const same = items.find((it) => it.productId === p.id);
          if (same) same.qty = (Number(same.qty) || 0) + 1; else items.push({ productId: p.id, name: p.name, qty: 1, price: p.price });
          if (!el.querySelector('[name=title]').value) el.querySelector('[name=title]').value = p.name;
        }
        e.target.value = ''; draw();
      });
      draw();
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (await confirmSheet('Удалить сделку?', 'Записанные оплаты останутся в финансах.')) {
          for (const a of state.activities.filter((x) => x.dealId === existing.id)) await remove('activities', a.id);
          await remove('deals', existing.id); close(); toast('Удалено');
        }
      });
    },
    async onSubmit(d) {
      if (!d.title.trim()) throw new Error('Назови сделку');
      let clientId = d.clientId || null;
      if (clientId === '__new') {
        if (!d.newClient.trim()) throw new Error('Укажи имя нового клиента');
        clientId = (await save('clients', { businessId: dl.businessId, name: d.newClient.trim(), status: 'lead' })).id;
      }
      const clean = items.filter((it) => (it.name || '').trim() && Number(it.qty) > 0);
      const amount = clean.length ? Math.max(0, itemsTotal(clean) - n(d.discount)) : n(d.amount);
      const stageChanged = existing && existing.stage !== d.stage;
      const saved = await save('deals', {
        ...(existing || {}), businessId: dl.businessId, title: d.title.trim(), clientId, items: clean,
        discount: n(d.discount), amount, stage: existing ? existing.stage : d.stage,
        nextStep: d.nextStep.trim() || null, nextDate: d.nextDate || null,
        expectedDate: d.expectedDate || null, note: d.note.trim(),
        stageChangedAt: existing ? existing.stageChangedAt : new Date().toISOString(),
      });
      if (!existing) await logActivity(saved, 'stage', `Сделка создана · ${stageName(saved.stage)}`);
      const fresh = stageChanged ? await setStage(saved, d.stage) : saved;
      toast('Сделка сохранена');
      if (stageChanged && d.stage === 'won' && dealLeft(fresh) > 0) setTimeout(() => dealPayForm(fresh), 260);
      else setTimeout(() => dealSheet(byId('deals', fresh.id)), 260);
    },
  });
}

// ---------- Карточка сделки ----------

const ACT_ICON = { stage: 'funnel', payment: 'banknote', note: 'pencil', call: 'phone', step: 'check' };

export function dealSheet(deal) {
  if (!deal) return;
  const client = deal.clientId ? byId('clients', deal.clientId) : null;
  const paid = dealPaid(deal);
  const left = dealLeft(deal);
  const acts = dealActivities(deal);
  const open = DEAL_STAGES.find((s) => s.id === deal.stage)?.open;
  const late = deal.nextDate && deal.nextDate < today();
  const close = openSheet({
    title: deal.title,
    wide: true,
    body: `
      <div class="deal-hero">
        <p class="eyebrow">${client ? esc(clientName(client.id)) : 'Без клиента'}</p>
        <p class="hero-num">${money(deal.amount)}</p>
        ${deal.amount > 0 ? `${bar(Math.min(1, paid / deal.amount))}<p class="muted small">Получено ${money(paid)}${left > 0 ? ` · осталось ${money(left)}` : ' · оплачено полностью'}</p>` : ''}
      </div>
      <div class="stage-track" role="radiogroup" aria-label="Этап">${DEAL_STAGES.map((s) => `<button type="button" class="stage-chip ${s.id === deal.stage ? 'on' : ''} ${s.id === 'lost' ? 'lost' : ''}" data-stage="${s.id}">${esc(s.name)}</button>`).join('')}</div>

      <div class="row gap mt">
        ${left > 0 ? `<button class="btn btn-primary grow" data-act="pay">${icon('banknote', { size: 18 })} Оплата</button>` : ''}
        <button class="btn btn-ghost grow" data-act="edit">${icon('pencil', { size: 18 })} Изменить</button>
      </div>
      ${client && (client.phone || client.telegram) ? `<div class="row gap mt">
        ${client.phone ? `<a class="btn btn-ghost grow" href="tel:${esc(client.phone.replace(/[^\d+]/g, ''))}">${icon('phone', { size: 18 })} Позвонить</a>` : ''}
        ${client.telegram ? `<a class="btn btn-ghost grow" href="https://t.me/${esc(client.telegram.replace(/^@/, ''))}" target="_blank" rel="noopener">${icon('message', { size: 18 })} Telegram</a>` : ''}
      </div>` : ''}

      ${open ? `<section class="card next-step ${late ? 'late' : ''}">
        <div class="section-head"><h3 class="card-title">Следующий шаг</h3>${deal.nextDate ? `<span class="small ${late ? 'neg' : 'muted'}">${esc(humanDate(deal.nextDate))}</span>` : ''}</div>
        ${deal.nextStep ? `<p>${esc(deal.nextStep)}</p><div class="row gap mt"><button class="mini-btn accent" data-act="step-done">${icon('check', { size: 14, w: 2.4 })} Сделано</button><button class="mini-btn" data-act="edit">Изменить</button></div>`
          : `<p class="muted small">Не задан. У каждой открытой сделки должен быть следующий шаг с датой, тогда ни одна не потеряется.</p><button class="mini-btn mt" data-act="edit">Задать шаг</button>`}
      </section>` : ''}

      ${(deal.items || []).length ? `<section class="card"><h3 class="card-title">Позиции</h3>
        <ul class="mini-list">${deal.items.map((it) => `<li><span>${esc(it.name)} × ${fmtNum(it.qty, true)}</span><b>${money(it.price * it.qty)}</b></li>`).join('')}
        ${deal.discount ? `<li><span>Скидка</span><b>−${money(deal.discount)}</b></li>` : ''}</ul></section>` : ''}

      <section class="card">
        <h3 class="card-title">История</h3>
        <form class="row gap note-form"><input name="note" placeholder="Заметка: о чём договорились…" autocomplete="off"><button class="mini-btn accent" type="submit">Добавить</button></form>
        <ul class="timeline">${acts.map((a) => `<li><span class="tl-ic">${icon(ACT_ICON[a.kind] || 'pencil', { size: 14 })}</span>
          <div class="grow"><span>${esc(a.text)}</span><span class="row-sub">${esc(new Date(a.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></div></li>`).join('') || '<li class="muted small">Пока пусто</li>'}</ul>
      </section>
      <button class="btn btn-ghost btn-block" data-act="archive">В архив</button>`,
    onMount(el) {
      const reopen = () => { close(); setTimeout(() => dealSheet(byId('deals', deal.id)), 260); };
      el.addEventListener('click', async (e) => {
        const st = e.target.closest('[data-stage]')?.dataset.stage;
        if (st && st !== deal.stage) {
          const fresh = await setStage(deal, st);
          if (st === 'won' && dealLeft(fresh) > 0) { close(); setTimeout(() => dealPayForm(fresh), 260); } else reopen();
          return;
        }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'pay') { close(); setTimeout(() => dealPayForm(deal), 260); }
        if (act === 'edit') { close(); setTimeout(() => dealForm(deal), 260); }
        if (act === 'step-done') {
          await logActivity(deal, 'step', `Сделано: ${deal.nextStep}`);
          await save('deals', { ...byId('deals', deal.id), nextStep: null, nextDate: null });
          close(); setTimeout(() => dealForm(byId('deals', deal.id)), 260); toast('Отлично! Задай следующий шаг');
        }
        if (act === 'archive') { await save('deals', { ...deal, archived: true }); close(); toast('Сделка в архиве'); }
      });
      el.querySelector('.note-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = e.target.note.value.trim();
        if (!v) return;
        await logActivity(deal, 'note', v);
        reopen();
      });
    },
  });
}

// ---------- Прайс-лист ----------

export function productForm(existing = null, bizId = existing?.businessId) {
  const p = existing || { businessId: bizId, kind: 'product', unit: 'шт' };
  openSheet({
    title: existing ? 'Позиция прайса' : 'Новая позиция',
    body: `<form class="form">
      <label class="field"><span>Название</span><input name="name" value="${esc(p.name || '')}" placeholder="Например: POS-моноблок 15&quot;" required ${existing ? '' : 'autofocus'}></label>
      <div class="segmented">${Object.entries(PRODUCT_KINDS).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${p.kind === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
      <div class="row gap">
        <label class="field grow"><span>Цена, ${esc(currency())}</span><input name="price" inputmode="decimal" value="${p.price ?? ''}" required></label>
        <label class="field" style="width:110px"><span>Ед.</span><input name="unit" value="${esc(p.unit || 'шт')}"></label>
      </div>
      <label class="field"><span>Себестоимость (необязательно)</span><input name="cost" inputmode="decimal" value="${p.cost ?? ''}" placeholder="Для расчёта маржи"></label>
      <button class="btn btn-primary btn-block" type="submit">${existing ? 'Сохранить' : 'Добавить'}</button>
      ${existing ? '<button class="btn btn-ghost-danger btn-block" type="button" data-del>Удалить</button>' : ''}
    </form>`,
    onMount(el, close) {
      el.querySelector('[data-del]')?.addEventListener('click', async () => { await save('products', { ...existing, archived: true }); close(); toast('Удалено из прайса'); });
    },
    async onSubmit(d) {
      const price = n(d.price);
      if (!(price >= 0) || d.price === '') throw new Error('Укажи цену');
      await save('products', { ...(existing || {}), businessId: p.businessId, name: d.name.trim(), kind: d.kind, price, unit: d.unit.trim() || 'шт', cost: d.cost ? n(d.cost) : null });
      toast('Прайс обновлён');
    },
  });
}
