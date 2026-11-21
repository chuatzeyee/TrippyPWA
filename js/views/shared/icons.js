// One line-icon family as SVG strings (blueprint 1.3): a 24 px grid, round 1.75 px strokes, no fills,
// coloured by currentColor. Every icon is decorative: the text beside it carries the meaning. Owner: F5.

const PATHS = {
  plane: '<path d="M12 2.5c.9 0 1.5.8 1.5 1.8v4.5l7 4.4v2l-7-2.2v4.3l2 1.5v1.7L12 19.5l-3.5 1v-1.7l2-1.5V13l-7 2.2v-2l7-4.4V4.3c0-1 .6-1.8 1.5-1.8z"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4M9 14.5h.01M15 14.5h.01"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="2.5"/><path d="M4 11h16M7.5 17v2.5M16.5 17v2.5M8 14h.01M16 14h.01"/>',
  ferry: '<path d="M3 17c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/><path d="M5 14 4 10h16l-1 4M7 10V6h10v4M12 6V3"/>',
  car: '<path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6.5 17v2M17.5 17v2M7 14h.01M17 14h.01"/>',
  taxi: '<path d="M10 5V3h4v2M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6.5 17v2M17.5 17v2M7 14h.01M17 14h.01"/>',
  walk: '<circle cx="13" cy="4.5" r="1.5"/><path d="m9 21 2.5-6-2-3 1-4 3 3 3 1M11.5 15l3 2.5V21M10.5 8 7.5 9.5 7 12.5"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.5 3 3 5.5-6"/>',
  ring: '<circle cx="12" cy="12" r="8.5"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.25h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5M15.5 5.8a3 3 0 0 1 0 5.4M17 14.8c2 .6 3.2 2.2 3.5 4.7"/>',
  bed: '<path d="M3 18.5V6M3 14.5h18v4M21 14.5v-2a3 3 0 0 0-3-3h-6.5v5"/><circle cx="7.25" cy="11" r="1.75"/>',
  passport: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="10" r="3"/><path d="M9 16.5h6"/>',
  ticket: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.25"/>',
  map: '<path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="m4.5 17.5 5-4.5 3.5 3 2.5-2 4 3.5"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
  share: '<circle cx="6.5" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.7 10.8 6.1-3.5M8.7 13.2l6.1 3.5"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12M10 11v5.5M14 11v5.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  offline: '<path d="M7 18.5a4 4 0 0 1-.6-7.95M10 7.2a5.5 5.5 0 0 1 7.4 4.3 3.5 3.5 0 0 1 1.7 6.3M4 4l16 16"/>',
  expand: '<path d="M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5"/>',
  back: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  cloud: '<path d="M7 18.5a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.9 1 3.5 3.5 0 0 1 .1 6.97z"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20v-11.5H6.5A2.5 2.5 0 0 1 4 7.5z"/><path d="M16.5 13.75h.01"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  device: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  undo: '<path d="M8.5 5 4 9.5 8.5 14"/><path d="M4 9.5h10a5.5 5.5 0 0 1 0 11h-3"/>',
};

/** Every icon name, for the gallery and the tests. */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/**
 * @param {string} name  one of ICON_NAMES
 * @param {number} [size] width and height in px, 20 by default
 * @returns {string} the SVG, or '' for a name this family does not have
 */
export function icon(name, size = 20) {
  if (typeof name !== 'string' || !Object.hasOwn(PATHS, name)) return '';
  const px = Number.isFinite(size) && size >= 8 && size <= 96 ? Math.round(size) : 20;
  return `<svg class="ui-icon" viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
