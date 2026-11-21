// The dashboard states every view draws the same way: empty, load error, stale list, a plan still
// being planned, a plan whose planning stopped, and the past toggle (blueprint 3.3). Each builder
// carries the hooks and roles the dashboard controller and the contract test look for. Owner: F5.
import { attr, button, cls, esc } from './html.js';
import { icon } from './icons.js';
import { segmentsHtml } from './segments.js';

const CARD_TAGS = ['article', 'li', 'div'];
const tagOf = (tag) => (CARD_TAGS.includes(tag) ? tag : 'article');
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const whole = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/**
 * The empty dashboard: both ways to start. A view still draws its own h1 above it.
 * @param {import('../contract.js').DashboardModel} model
 * @param {{ title?: string, text?: string, actions?: boolean, cls?: any }} [opts]
 */
export function emptyStateHtml(model, { title = 'Nothing is planned yet', text = 'Plan a trip from scratch, or bring in one you already have.', actions = true, cls: extra } = {}) {
  void model;
  const buttons = actions ? `<p class="dv-state-actions">${button('Plan your first trip', { action: 'new-trip', focusKey: 'empty-new-trip', cls: 'ui-btn ui-btn--primary', html: `${icon('plus', 18)}<span>Plan your first trip</span>` })}${button('Import a trip', { action: 'import-trip', focusKey: 'empty-import-trip', cls: 'ui-btn', html: `${icon('import', 18)}<span>Import a trip</span>` })}</p>` : '';
  return `<div class="${cls('dv-state dv-empty', extra)}">
    <p class="dv-state-title">${esc(title)}</p>
    <p class="dv-state-text">${esc(text)}</p>
    ${buttons}
  </div>`;
}

/**
 * The load error: an alert that holds the retry button.
 * @param {{ message?: string, cls?: any }} [opts]
 */
export function loadErrorHtml({ message = 'Check your connection, then try again.', cls: extra } = {}) {
  return `<div class="${cls('dv-state dv-error', extra)}" role="alert">
    ${icon('warning', 24)}
    <p class="dv-state-title">Your trips could not be loaded</p>
    <p class="dv-state-text">${esc(message)}</p>
    <p class="dv-state-actions">${button('Try again', { action: 'retry-trips', cls: 'ui-btn ui-btn--primary' })}</p>
  </div>`;
}

/**
 * The stale banner: a status that holds the retry button. '' when the list is fresh.
 * @param {{ savedAt: string|null }|null} stale
 * @param {{ savedText?: string, cls?: any }} [opts] savedText is when it was saved, already in words ("yesterday at 6:42 PM")
 */
export function staleBannerHtml(stale, { savedText = '', cls: extra } = {}) {
  if (!stale) return '';
  const when = savedText ? ` ${esc(savedText)}` : '';
  return `<div class="${cls('dv-stale', extra)}" role="status">
    ${icon('offline', 20)}
    <p class="dv-stale-text">This list was saved on this device${when} and may be out of date.</p>
    ${button('Try again', { action: 'retry-trips', cls: 'ui-btn ui-btn--small' })}
  </div>`;
}

function progressText({ daysDone, daysTotal, etaMinutes }) {
  const done = whole(daysDone) ?? 0;
  const total = whole(daysTotal);
  const planned = total ? `${done} of ${count(total, 'day', 'days')} planned` : `${count(done, 'day', 'days')} planned so far`;
  const eta = whole(etaMinutes);
  return eta ? `${planned}, about ${count(eta, 'minute', 'minutes')} to go` : planned;
}

const plain = (value) => (typeof value === 'string' ? value.trim() : '');
/** The line under the title of a state card (the plan's dates): plain text, escaped here. */
const subtitleHtml = (subtitle) => (plain(subtitle) ? `<p class="dv-card-sub">${esc(plain(subtitle))}</p>` : '');
/** Trusted markup a view puts after the status line; anything but a string is nothing. */
const trusted = (html) => (typeof html === 'string' ? html : '');

/**
 * A plan that is still being planned. No link: the element is not clickable.
 * @param {import('../contract.js').TripCardModel} card
 * @param {{ tag?: 'article'|'li'|'div', notify?: boolean, subtitle?: string, statusLabel?: string, afterStatus?: string, cls?: any }} [opts]
 *   subtitle     one line of plain text under the title (the plan's dates): <p class="dv-card-sub">
 *   statusLabel  the words of the status line, "Still being planned" by default ("Planning now")
 *   afterStatus  TRUSTED markup placed right after the status line: escape every value in it yourself
 */
