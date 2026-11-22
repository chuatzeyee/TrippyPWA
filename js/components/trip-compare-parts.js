// Pieces the comparison screens share (trip-compare-html.js, trip-compare-start-html.js): the two
// identities, the plan cover, the category marks and the drawn motif. HTML strings only: no DOM, no network.
import { attr, cls, esc } from '../views/shared/html.js';
import { icon } from '../views/shared/icons.js';
import { coverFrameHtml, thumbHtml } from '../views/shared/photo-frame.js';
import { formatDateRange } from '../lib/locale.js';

export const SIDE_LABELS = Object.freeze({ mine: 'Your plan', theirs: "Trippy's plan" });
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The name tag of a side: the imported plan in ink, Trippy's with the plane mark of the app bar. */
export const sideTagHtml = (key, { tag = 'span', extra = '' } = {}) => `<${tag} class="cmp-tag cmp-tag--${key}">${icon(key === 'theirs' ? 'plane' : 'file', 16)}<span>${SIDE_LABELS[key]}</span>${extra}</${tag}>`;

// Category marks the shared icon family has no drawing for, on the same 24 px grid and 1.75 px stroke.
const KIND_PATHS = {
  food: '<path d="M7 3.5v6a2 2 0 0 0 2 2v9M5 3.5v5M9 3.5v5M11 3.5v5M17 20.5v-7M17 13.5c-1.7-.6-2.5-2.4-2.5-5 0-2.8 1-5 2.5-5z"/>',
  culture: '<path d="m3.5 9 8.5-5 8.5 5zM5.5 19.5h13M4 19.5h16M7 9.5v7.5M12 9.5v7.5M17 9.5v7.5"/>',
  nature: '<path d="M5 19.5c0-8 4.5-13.5 14-14.5.5 9-4 14.5-12 14.5"/><path d="M5 19.5c2-4.5 5-7.5 9-9.5"/>',
  shopping: '<path d="M5.5 8h13l1 12.5h-15z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
};
const KIND_ICONS = {
  accommodation: 'bed', hotel: 'bed', transport: 'train', transit: 'train', flight: 'plane', sightseeing: 'pin', activity: 'ticket',
  entertainment: 'ticket', nightlife: 'moon', relaxation: 'sun', wellness: 'sun', outdoor: 'sun',
};
const KIND_ALIASES = { restaurant: 'food', cafe: 'food', dining: 'food', museum: 'culture', history: 'culture', art: 'culture', park: 'nature', market: 'shopping' };

/** The mark of a stop's category, a pin when it has none of its own. Decorative: the word stands beside it. */
export function kindIconHtml(kind, size = 16) {
  const key = KIND_ALIASES[kind] ?? kind;
  if (Object.hasOwn(KIND_PATHS, key)) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${KIND_PATHS[key]}</svg>`;
  }
  return icon(KIND_ICONS[key] ?? 'pin', size);
}

/** "13 to 26 Jan 2027", or what to say when the plan has no dates. */
export const datesText = (plan) => (plan?.start ? formatDateRange(plan.start, plan.end || '') : 'No dates yet');

/**
 * The cover of a plan in the app's frame, with its credit; the placeholder names the place.
 * @param {object} plan  planOf() of js/lib/trip-compare.js
 * @param {{ cls?: any, over?: string, priority?: boolean, sizes?: string }} [opts] over is trusted markup
 */
export function planCoverHtml(plan, { cls: extra, over = '', priority = false, sizes = '(min-width: 768px) 600px, 100vw' } = {}) {
  return coverFrameHtml(plan?.cover ?? null, {
    ratio: 'free', cls: cls('cmp-cover', extra), name: plan?.destination || plan?.title || '', alt: '', scrim: Boolean(over), over, priority, sizes, creditAt: 'top',
  });
}

/** The small photo of a stop: the trip page's thumb and its placeholder, lazy loaded. */
export const stopThumbHtml = (stop) => thumbHtml(stop.photo ? { src: stop.photo, alt: '' } : null, { size: 56, cls: 'cmp-thumb' });

/**
 * Two plans joined by a dotted route: the imported one in ink, Trippy's in terracotta. Decorative.
 * @param {{ cls?: any }} [opts]
 */
export function motifHtml({ cls: extra } = {}) {
  const card = (x, ink) => `<g style="stroke:var(${ink})"><rect x="${x}" y="6" width="44" height="52" rx="7"/><path d="M${x + 9} 20h26M${x + 9} 30h18M${x + 9} 40h22"/></g>`;
  return `<svg class="${cls('cmp-motif', extra)}" viewBox="0 0 148 64" width="148" height="64" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    ${card(2, '--ink-secondary')}${card(102, '--terracotta')}
    <path d="M50 38c8-16 40-16 48 0" stroke-dasharray="0.5 5.5" style="stroke:var(--terracotta)"/>
    <circle cx="50" cy="38" r="2.5" style="fill:var(--ink-secondary)"/><circle cx="98" cy="38" r="2.5" style="fill:var(--terracotta)"/>
  </svg>`;
}

/** Two rings that overlap: the mark of a stop both plans have. */
export const bothIconHtml = (size = 14) => `<svg class="ui-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true" focusable="false"><circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/></svg>`;

/** A note above the page body: offline, or a plain notice. */
export const noteHtml = (text, kind = 'info') => (text ? `<p class="cmp-note" role="${kind === 'warning' ? 'alert' : 'status'}">${icon(kind === 'offline' ? 'offline' : kind, 18)}<span>${esc(text)}</span></p>` : '');

/** Grey bars standing in for text that is on its way. */
export const skeletonHtml = (lines = 3, extra = '') => `<span class="${cls('cmp-skel', extra)}" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<span class="cmp-skel-line" style="--w:${[72, 54, 86, 61, 78][i % 5]}%"></span>`).join('')}</span>`;

export { attr, cls, esc, icon };
