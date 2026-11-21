// Markup pieces the Concierge renderers share. Every value is escaped here or by the shared builders.
// Owner: VB.
import { attr, button, cls, esc, flagChip, visuallyHidden } from '../shared/html.js';
import { icon } from '../shared/icons.js';
import { creditChipHtml } from '../shared/photo-frame.js';
import { conditionPhrase } from '../shared/day-index.js';
import { costLine } from './words.js';

const MAX_ENTER_STEP = 6;

/** The classes of a block that plays the entry motion: on a first render only, never with reduced motion. */
export const enter = (ctx, step = 0) => (ctx?.animate && !ctx?.reducedMotion ? `con-enter con-enter--${Math.min(MAX_ENTER_STEP, Math.max(0, step))}` : '');

/** Text that only holds a place open until late data arrives: unseen and unspoken. */
export const ghost = (text) => `<span class="con-ghost" aria-hidden="true">${esc(text)}</span>`;

/** The first flag of a plan, decorative: the title beside it names the place. */
export const flagOf = (flags, size = 22) => flagChip(Array.isArray(flags) ? flags[0] : '', { size });

/**
 * A section head: the serif title, an optional count and one plain sentence. The count is a figure for
 * the eye only (unspoken, and a space away from the title), so the heading and the section it names
 * read as words: "Upcoming", never "Upcoming3". `countText` says it to a screen reader instead.
 * @param {{ id: string, title: string, count?: number|null, countText?: string, line?: string, key?: string, lineHtml?: string }} head
 *   key adds data-key, for a head that is a keyed child of a region; lineHtml is trusted markup for the
 *   sentence; countText is the count in words ("3 plans"), read ahead of the sentence and not shown
 * @returns {string}
 */
export function secHead({ id, title, count = null, countText = '', line = '', key = '', lineHtml = '' }) {
  const n = count === null ? '' : ` <span class="con-n" aria-hidden="true">${esc(count)}</span>`;
  const spoken = count !== null && countText ? `${visuallyHidden(`${countText}.`)} ` : '';
  const say = `${spoken}${lineHtml || esc(line)}`;
  return `<header class="con-sec-head"${attr('data-key', key || null)}><h2 class="con-h2"${attr('id', id)}>${esc(title)}${n}</h2>${say ? `<p class="con-sec-line">${say}</p>` : ''}</header>`;
}

/**
 * The credit chip in its own corner box, top right of the photo it is laid over. The chip keeps the
 * shared markup and its 44 px link box; only the box it hangs in is the view's.
 * @param {import('../contract.js').CoverModel|null} cover
 */
export function creditSlot(cover) {
  const chip = cover && cover.kind !== 'none' && cover.src && cover.credit ? creditChipHtml(cover.credit) : '';
  return chip ? `<span class="con-credit">${chip}</span>` : '';
}

/** "Shared with you. You can view it." for a plan someone else owns; '' for the user's own. */
export function sharedLine(card) {
  if (!card?.shared) return '';
  return `<p class="con-shared">${icon('people', 16)}<span>Shared with you. You can ${card.role === 'editor' ? 'edit' : 'view'} it.</span></p>`;
}

/** The cost of a plan on one line, '' when there is none. `short` leaves the second currency out. */
export function costHtml(cost, extra = '', { short = false } = {}) {
  const line = costLine(cost, { short });
  return line ? `<p class="${cls('con-cost', extra)}">${esc(line)}</p>` : '';
}

/** "10 to 24°C, clear": a typical range with its condition spelled out (ruling R30). */
export function weatherWords(weather) {
  const range = String(weather?.range ?? '').trim();
  const condition = conditionPhrase(weather?.condition);
  return range && condition ? `${range}, ${condition}` : range || condition;
}

/** One stop: its time in the mono face, then its title. */
export const stopHtml = (stop) => `${stop.time ? `<span class="con-time">${esc(stop.time)}</span> ` : ''}${esc(stop.title)}`;

/** One row of a definition list: a quiet label and its value (trusted markup). */
export const factRow = (label, valueHtml) => `<div class="con-bl-row"><dt>${esc(label)}</dt><dd>${valueHtml}</dd></div>`;

/**
 * Plan a trip and Import a trip. With no plan running, Plan a trip takes the lead colour.
 * @param {import('../contract.js').DashboardModel} model
 * @param {'top'|'below'} where  the desktop position beside the dateline, or the phone position in the page
 */
export function planButtons(model, where) {
  const lead = model.state === 'empty' || (model.state === 'ready' && !model.live.length);
  const plan = button('Plan a trip', {
    action: 'new-trip', focusKey: `${where}-new-trip`, cls: ['ui-btn', 'con-btn', lead ? 'con-btn--cta' : 'con-btn--ivory'],
    html: `${icon('plus', 18)}<span>Plan a trip</span>`,
  });
  const bring = button('Import a trip', {
    action: 'import-trip', focusKey: `${where}-import-trip`, cls: 'ui-btn con-btn con-btn--line', html: `${icon('import', 18)}<span>Import a trip</span>`,
  });
  return `<p class="con-actions con-actions--${where === 'top' ? 'top' : 'below'}">${plan}${bring}</p>`;
}

/** The stretched link that opens a plan: the neutral href, named by the plan (blueprint 3.3). */
export const cardLink = (card) => `<a class="trip-card-link" href="${esc(card.href)}"${attr('aria-label', `Open ${card.title}`)}${attr('data-focus-key', `open-${card.id}`)}></a>`;

/** The attributes every trip element carries. */
export const tripAttrs = (card, state = '') => `${attr('data-trip-id', card.id)}${attr('data-key', card.id)}${attr('data-trip-state', state || null)}${card.briefingPending && !state ? ' data-briefing="pending"' : ''}`;
