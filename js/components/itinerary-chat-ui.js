// Pure pieces of the Trippy Concierge panel (the itinerary chat): its mark,
// greeting, typing indicator and error copy, kept apart from
// itinerary-chat.js so they can be tested without the Supabase client.
import { escapeHtml } from '../data/day-builder.js';

export const CONCIERGE_NAME = 'Trippy Concierge';

export const CHAT_GREETING = 'Hello, I\'m your Trippy Concierge. Tell me what you\'d like to change and I\'ll suggest edits you can apply.';

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
 * Three example requests. Day numbers are clamped to the trip's length so a
 * short trip is never offered a day it doesn't have.
 * @param {number} dayCount
 * @returns {string[]}
 */
export function chatExamples(dayCount) {
  const last = Math.max(1, Math.floor(Number(dayCount) || 0));
  return [
    `Make day ${Math.min(2, last)} more relaxed`,
    'Swap a museum for a park',
    `Add a coffee stop on day ${Math.min(3, last)}`,
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
    return { text: 'This trip is too large to edit by chat.', retry: false };
  }
  return { text: 'Sorry, I couldn\'t get an answer just now. Please try again.', retry: true };
}
