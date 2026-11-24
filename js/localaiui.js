// Экран «ИИ на телефоне»: выбор модели, проверка поддержки, загрузка с прогрессом.
import { openSheet, toast } from './ui.js';
import { esc } from './util.js';
import { icon } from './icons.js';
import { LOCAL_MODELS, checkSupport, currentModel, enable, disable, ensureEngine, isDownloaded, isReady } from './localai.js';

// Общее состояние загрузки, чтобы прогресс был виден и в чате, и в настройках
export const download = { active: false, progress: 0, text: '', error: '' };
const listeners = new Set();
export const onDownload = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => { try { fn(download); } catch { /* ок */ } });

export async function startDownload() {
  if (download.active || isReady()) return;
  Object.assign(download, { active: true, progress: 0, text: 'Готовлю загрузку…', error: '' });
  notify();
  try {
    await ensureEngine((p, text) => { download.progress = p; download.text = text; notify(); });
    Object.assign(download, { active: false, progress: 1, text: 'Готово' });
    toast('ИИ на телефоне готов');
  } catch (e) {
    Object.assign(download, { active: false, error: e.message || 'Не удалось загрузить модель' });
    toast(download.error, { ms: 6000 });
  }
  notify();
}

export const progressHtml = () => (download.active
  ? `<div class="dl"><div class="bar"><span style="width:${Math.round(download.progress * 100)}%"></span></div>
      <p class="muted small">${Math.round(download.progress * 100)}% · ${esc(friendlyText(download.text))}</p></div>`
  : download.error ? `<p class="small neg">${esc(download.error)}</p>` : '');

function friendlyText(t) {
  if (/fetch|download|Loading model from cache/i.test(t)) return /cache/i.test(t) ? 'Загружаю из памяти телефона' : 'Скачиваю модель (лучше по Wi-Fi)';
  if (/shader|compil|GPU/i.test(t)) return 'Подготавливаю видеоускоритель';
  return 'Загрузка';
}

/** Шторка настройки */
export async function localAiSheet({ onChange } = {}) {
  const support = await checkSupport();
  const cur = currentModel();
  const downloaded = cur ? await isDownloaded(cur) : false;
  let off = () => {};
  const close = openSheet({
    title: 'ИИ на телефоне',
    body: `<div class="form">
      <section class="card local-ai-hero">
        ${icon('sparkles', { size: 28, w: 1.8 })}
        <p><b>Бесплатно, без ключа и без сервера.</b> Открытая модель Qwen работает прямо на твоём iPhone: отвечает на вопросы, даёт советы по деньгам, бизнесу и целям, опираясь на данные Авроры. Данные никуда не уходят.</p>
      </section>
      <ul class="steps">
        <li>Модель скачивается один раз (лучше по Wi-Fi), дальше работает даже без интернета.</li>
        <li>Она заметно слабее Claude: может ошибаться, читать фото пока не умеет. Траты, замеры и задачи по-прежнему записывает умный ввод.</li>
        <li>Нужен iPhone с iOS 26 или новее (Safari).</li>
      </ul>
      ${support.ok ? '' : `<p class="small neg">${esc(support.reason)}</p>`}
      <div class="field"><span>Модель</span>
        <div class="list card">${LOCAL_MODELS.map((m, i) => `<label class="row-item model-opt">
          <input type="radio" name="model" value="${m.id}" ${(cur ? cur === m.id : i === 0) ? 'checked' : ''}>
          <div class="grow"><span class="row-title">${esc(m.name)} <span class="muted small">${esc(m.size)}</span></span><span class="row-sub">${esc(m.note)}</span></div></label>`).join('')}</div>
      </div>
      <div data-progress>${progressHtml()}</div>
      ${cur && downloaded ? '<p class="hint">Модель уже на телефоне.</p>' : ''}
      <button class="btn btn-primary btn-block" type="button" data-enable ${support.ok ? '' : 'disabled'}>${cur ? (isReady() ? 'Готово' : 'Загрузить модель') : 'Включить и скачать'}</button>
      ${cur ? '<button class="btn btn-ghost-danger btn-block" type="button" data-off>Выключить и удалить модель</button>' : ''}
    </div>`,
    onMount(el) {
      const box = el.querySelector('[data-progress]');
      off = onDownload(() => { box.innerHTML = progressHtml(); });
      el.querySelector('[data-enable]').addEventListener('click', async () => {
        const model = el.querySelector('input[name=model]:checked')?.value || LOCAL_MODELS[0].id;
        if (isReady() && model === cur) { close(); return; }
        await enable(model);
        onChange?.();
        startDownload().then(() => onChange?.());
      });
      el.querySelector('[data-off]')?.addEventListener('click', async () => {
        await disable({ removeFiles: true });
        toast('ИИ на телефоне выключен, модель удалена');
        onChange?.(); close();
      });
    },
    onClose: () => off(),
  });
}
