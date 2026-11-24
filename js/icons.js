// Линейные иконки в духе SF Symbols (stroke = currentColor).
const P = {
  today: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5"/>',
  wallet: '<rect x="3" y="5.5" width="18" height="14" rx="3.2"/><path d="M3 9.5h13.5a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H14"/><circle cx="15.6" cy="12" r=".9" fill="currentColor" stroke="none"/><path d="M6 5.5l9-2.6a1.6 1.6 0 0 1 2 1.5v1.1"/>',
  briefcase: '<rect x="3" y="7" width="18" height="12.5" rx="3"/><path d="M8.5 7V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6V7M3 12.5h18M10.5 12.5v1.6h3v-1.6"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  sparkles: '<path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z"/><path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.3 2.4 1.3 2.4-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6L6.1 12 4.8 9.6l2.3-1.6.6-2.7 2.7.6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M14.5 5L7.5 12l7 7"/>',
  chevron: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checklist: '<path d="M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5 3-3M4 18.5L5.5 20l3-3M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9.5a5 5 0 0 1 8 0M12 9.5l1.4-1.8"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  people: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.6 14.2a6.2 6.2 0 0 1 3.6 5.3"/>',
  funnel: '<path d="M4 5h16l-6.2 7.6V19l-3.6-1.8v-4.6z"/>',
  repeat: '<path d="M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  chart: '<path d="M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-3.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  phone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2.1 2.1 0 0 1-2.3 2.1A16.6 16.6 0 0 1 4.5 5.8a2.1 2.1 0 0 1 2.1-2.3z"/>',
  paperclip: '<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>',
  send: '<path d="M12 19V5.5M6.5 11L12 5.5 17.5 11"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  compose: '<path d="M12 4.5H7a3 3 0 0 0-3 3V17a3 3 0 0 0 3 3h9.5a3 3 0 0 0 3-3v-5"/><path d="M17.8 3.7a1.9 1.9 0 0 1 2.7 2.7L12.6 14.3 9 15.2l.9-3.6z"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4"/>',
  lightbulb: '<path d="M9 18.5h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.4-2.4-5.6-3.6-8.5-.5 2-1.6 3.1-2.9 3.6.3-2.8-.9-5.4-3.5-6.6.2 3.4-3 5.8-3 10.8A6.5 6.5 0 0 0 12 21z"/>',
  cart: '<path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.4"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5"/>',
  car: '<path d="M4.5 16.5v-4l1.8-5A2 2 0 0 1 8.2 6h7.6a2 2 0 0 1 1.9 1.5l1.8 5v4"/><rect x="3.5" y="12.5" width="17" height="5" rx="1.5"/><path d="M6 17.5V20M18 17.5V20"/><circle cx="7.5" cy="15" r=".8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="15" r=".8" fill="currentColor" stroke="none"/>',
  house: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
  bolt: '<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  shirt: '<path d="M9 4l3 2 3-2 5 3-2 4-2-1v10H8V10l-2 1-2-4z"/>',
  game: '<rect x="2.5" y="7.5" width="19" height="10" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13.8" r=".9" fill="currentColor" stroke="none"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S9.5 9 12 9zm0 0c1.5-3.5 5.5-4 5.5-1.5S14.5 9 12 9z"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  hammer: '<path d="M14 4.5l5.5 5.5-2 2L12 6.5zM12.8 7.8L4 16.6a1.9 1.9 0 0 0 2.7 2.7l8.8-8.8"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7z"/><path d="M14.7 6.3a4 4 0 0 1 5-2.2l-2.6 2.6.4 2.2 2.2.4 2.6-2.6"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1zM7 15l1.5 5h2.5L9.5 15.5M18 9.5a3.5 3.5 0 0 1 0 5"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
  building: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15M10.5 20.5v-3h3v3"/>',
  bank: '<path d="M3.5 9L12 4l8.5 5zM5 9.5v7M9.5 9.5v7M14.5 9.5v7M19 9.5v7M3.5 19.5h17"/>',
  truck: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4"/>',
  banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  creditcard: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  piggy: '<path d="M5 11.5a6.5 5.5 0 0 1 11.5-3.4l2.5-1.1v3.5a5 5 0 0 1 1 1.8h1.5v3H20a6 6 0 0 1-2.5 2.6V20h-3v-1.3a8 8 0 0 1-3 0V20h-3v-1.9A5.3 5.3 0 0 1 5 13.5z"/><circle cx="15.5" cy="11.3" r=".8" fill="currentColor" stroke="none"/><path d="M9.5 7.5h3"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
  plane: '<path d="M10.5 13.5L3 11l1.3-1.6 7.7.6 4.7-5.2a1.8 1.8 0 0 1 2.6 2.6L14.1 12.1l.6 7.7L13 21l-2.5-7.5z"/>',
  graduation: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4M21.5 9.5v5"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.3A3 3 0 0 0 7 17.5a2.5 2.5 0 0 0 5 .5V6.5a2 2 0 0 0-3-2zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.3 3 3 0 0 1-2.5 4.7 2.5 2.5 0 0 1-5 .5V6.5a2 2 0 0 1 3-2z"/>',
  figure: '<circle cx="12" cy="4.8" r="1.8"/><path d="M6 9l6 1.5L18 9M12 10.5V15l-3 5.5M12 15l3 5.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  warning: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pencil: '<path d="M15.5 4.5l4 4L8 20H4v-4z"/><path d="M13 7l4 4"/>',
  trend: '<path d="M3.5 17l6-6 4 4 7-7.5"/><path d="M15 7.5h5.5V13"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  message: '<path d="M4 5.5h16v11H9l-5 4z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5v-11M7 9l5-5 5 5M4.5 19.5h15"/>',
  phoneapp: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  inbox: '<path d="M3.5 13.5L6 5.5h12l2.5 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor" stroke="none"/>',
  percent: '<path d="M18.5 5.5l-13 13"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
};

