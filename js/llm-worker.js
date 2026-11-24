// Отдельный поток для ИИ на телефоне, чтобы интерфейс не подвисал во время ответа.
import { WebWorkerMLCEngineHandler } from '../vendor/web-llm-0.2.86.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
