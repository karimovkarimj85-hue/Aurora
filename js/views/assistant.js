import { state, saveChat } from '../store.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { toast, confirmSheet } from '../ui.js';
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
        ${files.map((b) => `<span class="file-chip">📎 ${esc((b.text.match(/name="([^"]+)"/) || [])[1] || 'файл')}</span>`).join('')}
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
            <span>${ok ? '✓' : '⚠️'} ${esc(ok ? label : (r?.content || label))}</span>
            ${ok && undoRegistry.has(b.id) ? `<button class="link" data-action="undo" data-id="${b.id}">Отменить</button>` : ''}
          </div></div>`;
        }
      }
    }
  }
  return html;
}

export function render() {
  const hasKey = !!state.settings.apiKey;
  return `
  <div class="chat-page">
    <header class="page-head compact">
      <div><h1>Аврора</h1><p class="eyebrow">ИИ-помощник</p></div>
      ${state.chat.length ? `<button class="icon-btn lg tinted" data-action="new-chat" aria-label="Новый диалог">${icon('compose', { size: 20 })}</button>` : ''}
    </header>
    <div class="chat-scroll" id="chat-scroll">
      ${!hasKey ? `<div class="card">
        <h3>Подключи ИИ</h3>
        <p class="muted">Аврора работает на Claude. Нужен личный ключ API: он хранится только на твоём телефоне.</p>
        <ol class="steps">
          <li>Открой <b>platform.claude.com</b> и зарегистрируйся.</li>
          <li>Пополни баланс на $5: этого хватит надолго.</li>
          <li>Раздел <b>API Keys → Create Key</b>, скопируй ключ.</li>
          <li>Вставь его в Настройках Авроры.</li>
        </ol>
        <button class="btn btn-primary btn-block" data-action="nav" data-to="settings">Открыть настройки</button>
      </div>` : ''}
      ${!state.chat.length ? `<div class="chat-hello">
        <img class="app-icon" src="icons/icon.svg" alt="">
        <p>Привет! Я Аврора. Пиши мне траты («такси 600»), замеры («вес 81,2»), продажи и клиентов ZK POS и Gain CRM, задачи. Присылай скриншоты экранного времени или чеки и спрашивай совета по деньгам, бизнесу, телу и привычкам.</p>
        <div class="chips center">${SUGGESTIONS.map((s) => `<button class="chip" data-action="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>` : ''}
      <div id="chat-list">${renderHistory()}</div>
      <div id="chat-live"></div>
    </div>
    <form class="composer" id="composer">
      <div id="attach-list" class="attach-list">${pending.map((p, i) => `<span class="attach">${p.preview ? `<img src="${p.preview}" alt="">` : '📎'} ${esc(p.name)}<button type="button" data-action="unattach" data-i="${i}" aria-label="Убрать">✕</button></span>`).join('')}</div>
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
  if (!state.settings.apiKey) { toast('Сначала добавь ключ API в настройках'); return; }
  const blocks = [...pending.map((p) => p.block)];
  if (t) blocks.push({ type: 'text', text: t });
  else blocks.push({ type: 'text', text: pending.some((p) => p.kind === 'image') ? 'Посмотри вложение и сделай, что нужно.' : 'Проанализируй файл.' });
  const userPreview = pending.slice();
  pending = [];
  busy = true;
  controller = new AbortController();
  rerender();

  // Временно показываем сообщение пользователя и «живой» ответ
  const list = document.getElementById('chat-list');
  list.insertAdjacentHTML('beforeend', `<div class="msg user">${userPreview.filter((p) => p.preview).map((p) => `<img class="msg-img" src="${p.preview}" alt="">`).join('')}
    ${userPreview.filter((p) => p.kind === 'text').map((p) => `<span class="file-chip">📎 ${esc(p.name)}</span>`).join('')}
    ${t ? `<div class="bubble">${md(t)}</div>` : ''}</div>`);
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
      live.insertAdjacentHTML('afterbegin', `<div class="msg ai"><div class="action-chip ${ok ? 'ok' : 'err'}"><span>${ok ? '✓' : '⚠️'} ${esc(label)}</span></div></div>`);
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
  'new-chat': async (_el, _e, rerender) => {
    if (await confirmSheet('Новый диалог?', 'История переписки с Авророй очистится. Все записи (траты, задачи, замеры) останутся.', { ok: 'Очистить', danger: false })) {
      await saveChat([]);
      undoRegistry.clear();
      undone.clear();
      rerender();
    }
  },
};
