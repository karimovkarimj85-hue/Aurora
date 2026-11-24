import { state, saveChat } from '../store.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { toast, confirmSheet, openSheet } from '../ui.js';
import { parseQuick, runQuick, claudeBrief, CLAUDE_URL } from '../quick.js';
import { maskCodes } from '../bank.js';
import { runTurn, describeTool, isStamp, undoRegistry, undone } from '../ai.js';

let busy = false;
let pending = []; // вложения: {kind:'image'|'text', name, block, preview?}
let controller = null;

const SUGGESTIONS = [
  'Потратил 350 на кофе',
  'ZK POS: продал 2 кассы кафе «Самса» за 12 млн',
  'Кто из клиентов должен заплатить на этой неделе?',
  'Разбери прибыль моих бизнесов за месяц',
  'Как подсушиться и не потерять мышцы?',
  'Разбери мои траты за месяц',
  'Составь план тренировок на неделю',
  'Сколько откладывать в месяц на дом?',
  'Утром вешу 82,4',
];

function md(text) {
  const lines = esc(text).split('\n');
  let html = ''; let inList = false;
  for (const raw of lines) {
    let line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(.+?)\*(?=\s|$)/g, '$1<i>$2</i>');
    const li = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,4}\s/.test(line)) line = `<b>${line.replace(/^#{1,4}\s/, '')}</b>`;
    html += line.trim() ? `<p>${line}</p>` : '';
  }
  if (inList) html += '</ul>';
  return html;
}