export function generatingCardHtml(card, { tag, notify = true, subtitle, statusLabel, afterStatus, cls: extra } = {}) {
  const el = tagOf(tag);
  const generation = card.generation ?? {};
  const done = whole(generation.daysDone) ?? 0;
  const total = whole(generation.daysTotal);
  const bar = total ? segmentsHtml(done, total, Math.min(total, done + 1), { label: `${done} of ${count(total, 'day', 'days')} planned` }) : '';
  const slow = generation.slow ? '<p class="dv-card-note">This is taking longer than usual. You can leave this page.</p>' : '';
  const tell = notify ? `<p class="dv-card-actions">${button('Tell me when it is ready', { action: 'notify-ready', focusKey: `notify-${card.id}`, cls: 'ui-btn ui-btn--small', html: `${icon('bell', 18)}<span>Tell me when it is ready</span>` })}</p>` : '';
  return `<${el} class="${cls('dv-card dv-gen', extra)}"${attr('data-trip-id', card.id)}${attr('data-key', card.id)} data-trip-state="generating" role="status">
    <h3 class="dv-card-title">${esc(card.title)}</h3>${subtitleHtml(subtitle)}
    <p class="dv-card-status">${esc(plain(statusLabel) || 'Still being planned')}</p>${trusted(afterStatus)}
    <p class="dv-gen-progress">${esc(progressText(generation))}</p>
    ${bar}${slow}${tell}
  </${el}>`;
}

/** "Stopped after day 4 of 13" with its segments, when the plan says how far planning got; else ''. */
function stoppedHtml(generation) {
  const done = whole(generation?.daysDone);
  const total = whole(generation?.daysTotal);
  if (!total || done === null || done < 1 || done > total) return '';
  const line = `Stopped after day ${done} of ${total}`;
  return `<p class="dv-gen-progress">${line}</p>${segmentsHtml(done, total, null, { label: line })}`;
}

/**
 * A plan whose planning stopped: try again, and delete unless the plan is shared with the user.
 * @param {import('../contract.js').TripCardModel} card
 * @param {{ tag?: 'article'|'li'|'div', subtitle?: string, statusLabel?: string, afterStatus?: string, progress?: boolean,
 *           deleteLabel?: string, cls?: any }} [opts]
 *   subtitle, statusLabel ("Planning stopped" by default), afterStatus: as on generatingCardHtml()
 *   progress     true adds "Stopped after day 4 of 13" and the segments under the status, when the plan
 *                holds both numbers
 *   deleteLabel  the words on the delete button, "Delete trip" by default ("Delete this trip")
 */
export function failedCardHtml(card, { tag, subtitle, statusLabel, afterStatus, progress = false, deleteLabel, cls: extra } = {}) {
  const el = tagOf(tag);
  const retry = button('Try again', { focusKey: `retry-${card.id}`, cls: 'ui-btn ui-btn--small ui-btn--primary', attrs: { 'data-retry-trip': card.id } });
  const remove = card.shared ? '' : button(plain(deleteLabel) || 'Delete trip', { focusKey: `delete-${card.id}`, cls: 'ui-btn ui-btn--small ui-btn--danger', attrs: { 'data-delete-trip': card.id } });
  return `<${el} class="${cls('dv-card dv-failed', extra)}"${attr('data-trip-id', card.id)}${attr('data-key', card.id)} data-trip-state="failed">
    <h3 class="dv-card-title">${esc(card.title)}</h3>${subtitleHtml(subtitle)}
    <p class="dv-card-status">${icon('warning', 18)}<span>${esc(plain(statusLabel) || 'Planning stopped')}</span></p>${trusted(afterStatus)}${progress === true ? stoppedHtml(card.generation) : ''}
    <p class="dv-card-note">${esc(card.generation?.error || 'Planning stopped before the plan was finished.')}</p>
    <p class="dv-card-actions">${retry}${remove}</p>
  </${el}>`;
}

/**
 * The owner of data-action="show-all-past": the button under the first past rows.
 * @param {number} total  how many past plans there are
 */
export function pastToggleHtml(total) {
  if (!Number.isInteger(total) || total < 1) return '';
  const label = total === 1 ? 'Show 1 past plan' : `Show all ${total} past plans`;
  return button(label, { action: 'show-all-past', cls: 'ui-btn dv-past-toggle' });
}
