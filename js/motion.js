// Физика движения по Apple «Designing Fluid Interfaces»: пружины, проекция импульса, «резинка».
// Пружина задаётся как у Apple: damping (1 = без перелёта) и response (скорость, сек).

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Интерруптируемая пружина. Стартует с текущего значения и скорости.
 * @returns {{stop:Function, value:number, velocity:number}}
 */
export function spring({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onDone }) {
  const omega = (2 * Math.PI) / response;
  const k = omega * omega;
  const c = 2 * damping * omega;
  let x = from; let v = velocity; let raf = 0; let last = performance.now();
  const state = {
    stop() { cancelAnimationFrame(raf); },
    get value() { return x; },
    get velocity() { return v; },
  };
  function step(now) {
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    for (let i = 0; i < 4; i++) { // полушаговая интеграция для устойчивости
      const h = dt / 4;
      const a = -k * (x - to) - c * v;
      v += a * h; x += v * h;
    }
    onUpdate(x);
    if (Math.abs(v) < 2 && Math.abs(x - to) < 0.5) { x = to; v = 0; onUpdate(to); onDone?.(); return; }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return state;
}

/** Где остановится жест по инерции (функция проекции Apple) */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Прогрессивное сопротивление за границей */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Скорость по истории последних точек указателя (px/s) */
export function velocityFrom(history) {
  const now = history[history.length - 1];
  let i = history.length - 1;
  while (i > 0 && now.t - history[i - 1].t < 90) i--;
  const first = history[i];
  const dt = (now.t - first.t) / 1000;
  return dt > 0 ? (now.y - first.y) / dt : 0;
}