function renderHistory() {
  const msgs = state.chat;
  // Результаты инструментов, чтобы знать, успешно ли выполнено действие
  const results = new Map();
  for (const m of msgs) {
    if (m.role === 'user' && Array.isArray(m.content)) {
      for (const b of m.content) if (b.type === 'tool_result') results.set(b.tool_use_id, b);
    }
  }
  let html = '';
  for (const m of msgs) {
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }];
    if (m.role === 'user') {
      if (blocks.every((b) => b.type === 'tool_result')) continue;
      const texts = blocks.filter((b) => b.type === 'text' && !isStamp(b) && !b.text.startsWith('<file'));
      const imgs = blocks.filter((b) => b.type === 'image');
      const files = blocks.filter((b) => b.type === 'text' && b.text.startsWith('<file'));
      html += `<div class="msg user">
        ${imgs.map((b) => `<img class="msg-img" alt="Фото" src="data:${b.source.media_type};base64,${b.source.data}">`).join('')}
        ${files.map((b) => `<span class="file-chip">${icon('paperclip', { size: 14 })} ${esc((b.text.match(/name="([^"]+)"/) || [])[1] || 'файл')}</span>`).join('')}
        ${texts.map((b) => `<div class="bubble">${md(b.text)}</div>`).join('')}
      </div>`;
    } else {
      for (const b of blocks) {
        if (b.type === 'text' && b.text.trim()) html += `<div class="msg ai"><div class="bubble">${md(b.text)}</div></div>`;
        if (b.type === 'tool_use') {
          const label = describeTool(b.name, b.input);
          if (!label) continue;
          const r = results.get(b.id);
          const ok = r && !r.is_error;
          if (undone.has(b.id)) {
            html += `<div class="msg ai"><div class="action-chip undone"><span>↩︎ ${esc(label)} · отменено</span></div></div>`;
            continue;
          }
          html += `<div class="msg ai"><div class="action-chip ${ok ? 'ok' : 'err'}">
            <span>${esc(ok ? label : (r?.content || label))}</span>
            ${ok && undoRegistry.has(b.id) ? `<button class="link" data-action="undo" data-id="${b.id}">Отменить</button>` : ''}
          </div></div>`;
        }
      }
    }
  }
  return html;
}

// ---------- Режим без ключа API ----------
const LOCAL_SUGGESTIONS = ['кофе 350', 'зарплата 85к', 'вес 82,4', 'задача: позвонить клиенту завтра'];
let localLog = (() => { try { return JSON.parse(localStorage.getItem('aurora-local-chat') || '[]'); } catch { return []; } })();
function saveLocal() {
  try { localStorage.setItem('aurora-local-chat', JSON.stringify(localLog.slice(-60).map((m) => ({ role: m.role, text: m.text, undone: m.undone })))); } catch { /* приватный режим */ }
}
function renderLocal() {
  return localLog.map((m, i) => (m.role === 'user'
    ? `<div class="msg user"><div class="bubble">${md(m.text)}</div></div>`
    : `<div class="msg ai"><div class="bubble ${m.undone ? 'undone' : ''}">${md(m.text)}${m.undo ? `<button class="link" data-action="local-undo" data-i="${i}">Отменить</button>` : ''}</div></div>`)).join('');
}
async function sendLocal(t, rerender) {
  if (!t) { toast('Без ключа ИИ я не умею читать фото и файлы. Нажми «Спросить Claude»'); pending = []; rerender(); return; }
  pending = [];
  localLog.push({ role: 'user', text: maskCodes(t) }); // одноразовые коды не храним
  const parsed = parseQuick(t);
  let reply;
  try { reply = parsed ? await runQuick(parsed) : null; } catch (e) { reply = { text: `Не получилось: ${e.message}` }; }
  localLog.push(reply ? { role: 'ai', text: reply.text, undo: reply.undo } : {
    role: 'ai',
    text: 'Не поняла фразу. Примеры: «такси 600», «доход 50к», «вес 82,4», «задача: …». Для вопросов и советов нажми «Спросить Claude» вверху.',
  });
  saveLocal(); rerender(); scrollDown();
}

function askClaudeSheet() {
  const close = openSheet({
    title: 'Спросить Claude',
    body: `<form class="form">
      <p class="hint">Аврора соберёт короткую сводку (деньги, бизнесы, цели, задачи), скопирует её и откроет Claude. Если Claude откроется пустым, вставь текст в поле сообщения.</p>
      <label class="field"><span>Вопрос (необязательно)</span><textarea name="q" rows="3" placeholder="Например: как мне быстрее накопить на дом? Что улучшить в ZK POS?"></textarea></label>
      <button class="btn btn-primary btn-block" type="submit">${icon('sparkles', { size: 18 })} Скопировать и открыть Claude</button>
      <button class="btn btn-ghost btn-block" type="button" data-preview>Показать сводку</button>
      <pre class="brief" hidden></pre>
    </form>`,
    onMount(el) {
      el.querySelector('[data-preview]').addEventListener('click', () => {
        const pre = el.querySelector('.brief'); pre.textContent = claudeBrief(el.querySelector('[name=q]').value); pre.hidden = false;
      });
    },
    async onSubmit(d) {
      const text = claudeBrief(d.q.trim());
      try { await navigator.clipboard.writeText(text); } catch { /* без доступа к буферу */ }
      const url = text.length < 6000 ? `${CLAUDE_URL}?q=${encodeURIComponent(text)}` : CLAUDE_URL;
      window.open(url, '_blank', 'noopener');
      toast('Сводка скопирована');
      void close;
    },
  });
}

export function render() {
  const hasKey = !!state.settings.apiKey;
  return `
  <div class="chat-page">
    <header class="page-head compact">
      <div><h1>Аврора</h1><p class="eyebrow">${hasKey ? 'ИИ-помощник на Claude' : 'Умный ввод · без ключа ИИ'}</p></div>
      <div class="row gap">
        <button class="icon-btn lg" data-action="ask-claude" aria-label="Спросить Claude">${icon('sparkles', { size: 20 })}</button>
        ${(hasKey ? state.chat.length : localLog.length) ? `<button class="icon-btn lg tinted" data-action="new-chat" aria-label="Новый диалог">${icon('compose', { size: 20 })}</button>` : ''}
      </div>
    </header>
    <div class="chat-scroll" id="chat-scroll">
      ${!hasKey && !localLog.length ? `<div class="card ai-off">
        <p><b>ИИ пока не подключён, но я уже понимаю простые фразы.</b> Пиши «кофе 350», «зарплата 85к», «вес 82,4», «задача: позвонить Самсе завтра», «ZK POS продал 2 кассы 12 млн» или вставь SMS банка.</p>
        <p class="muted small">Для советов и анализа нажми ${icon('sparkles', { size: 14, cls: 'inline' })} «Спросить Claude»: Аврора соберёт сводку и откроет твоё приложение Claude, оно входит в подписку. Полноценный ИИ внутри Авроры включается ключом API в настройках.</p>
      </div>` : ''}
      ${hasKey && !state.chat.length ? `<div class="chat-hello">
        <img class="app-icon" src="icons/icon.svg" alt="">
        <p>Привет! Я Аврора. Пиши мне траты («такси 600»), замеры («вес 81,2»), продажи и клиентов ZK POS и Gain CRM, задачи. Присылай скриншоты экранного времени или чеки и спрашивай совета по деньгам, бизнесу, телу и привычкам.</p>
        <div class="chips center">${SUGGESTIONS.map((s) => `<button class="chip" data-action="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>` : ''}
      <div id="chat-list">${hasKey ? renderHistory() : renderLocal()}</div>
      ${!hasKey && !localLog.length ? `<div class="chips center">${LOCAL_SUGGESTIONS.map((s) => `<button class="chip" data-action="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      <div id="chat-live"></div>
    </div>
    <form class="composer" id="composer">
      <div id="attach-list" class="attach-list">${pending.map((p, i) => `<span class="attach">${p.preview ? `<img src="${p.preview}" alt="">` : icon('paperclip', { size: 14 })} ${esc(p.name)}<button type="button" data-action="unattach" data-i="${i}" aria-label="Убрать">${icon('close', { size: 12 })}</button></span>`).join('')}</div>
      <div class="composer-row">
        <label class="icon-btn attach-btn" aria-label="Прикрепить фото или файл">${icon('paperclip', { size: 20 })}
          <input type="file" id="file-input" accept="image/*,.txt,.json,.csv,.html" multiple hidden></label>
        <textarea id="chat-input" rows="1" placeholder="${busy ? 'Аврора думает…' : 'Сообщение Авроре'}" enterkeyhint="send"></textarea>
        <button class="send-btn" type="submit" id="send-btn" aria-label="${busy ? 'Остановить' : 'Отправить'}">${busy ? icon('stop', { size: 18 }) : icon('send', { size: 20, w: 2.4 })}</button>
      </div>
    </form>
  </div>`;
}

function scrollDown() {
  const el = document.getElementById('chat-scroll');
  if (el) el.scrollTop = el.scrollHeight;
}

async function fileToImageBlock(file) {
  const bmp = await createImageBitmap(file);
  const max = 1568;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  return { block: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } }, preview: dataUrl };
}

/** Экспорт Telegram (result.json) → компактный текст «дата имя: сообщение» */
function telegramJsonToText(raw) {
  try {
    const data = JSON.parse(raw);
    const chats = data.messages ? [data] : (data.chats?.list || []);
    if (!chats.length) return null;
    return chats.map((ch) => `# Чат: ${ch.name || 'без названия'}\n` + (ch.messages || [])
      .filter((m) => m.type === 'message')
      .map((m) => {
        const text = Array.isArray(m.text) ? m.text.map((t) => (typeof t === 'string' ? t : t.text)).join('') : m.text;
        return text ? `${(m.date || '').replace('T', ' ').slice(0, 16)} ${m.from || ''}: ${text}` : null;
      }).filter(Boolean).join('\n')).join('\n\n');
  } catch { return null; }
}

const MAX_FILE_CHARS = 400000;

async function addFiles(files) {
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) {
        const { block, preview } = await fileToImageBlock(f);
        pending.push({ kind: 'image', name: f.name || 'фото', block, preview });
      } else {
        let text = await f.text();
        if (/\.json$/i.test(f.name)) text = telegramJsonToText(text) || text;
        if (text.length > MAX_FILE_CHARS) {
          toast(`Файл «${f.name}» слишком большой (${Math.round(text.length / 1000)} тыс. символов). Экспортируй переписку за более короткий период.`, { ms: 6000 });
          continue;
        }
        pending.push({ kind: 'text', name: f.name, block: { type: 'text', text: `<file name="${f.name.replace(/"/g, '')}">\n${text}\n</file>` } });
      }
    } catch (e) {
      console.error(e);
      toast(`Не удалось прочитать «${f.name}»`);
    }
  }
}

