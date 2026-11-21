// Small builders the Atlas renderers share: the three stats, the legend, the plan and import buttons,
// flags, and the cover with its text laid over the photo. Every value is escaped here. Owner: VC.
import { button, cls, esc, flagChip, safeSrc } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { coverFrameHtml, creditChipHtml } from '../shared/photo-frame.js';
import { numberText } from './words.js';

const list = (value) => (Array.isArray(value) ? value : []);
const whole = (n) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/** The class of an element that plays the entry motion: only on a first render (ViewCtx.animate). */
export const enterClass = (ctx) => (ctx?.animate ? 'atl-enter' : '');

/** A day colour for a plan's placeholder, the same every time: 1 to 7 from its id. */
export function toneOf(id) {
  const sum = [...String(id ?? '')].reduce((total, ch) => total + ch.charCodeAt(0), 0);
  return (sum % 7) + 1;
}

/** The name a placeholder shows: the first place of the plan, else its title. */
export const placeName = (card) => String(list(card?.places)[0]?.name || card?.title || '');

/** Up to three flags of a plan. */
export function flagsHtml(flags, { size = 20, max = 3 } = {}) {
  const chips = list(flags).slice(0, max).map((code) => flagChip(code, { size })).join('');
  return chips ? `<span class="atl-flags">${chips}</span>` : '';
}

/** The longest last word that is kept whole with the flags; a longer one wraps as it likes. */
const TIED_WORD_MAX = 16;

/**
 * A title followed by its flags, with the flags tied to the last word of the title, so they never
 * wrap onto a line of their own.
 * @param {string} title  text, escaped here
 * @param {string} flags  flagsHtml() output, trusted markup, or ''
 * @returns {string} 'Geneva, Zurich &amp; <span class="atl-nb">Basel<span class="atl-flags"></span></span>'
 */
export function titleWithFlags(title, flags) {
  const words = String(title ?? '').trim();
  if (!flags) return esc(words);
  const cut = words.lastIndexOf(' ');
  const last = words.slice(cut + 1);
  if (!last || last.length > TIED_WORD_MAX) return `${esc(words)} ${flags}`;
  return `${esc(words.slice(0, cut + 1))}<span class="atl-nb">${esc(last)}${flags}</span>`;
}

/** The three stats in words: plans, countries, days planned. Plans, never trips taken. */
export function statWords(stats) {
  const [plans, countries, days] = [whole(stats?.trips), whole(stats?.countries), whole(stats?.daysPlanned)];
  return [
    [numberText(plans), plans === 1 ? 'plan' : 'plans'],
    [numberText(countries), countries === 1 ? 'country' : 'countries'],
    [numberText(days), days === 1 ? 'day planned' : 'days planned'],
  ];
}

/** "11 plans, 9 countries, 87 days planned", for an accessible name. */
export const statsLine = (stats) => statWords(stats).map(([count, words]) => `${count} ${words}`).join(', ');

/**
 * The three stats. A description list by default; `inline` gives spans, for inside a link.
 * @param {import('../contract.js').TravelStats} stats
 * @param {{ region?: boolean, inline?: boolean, cls?: any }} [opts] region adds data-region="stats"
 */
export function statsHtml(stats, { region = false, inline = false, cls: extra } = {}) {
  const classes = cls('atl-stats', extra);
  if (inline) return `<span class="${classes}">${statWords(stats).map(([count, words]) => `<span class="atl-stat"><b>${esc(count)}</b> ${words}</span>`).join('')}</span>`;
  return `<dl class="${classes}"${region ? ' data-region="stats"' : ''}>${statWords(stats).map(([count, words]) => `<div class="atl-stat"><dd>${esc(count)}</dd><dt>${words}</dt></div>`).join('')}</dl>`;
}

/** What the pins mean. */
export function legendHtml() {
  const row = (kind, label) => `<li><i class="atl-lg atl-lg--${kind}"></i>${label}</li>`;
  return `<ul class="atl-legend">${row('live', 'Happening now')}${row('up', 'Upcoming')}${row('past', 'Past')}${row('home', 'Home')}</ul>`;
}

/**
 * "Plan a trip" and "Import a trip". `where` keeps the focus keys of two rows on one page apart.
 * @param {{ where?: string, cls?: any, solid?: boolean }} [opts] solid: Plan a trip as the solid button
 */
export function planButtonsHtml({ where = '', cls: extra, solid = true } = {}) {
  const key = (name) => (where ? `${name}-${where}` : name);
  const plan = button('Plan a trip', { action: 'new-trip', focusKey: key('new-trip'), cls: cls('ui-btn', { 'ui-btn--primary': solid }, 'atl-plan'), html: `${icon('plus', 18)}<span>Plan a trip</span>` });
  const bring = button('Import a trip', { action: 'import-trip', focusKey: key('import-trip'), cls: 'ui-btn atl-import', html: `${icon('import', 18)}<span>Import a trip</span>` });
  return `<p class="${cls('atl-acts', extra)}">${plan}${bring}</p>`;
}

/**
 * A cover with text on it: the photo frame fills the box, and the text sits in two rows of its own
 * beside the frame (not inside it), so a frame that is carried over a re-render never carries old
 * words. The credit chip joins the top row, where a long title cannot reach it.
 * @param {import('../contract.js').CoverModel} cover
 * @param {{ cls?: any, top?: string, over?: string, frame?: object }} [opts] top and over are trusted
 *   markup; frame is passed to coverFrameHtml() (priority, animate, carry, name, flag, tone, sizes)
 */
export function coverBlockHtml(cover, { cls: extra, top = '', over = '', frame = {} } = {}) {
  const hasPhoto = cover?.kind !== 'none' && safeSrc(cover?.src) !== '';
  const chip = hasPhoto ? creditChipHtml(cover.credit) : '';
  return `<div class="${cls('atl-cover', extra)}">
    ${coverFrameHtml(cover, { ratio: 'free', credit: false, cls: 'atl-cover-ph', ...frame })}
    <div class="atl-cover-top">${top}${chip ? `<span class="atl-cover-credit">${chip}</span>` : ''}</div>
    <div class="atl-cover-over">${over}</div>
  </div>`;
}
