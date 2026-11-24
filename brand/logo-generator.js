// Генератор логотипа Авроры в стиле Gain Tech: монолинейные широкие буквы с округлыми углами.
const fs = require('fs');
const out = process.argv[2];
// Буквы в сетке ширина 64, высота 36, радиус 13. Штрихи — stroke.
const W = 64, H = 36, R = 13;
const L = {
  A: `M0 ${H} V${R} Q0 0 ${R} 0 H${W - R} Q${W} 0 ${W} ${R} V${H} M0 22 H${W}`,
  U: `M0 0 V${H - R} Q0 ${H} ${R} ${H} H${W - R} Q${W} ${H} ${W} ${H - R} V0`,
  R: `M0 ${H} V0 H${W - R} Q${W} 0 ${W} ${R - 2} Q${W} 21 ${W - R} 21 H14 M${W - 16} 21 Q${W} 21 ${W} ${H - 4} V${H}`,
  O: `M${R} 0 H${W - R} Q${W} 0 ${W} ${R} V${H - R} Q${W} ${H} ${W - R} ${H} H${R} Q0 ${H} 0 ${H - R} V${R} Q0 0 ${R} 0 Z`,
};
function word(text, { x = 0, y = 0, scale = 1, gap = 22, sw = 6, color = '#fff' } = {}) {
  let cx = 0; let paths = '';
  for (const ch of text) { paths += `<path d="${L[ch]}" transform="translate(${cx} 0)"/>`; cx += W + gap; }
  const width = (cx - gap) * scale;
  return { svg: `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="round">${paths}</g>`, width, height: H * scale };
}
// Волновые «ленты» из тонких линий (как на фоне логотипа Gain Tech)
function ribbon(size, { x0, y0, x1, y1, amp, twist, count = 22, opacity = 0.22, phase = 0 }) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const off = (t - 0.5) * twist;           // разлёт линий
    const k = Math.sin(t * Math.PI);          // яркость к центру ленты
    const c1x = x0 + (x1 - x0) * 0.3, c2x = x0 + (x1 - x0) * 0.7;
    const c1y = y0 - amp + off * 2.6 * Math.cos(phase), c2y = y1 + amp - off * 2.2 * Math.sin(phase + 1.2);
    s += `<path d="M${(x0 + off * 0.3).toFixed(1)} ${(y0 + off).toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${(x1 - off * 0.2).toFixed(1)} ${(y1 - off * 0.6).toFixed(1)}" stroke="#fff" stroke-opacity="${(opacity * (0.35 + 0.65 * k)).toFixed(3)}" stroke-width="${(size / 512 * 1.1).toFixed(2)}" fill="none"/>`;
  }
  return s;
}
function waves(size) {
  return ribbon(size, { x0: -40, y0: size * 0.82, x1: size * 1.08, y1: size * 0.60, amp: size * 0.22, twist: size * 0.16, phase: 0.4 })
    + ribbon(size, { x0: size * 0.55, y0: -30, x1: size * 1.1, y1: size * 0.28, amp: size * 0.10, twist: size * 0.10, count: 14, opacity: 0.16, phase: 1.3 });
}
// Иконка: чёрный фон, монограмма «A», волны
const S = 512;
const mono = (() => {
  const scale = 4.2; const w = W * scale; const h = H * scale;
  return `<g transform="translate(${(S - w) / 2} ${(S - h) / 2 - 10}) scale(${scale})" fill="none" stroke="#fff" stroke-width="${6.6}" stroke-linejoin="round"><path d="${L.A}"/></g>`;
})();
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="#000"/>${waves(S)}${mono}</svg>`;
fs.writeFileSync(out + '/icon.svg', icon);
// Вордмарк AURORA + подпись GAIN TECH
const wm = word('AURORA', { sw: 6 });
const wW = Math.ceil(wm.width); 
const wordmark = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${wW + 8} ${H + 8}">${word('AURORA', { sw: 6, color }).svg}</svg>`;
fs.writeFileSync(out + '/wordmark-white.svg', wordmark('#fff'));
fs.writeFileSync(out + '/wordmark-black.svg', wordmark('#000'));
console.log('ok', wW);