async function send(text, rerender) {
  if (busy) return;
  const t = text.trim();
  if (!t && !pending.length) return;
  if (!state.settings.apiKey) { await sendLocal(t, rerender); return; }
  const blocks = [...pending.map((p) => p.block)];
  if (t) blocks.push({ type: 'text', text: maskCodes(t) }); // одноразовые коды не отправляем
  else blocks.push({ type: 'text', text: pending.some((p) => p.kind === 'image') ? 'Посмотри вложение и сделай, что нужно.' : 'Проанализируй файл.' });
  const userPreview = pending.slice();
  pending = [];
  busy = true;
  controller = new AbortController();
  rerender();

  // Временно показываем сообщение пользователя и «живой» ответ
  const list = document.getElementById('chat-list');
  list.insertAdjacentHTML('beforeend', `<div class="msg user">${userPreview.filter((p) => p.preview).map((p) => `<img class="msg-img" src="${p.preview}" alt="">`).join('')}
    ${userPreview.filter((p) => p.kind === 'text').map((p) => `<span class="file-chip">${icon('paperclip', { size: 14 })} ${esc(p.name)}</span>`).join('')}
    ${t ? `<div class="bubble">${md(maskCodes(t))}</div>` : ''}</div>`);
  const live = document.getElementById('chat-live');
  live.innerHTML = '<div class="msg ai"><div class="bubble typing"><span class="status">думаю…</span><div class="live-text"></div></div></div>';
  const liveText = live.querySelector('.live-text');
  const status = live.querySelector('.status');
  let acc = '';
  scrollDown();

  const res = await runTurn(state.chat, blocks, {
    signal: controller.signal,
    onText(delta) { acc += delta; liveText.innerHTML = md(acc); status.textContent = ''; scrollDown(); },
    onStatus(s) { if (status) status.textContent = s; },
    onToolDone({ label, ok }) {
      live.insertAdjacentHTML('afterbegin', `<div class="msg ai"><div class="action-chip ${ok ? 'ok' : 'err'}"><span>${esc(label)}</span></div></div>`);
      acc = ''; liveText.innerHTML = '';
    },
  });
  busy = false;
  controller = null;
  if (!res.aborted && !res.error) await saveChat(res.messages);
  rerender();
  if (res.error) {
    toast(res.error, { ms: 6000 });
    const input = document.getElementById('chat-input');
    if (input && t) input.value = t;
  }
  if (res.note) toast(res.note, { ms: 5000 });
  scrollDown();
}

