// Pure pieces of the chat panel's empty state, kept apart from
// itinerary-chat.js so they can be tested without the Supabase client.
import { escapeHtml } from '../data/day-builder.js';

export const CHAT_GREETING = 'Ask for a change and I\'ll suggest edits you can apply.';

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
 * The greeting and example chips shown while the conversation is empty.
 * @param {string[]} examples
 * @returns {string}
 */
export function chatEmptyHtml(examples) {
  const chips = examples
    .map(text => `<button type="button" class="td-chat-example">${escapeHtml(text)}</button>`)
    .join('');
  return `<p class="td-chat-empty-text">${escapeHtml(CHAT_GREETING)}</p><div class="td-chat-examples">${chips}</div>`;
}
