// Нижние шторки (bottom sheets), уведомления-тосты, подтверждения.
import { esc } from './util.js';

const root = () => document.getElementById('sheet-root');

/**
 * Открыть шторку.
 * @param {{title:string, body:string, onMount?:(el:HTMLElement, close:Function)=>void, onSubmit?:(data:Object, el:HTMLElement)=>any}} opts
 * Если в body есть <form>, onSubmit получает данные формы; вернёт false — шторка не закроется.
 */
export function openSheet({ title, body, onMount, onSubmit, wide = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Закрыть">✕</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  root().appendChild(wrap);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => {
      wrap.remove();
      if (!root().children.length) document.body.classList.remove('sheet-open');
    }, 220);
  };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

  const form = wrap.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector('[type=submit]');
      if (btn) btn.disabled = true;
      try {
        const res = await onSubmit(data, wrap);
        if (res !== false) close();
      } catch (err) {
        console.error(err);
        toast(err.message || 'Ошибка');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
  onMount?.(wrap, close);
  const first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 250);
  return close;
}

let toastTimer;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  const btn = el.querySelector('.toast-btn');
  if (btn) btn.onclick = () => { onAction?.(); hide(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
  function hide() {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }
}

export function confirmSheet(title, text, { ok = 'Удалить', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const close = openSheet({
      title,
      body: `<p class="muted">${esc(text)}</p>
        <div class="row gap">
          <button class="btn btn-ghost grow" data-close>Отмена</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-ok>${esc(ok)}</button>
        </div>`,
      onMount(el) {
        el.querySelector('[data-ok]').onclick = () => { answered = true; resolve(true); close(); };
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]') && !answered) resolve(false);
        });
      },
    });
  });
}

/** Прогресс-кольцо (SVG). value 0..1 или null */
export function ring(value, size = 56, stroke = 6) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : value;
  const label = value == null ? '—' : `${Math.round(v * 100)}%`;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Прогресс ${label}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" class="ring-text">${label}</text>
  </svg>`;
}

export const bar = (value) => `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((value || 0) * 100)}"><span style="width:${Math.round((value || 0) * 100)}%"></span></div>`;

export function emptyState(emoji, title, text, actionHtml = '') {
  return `<div class="empty"><div class="empty-emoji">${emoji}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${actionHtml}</div>`;
}