export const keepAlive = true; // не перерисовывать чат при каждом изменении данных

export function mount(container, rerender) {
  const form = container.querySelector('#composer');
  const input = container.querySelector('#chat-input');
  const fileInput = container.querySelector('#file-input');
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault(); form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { controller?.abort(); return; }
    const v = input.value; input.value = ''; grow();
    send(v, rerender);
  });
  fileInput.addEventListener('change', async () => {
    await addFiles([...fileInput.files]);
    fileInput.value = '';
    rerender();
  });
  if (state.chat.length) scrollDown();
}

export const actions = {
  suggest: (el, _e, rerender) => send(el.dataset.text, rerender),
  unattach: (el, _e, rerender) => { pending.splice(Number(el.dataset.i), 1); rerender(); },
  undo: async (el, _e, rerender) => {
    const fn = undoRegistry.get(el.dataset.id);
    if (!fn) return;
    await fn();
    undoRegistry.delete(el.dataset.id);
    undone.add(el.dataset.id);
    toast('Действие отменено');
    rerender();
  },
  'ask-claude': () => askClaudeSheet(),
  'local-undo': async (el, _e, rerender) => {
    const m = localLog[Number(el.dataset.i)];
    if (!m?.undo) return;
    await m.undo(); m.undo = null; m.undone = true;
    saveLocal(); toast('Отменено'); rerender();
  },
  'new-chat': async (_el, _e, rerender) => {
    if (!state.settings.apiKey) { localLog = []; saveLocal(); rerender(); return; }
    if (await confirmSheet('Новый диалог?', 'История переписки с Авророй очистится. Все записи (траты, задачи, замеры) останутся.', { ok: 'Очистить', danger: false })) {
      await saveChat([]);
      undoRegistry.clear();
      undone.clear();
      rerender();
    }
  },
};