// Иконки категорий, целей, счетов и копилок
export const CAT_ICON = {
  food: 'cart', cafe: 'cup', transport: 'car', home: 'house', health: 'heart', sport_food: 'bolt', learning: 'book',
  clothes: 'shirt', fun: 'game', subs: 'phoneapp', gifts: 'gift', other: 'box', salary: 'briefcase', side: 'hammer',
  gift_in: 'gift', other_in: 'plus', loan: 'bank', p2p_out: 'repeat', p2p_in: 'repeat', biz_sale: 'receipt', biz_sub: 'repeat', biz_impl: 'wrench', biz_service: 'gear',
  biz_in_other: 'plus', biz_purchase: 'box', biz_salary: 'people', biz_ads: 'megaphone', biz_soft: 'laptop',
  biz_rent: 'building', biz_tax: 'bank', biz_delivery: 'truck', biz_other: 'paperclip',
};
export const catIcon = (cat) => cat?.icon || CAT_ICON[cat?.id] || 'tag';
export const GOAL_ICON = { body: 'dumbbell', money: 'house', mind: 'brain', custom: 'target' };
export const ACC_ICON = { cash: 'banknote', card: 'creditcard', savings: 'bank' };
export const PIGGY_ICONS = ['piggy', 'house', 'car', 'plane', 'shield', 'graduation', 'dumbbell', 'gift', 'laptop', 'heart'];
const PIGGY_LEGACY = { '🐷': 'piggy', '🏠': 'house', '🚗': 'car', '✈️': 'plane', '🛟': 'shield', '🎓': 'graduation', '💪': 'dumbbell', '🎁': 'gift', '📱': 'phoneapp', '💍': 'heart' };
export const piggyIcon = (p) => p?.icon || PIGGY_LEGACY[p?.emoji] || 'piggy';

/** Квадратная плашка с иконкой (как в «Настройках» iOS) */
export const tile = (name, cls = '') => `<span class="row-icon ${cls}">${icon(name, { size: 18 })}</span>`;

/** SVG-иконка. size в px, w — толщина линии */
export function icon(name, { size = 22, w = 1.8, cls = '' } = {}) {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** Вордмарк AURORA в стиле Gain Tech (цвет = currentColor) */
export const wordmark = (width = 200) => `<svg class="wordmark" width="${width}" viewBox="-4 -4 502 44" role="img" aria-label="Aurora"><g transform="translate(0 0) scale(1)" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="butt" stroke-linejoin="round"><path d="M0 36 V13 Q0 0 13 0 H51 Q64 0 64 13 V36 M0 22 H64" transform="translate(0 0)"/><path d="M0 0 V23 Q0 36 13 36 H51 Q64 36 64 23 V0" transform="translate(86 0)"/><path d="M0 36 V0 H51 Q64 0 64 11 Q64 21 51 21 H14 M48 21 Q64 21 64 32 V36" transform="translate(172 0)"/><path d="M13 0 H51 Q64 0 64 13 V23 Q64 36 51 36 H13 Q0 36 0 23 V13 Q0 0 13 0 Z" transform="translate(258 0)"/><path d="M0 36 V0 H51 Q64 0 64 11 Q64 21 51 21 H14 M48 21 Q64 21 64 32 V36" transform="translate(344 0)"/><path d="M0 36 V13 Q0 0 13 0 H51 Q64 0 64 13 V36 M0 22 H64" transform="translate(430 0)"/></g></svg>`;
