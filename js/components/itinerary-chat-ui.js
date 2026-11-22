// Pure pieces of the Trippy Concierge panel (the itinerary chat): its mark,
// greeting, typing indicator, error copy and the HTML of an answer, a set of
// choices and a proposal, kept apart from
// itinerary-chat.js so they can be tested without the Supabase client.
import { escapeHtml } from '../data/day-builder.js';
import { formatClock } from '../lib/locale.js';

export const CONCIERGE_NAME = 'Trippy Concierge';

export const CHAT_GREETING = 'Hello, I\'m your Trippy Concierge. Ask me about your plan, or tell me what to change, note down or mark as booked. Nothing is saved until you apply it.';

export const CHAT_OFFLINE = 'You are offline. Trippy Concierge needs a connection.';

// Mirrors DAILY_LIMIT in supabase/functions/itinerary-chat/index.ts.
export const CHAT_DAILY_LIMIT = 60;

// The concierge mark: a service bell on the terracotta badge that the
// .td-concierge / .td-chat-fab styles paint behind it. Line art only, in
// currentColor. The ring marks and the dome's shine are dropped at avatar
// size (.td-cm-detail), where they would blur into the bell.
export const CONCIERGE_MARK = '<svg class="td-cm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
  + '<path class="td-cm-detail" d="M6.3 5.1 5.1 3.8M17.7 5.1l1.2-1.3" stroke-width="1.35" opacity=".85"/>'
  + '<path d="M10.2 4.9h3.6" stroke-width="2"/>'
  + '<path d="M12 5.4v2.9"/>'
  + '<path d="M4.5 16.3a7.5 7.5 0 0 1 15 0z" fill="currentColor" stroke="none"/>'
  + '<path class="td-cm-detail td-cm-shine" d="M7.8 14a4.6 4.6 0 0 1 2.6-2.8" stroke-width="1.3"/>'
  + '<rect x="2.8" y="17.4" width="18.4" height="2.4" rx="1.2" fill="currentColor" stroke="none"/>'
  + '</svg>';

/**
 * The concierge avatar: the mark on its round badge.
 * @param {'msg'|'head'} size  msg: 24px beside a message; head: 40px in the panel header
 * @returns {string}
 */
export function conciergeAvatar(size = 'msg') {
  const variant = size === 'head' ? 'head' : 'msg';
  return `<span class="td-concierge td-concierge--${variant}" aria-hidden="true">${CONCIERGE_MARK}</span>`;
}

/**
 * Four example requests that fill the box: a question, a note, a booking and
 * a change. Day numbers are clamped to the trip's length so a short trip is
 * never offered a day it doesn't have.
 * @param {number} dayCount
 * @param {string} [stopName]  a stop of the trip, for the note example
 * @returns {string[]}
 */
export function chatExamples(dayCount, stopName = '') {
  const last = Math.max(1, Math.floor(Number(dayCount) || 0));
  const day = Math.min(2, last);
  const stop = String(stopName || '').trim().slice(0, 40);
  return [
    `What are we doing for dinner on day ${day}?`,
    stop ? `Add a note to ${stop}: bring cash` : 'Add a note to the first stop on day 1: bring cash',
    'I booked the hotel, confirmation 12345',
    `Make day ${day} more relaxed`,
  ];
}

/**
 * The concierge's greeting and the example chips shown while the
 * conversation is empty.
 * @param {string[]} examples
 * @returns {string}
 */
export function chatEmptyHtml(examples) {
  const chips = examples
    .map(text => `<button type="button" class="td-chat-example">${escapeHtml(text)}</button>`)
    .join('');
  return `<div class="td-chat-row">${conciergeAvatar('msg')}<p class="td-chat-greeting">${escapeHtml(CHAT_GREETING)}</p></div>`
    + `<div class="td-chat-examples">${chips}</div>`;
}

/**
 * The contents of a concierge message while a reply is on its way: three
 * animated dots, and the same news in words for screen readers.
 * @returns {string}
 */
export function typingHtml() {
  return '<span class="td-chat-typing" aria-hidden="true"><span></span><span></span><span></span></span>'
    + '<span class="td-chat-sr">Concierge is thinking</span>';
}

/**
 * The HTTP status behind a failed supabase.functions.invoke call. A non-2xx
 * answer comes back as a FunctionsHttpError (or FunctionsRelayError) whose
 * `context` is the fetch Response; the result also carries it as `response`.
 * A network failure (FunctionsFetchError) or a thrown error has no status.
 * @param {{ error?: any, response?: { status?: number } } | null | undefined} result
 * @returns {number | null}
 */
