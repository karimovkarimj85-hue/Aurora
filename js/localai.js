// ИИ прямо на iPhone: открытая модель Qwen работает в браузере через WebGPU (WebLLM).
// Бесплатно, без ключа и без сервера; после первой загрузки работает и без интернета.
// Слабее Claude: подходит для советов и разбора, цифры берёт из сводки Авроры.
import { state, saveSettings } from './store.js';

export const LOCAL_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 1.5B', size: '≈ 1 ГБ', note: 'рекомендую: лучше понимает русский' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 0.5B', size: '≈ 350 МБ', note: 'быстрее и легче, но проще ответы' },
];

let lib = null;
let engine = null;
let engineModel = null;
let loading = null;

const loadLib = async () => (lib ||= await import('../vendor/web-llm-0.2.86.js'));

/** Поддерживает ли устройство WebGPU (iOS 26 и новее в Safari) */
export async function checkSupport() {
  if (!('gpu' in navigator)) return { ok: false, reason: 'Этот браузер не поддерживает WebGPU. Нужен iPhone с iOS 26 или новее (Safari).' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'Видеоускоритель недоступен. Обнови iOS и открой Аврору в Safari.' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Не удалось получить доступ к WebGPU.' };
  }
}

export const currentModel = () => state.settings.localModel || null;
export const isReady = () => !!engine && engineModel === currentModel();

export async function isDownloaded(modelId = currentModel()) {
  if (!modelId) return false;
  try { return await (await loadLib()).hasModelInCache(modelId); } catch { return false; }
}

/**
 * Загрузить модель (первый раз скачивается, дальше берётся из памяти телефона).
 * onProgress(доля 0..1, текст)
 */
export async function ensureEngine(onProgress) {
  const modelId = currentModel();
  if (!modelId) throw new Error('ИИ на телефоне выключен');
  if (engine && engineModel === modelId) return engine;
  if (loading) return loading;
  loading = (async () => {
    const support = await checkSupport();
    if (!support.ok) throw new Error(support.reason);
    const webllm = await loadLib();
    if (engine) { try { await engine.unload(); } catch { /* ок */ } engine = null; }
    const worker = new Worker(new URL('./llm-worker.js', import.meta.url), { type: 'module' });
    engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (r) => onProgress?.(r.progress ?? 0, r.text || ''),
    });
    engineModel = modelId;
    return engine;
  })();
  try { return await loading; } finally { loading = null; }
}

const SYSTEM = `Ты — Аврора, дружелюбный помощник в приложении личных финансов и целей. Отвечай по-русски, коротко и по делу: 2–6 предложений или короткий список.
Опирайся только на данные пользователя из блока «Данные». Не выдумывай цифры. Если данных не хватает — так и скажи.
Советы по деньгам — практичные и безопасные. Советы по здоровью и телу — общие, без медицинских назначений.
Пользователь в Узбекистане, валюта — сум.`;

/**
 * Ответ модели потоком. history — [{role:'user'|'assistant', content}], brief — сводка данных.
 */
export async function ask({ question, history = [], brief = '', onToken, onProgress, signal }) {
  const eng = await ensureEngine(onProgress);
  const messages = [
    { role: 'system', content: `${SYSTEM}\n\nДанные:\n${brief.slice(0, 3500)}` },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];
  const stream = await eng.chat.completions.create({ messages, stream: true, temperature: 0.5, max_tokens: 500 });
  let text = '';
  for await (const chunk of stream) {
    if (signal?.aborted) { try { await eng.interruptGenerate(); } catch { /* ок */ } break; }
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) { text += delta; onToken?.(text); }
  }
  return text.trim();
}

export async function enable(modelId) {
  await saveSettings({ localModel: modelId });
}

export async function disable({ removeFiles = false } = {}) {
  const modelId = currentModel();
  if (engine) { try { await engine.unload(); } catch { /* ок */ } }
  engine = null; engineModel = null;
  if (removeFiles && modelId) { try { await (await loadLib()).deleteModelAllInfoInCache(modelId); } catch { /* ок */ } }
  await saveSettings({ localModel: null });
}
