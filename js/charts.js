// Простые графики на SVG: одна серия, тонкие линии, подписи текстовыми цветами.
import { esc, num, humanDate } from './util.js';

/**
 * Линейный график одной метрики (вес, % жира…).
 * points: [{date, value}], target — пунктирная линия цели.
 */
export function lineChart(points, { unit = '', target = null, height = 150 } = {}) {
  if (points.length < 2) {
    return `<div class="chart-empty muted">Добавь хотя бы два замера — здесь появится график</div>`;
  }
  const W = 320; const H = height; const P = { l: 34, r: 12, t: 12, b: 22 };
  const vals = points.map((p) => p.value).concat(target != null ? [target] : []);
  let min = Math.min(...vals); let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12; min -= pad; max += pad;
  const x = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z`;
  const ticks = [max - pad, (max + min) / 2, min + pad];
  const last = points[points.length - 1];
  const showDots = points.length <= 24;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График: последнее значение ${num(last.value, true)} ${esc(unit)}">
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
      <text x="${P.l - 6}" y="${y(t)}" dy=".32em" text-anchor="end" class="axis">${num(t, true)}</text>`).join('')}
    ${target != null ? `<line x1="${P.l}" x2="${W - P.r}" y1="${y(target)}" y2="${y(target)}" class="target"/>
      <text x="${W - P.r}" y="${y(target) - 5}" text-anchor="end" class="axis">цель ${num(target, true)}</text>` : ''}
    <path d="${area}" class="area"/>
    <path d="${d}" class="line"/>
    ${points.map((p, i) => `<g class="pt">
        <circle cx="${x(i)}" cy="${y(p.value)}" r="12" class="hit"><title>${esc(humanDate(p.date))}: ${num(p.value, true)} ${esc(unit)}</title></circle>
        ${showDots || i === points.length - 1 ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 4.5 : 3}" class="dot"/>` : ''}
      </g>`).join('')}
    <text x="${P.l}" y="${H - 6}" class="axis">${esc(humanDate(points[0].date))}</text>
    <text x="${W - P.r}" y="${H - 6}" text-anchor="end" class="axis">${esc(humanDate(last.date))}</text>
  </svg>`;
}

/** Горизонтальные полосы (расходы по категориям). Один цвет — это величина, а не категории. */
export function hbars(rows, fmt) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.value));
  return `<ul class="hbars">${rows.map((r) => `
    <li title="${esc(r.label)}: ${esc(fmt(r.value))}">
      <div class="hbar-head"><span>${esc(r.label)}</span><span class="hbar-val">${esc(fmt(r.value))}</span></div>
      <div class="hbar-track"><span style="width:${Math.max(2, (r.value / max) * 100)}%"></span></div>
    </li>`).join('')}</ul>`;
}

/** Мини-столбики по дням (экранное время, траты по дням) */
export function columns(rows, { fmt = (v) => v, height = 110 } = {}) {
  if (!rows.length) return '';
  const W = 320; const H = height; const P = { t: 8, b: 20 };
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bw = (W / rows.length) * 0.62;
  const step = W / rows.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Столбчатый график">
    <line x1="0" x2="${W}" y1="${H - P.b}" y2="${H - P.b}" class="grid"/>
    ${rows.map((r, i) => {
      const h = (r.value / max) * (H - P.t - P.b);
      const x = i * step + (step - bw) / 2;
      return `<g><rect x="${x}" y="${H - P.b - h}" width="${bw}" height="${Math.max(h, r.value ? 2 : 0)}" rx="4" class="col"><title>${esc(r.label)}: ${esc(fmt(r.value))}</title></rect>
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(r.short ?? r.label)}</text></g>`;
    }).join('')}
  </svg>`;
}