export function chatErrorStatus(result) {
  const status = result?.error?.context?.status ?? result?.response?.status;
  return Number.isInteger(status) && status >= 400 ? status : null;
}

/**
 * What the concierge says when a request fails, and whether a retry could help.
 * @param {number | null} status  HTTP status from chatErrorStatus
 * @returns {{ text: string, retry: boolean }}
 */
export function chatError(status) {
  if (status === 429) {
    return { text: `You've reached today's limit of ${CHAT_DAILY_LIMIT} requests. Try again tomorrow.`, retry: false };
  }
  if (status === 413) {
    return { text: 'This trip is too large for the chat.', retry: false };
  }
  return { text: 'Sorry, I couldn\'t get an answer just now. Please try again.', retry: true };
}

/** The concierge's words, with clock times in the format the user chose. Escaped. */
export function replyHtml(reply) {
  return escapeHtml(formatClock(String(reply || '').trim()));
}

/**
 * A question back to the traveller with the candidates as tappable buttons.
 * @param {string} reply
 * @param {string[]} labels  what each button says and sends
 */
export function choicesHtml(reply, labels) {
  const buttons = labels.map(label => `<button type="button" class="td-chat-example td-chat-choice">${escapeHtml(label)}</button>`).join('');
  return `${replyHtml(reply)}<div class="td-chat-choices">${buttons}</div>`;
}

const ITEM_STATE = { saved: 'Saved', failed: 'Not saved' };

/**
 * A proposal: what the concierge said, each change in plain words, and Apply
 * and Dismiss. After Apply every change says whether it was saved; one that
 * was not keeps the buttons when trying again could help.
 * @param {string} reply
 * @param {{ text: string, reason?: string, state: 'pending'|'saved'|'failed', error?: string }[]} items
 * @param {'open'|'saving'|'done'|'dismissed'} phase
 */
export function proposalHtml(reply, items, phase = 'open') {
  const rows = items.map(it => `<div class="td-chat-edit td-chat-edit--${it.state}"><span>${escapeHtml(it.text)}</span>`
    + `${it.reason ? `<span class="td-chat-edit-reason">${escapeHtml(formatClock(it.reason))}</span>` : ''}`
    + `${ITEM_STATE[it.state] ? `<span class="td-chat-edit-state">${ITEM_STATE[it.state]}</span>` : ''}</div>`).join('');
  const failed = items.filter(it => it.state === 'failed');
  const open = items.filter(it => it.state !== 'saved').length;
  let status = '';
  if (phase === 'dismissed') status = 'Dismissed. Nothing was changed.';
  else if (phase === 'done') status = items.length === 1 ? 'Saved to your plan.' : `Saved ${items.length} changes to your plan.`;
  else if (failed.length) status = proposalFailure(failed);
  const saving = phase === 'saving';
  const label = saving ? 'Saving' : failed.length ? 'Try again' : open === 1 ? 'Apply' : `Apply ${open} changes`;
  // A change that no longer fits, or notes that are not switched on: asking again cannot help.
  const stuck = failed.length > 0 && failed.every(it => it.error === 'stale' || it.error === 'no_column');
  const buttons = (phase === 'open' && !stuck) || saving
    ? `<div class="td-chat-apply-row">
        <button type="button" class="btn btn--primary btn--sm btn--pill td-chat-apply"${saving ? ' disabled' : ''}>${label}</button>
        <button type="button" class="btn btn--ghost btn--sm btn--pill td-chat-discard"${saving ? ' disabled' : ''}>Dismiss</button>
      </div>` : '';
  return `${replyHtml(reply)}<div class="td-chat-edits">${rows}</div>`
    + `${status ? `<p class="td-chat-status" role="status">${escapeHtml(status)}</p>` : ''}${buttons}`;
}

function proposalFailure(failed) {
  const many = failed.length > 1;
  if (failed.every(it => it.error === 'stale')) return `${many ? 'These changes no longer match' : 'This change no longer matches'} your plan, so ${many ? 'they were' : 'it was'} not saved.`;
  if (failed.every(it => it.error === 'no_column')) return 'Notes on stops are not switched on yet, so this was not saved.';
  return `${many ? `${failed.length} changes were` : 'This change was'} not saved. Check your connection and try again.`;
}
