import { describe, it, expect } from 'vitest';
import {
  chatExamples, chatEmptyHtml, CHAT_GREETING, CONCIERGE_NAME, CONCIERGE_MARK, CHAT_DAILY_LIMIT,
  conciergeAvatar, typingHtml, chatErrorStatus, chatError, replyHtml, choicesHtml, proposalHtml, CHAT_OFFLINE,
} from './itinerary-chat-ui.js';

// Em dash, en dash, middle dot, bullet glyphs and ellipses never appear in UI copy.
const AI_GLYPHS = /[–—·•…]|\.{3}/;

describe('chatExamples', () => {
  it('offers a question, a note, a booking and a change', () => {
    expect(chatExamples(14, 'Nishiki Market')).toEqual([
      'What are we doing for dinner on day 2?',
      'Add a note to Nishiki Market: bring cash',
      'I booked the hotel, confirmation 12345',
      'Make day 2 more relaxed',
    ]);
  });

  it('never points at a day past the end of a short trip, and works without a stop', () => {
    expect(chatExamples(1)).toEqual([
      'What are we doing for dinner on day 1?',
      'Add a note to the first stop on day 1: bring cash',
      'I booked the hotel, confirmation 12345',
      'Make day 1 more relaxed',
    ]);
    expect(chatExamples(0)[3]).toBe('Make day 1 more relaxed');
    expect(chatExamples(undefined)[0]).toBe('What are we doing for dinner on day 1?');
  });
});

describe('chatEmptyHtml', () => {
  it('has the concierge greet and offers each example as a tappable button', () => {
    const html = chatEmptyHtml(chatExamples(5, 'Louvre'));
    expect(CONCIERGE_NAME).toBe('Trippy Concierge');
    expect(html).toContain(`<p class="td-chat-greeting">${CHAT_GREETING.replace(/'/g, '&#39;')}</p>`);
    expect(CHAT_GREETING).toMatch(/Nothing is saved until you apply it\.$/);
    expect(html.match(/<button type="button" class="td-chat-example">/g)).toHaveLength(4);
    expect(html).toContain('>Add a note to Louvre: bring cash</button>');
  });

  it('puts the concierge avatar beside the greeting, hidden from screen readers', () => {
    const html = chatEmptyHtml(chatExamples(5));
    expect(html).toMatch(/^<div class="td-chat-row"><span class="td-concierge td-concierge--msg" aria-hidden="true"><svg /);
  });

  it('escapes example text', () => {
    expect(chatEmptyHtml(['<b>"x"</b>'])).toContain('>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</button>');
    expect(chatEmptyHtml(chatExamples(3, '<img src=x>'))).not.toContain('<img');
  });

  it('keeps the copy free of dashes, middle dots, bullets and ellipses', () => {
    expect(chatEmptyHtml(chatExamples(9, 'Louvre'))).not.toMatch(AI_GLYPHS);
  });
});

describe('replyHtml, choicesHtml and proposalHtml', () => {
  it('shows an answer escaped, with clock times in the 12 hour format', () => {
    expect(replyHtml('Dinner is at 19:30 at <b>Gion</b>.')).toBe('Dinner is at 7:30 PM at &lt;b&gt;Gion&lt;/b&gt;.');
  });

  it('offers each candidate as a button', () => {
    const html = choicesHtml('Which one?', ['Nishiki Market on day 3 at 10:00 AM', '<i>x</i>']);
    expect(html).toMatch(/^Which one\?<div class="td-chat-choices">/);
    expect(html.match(/class="td-chat-example td-chat-choice"/g)).toHaveLength(2);
    expect(html).toContain('>&lt;i&gt;x&lt;/i&gt;</button>');
  });

  const note = { text: 'Add note to Nishiki Market: buy knives at <Aritsugu>', reason: 'You asked at 15:00', state: 'pending' };
  const booking = { text: 'Mark Hotel Granvia as booked, confirmation 12345', state: 'pending' };

  it('proposes one change with Apply and Dismiss, escaped', () => {
    const html = proposalHtml('Here is the note.', [note]);
    expect(html).toContain('<span>Add note to Nishiki Market: buy knives at &lt;Aritsugu&gt;</span>');
    expect(html).toContain('<span class="td-chat-edit-reason">You asked at 3:00 PM</span>');
    expect(html).toMatch(/td-chat-apply">Apply<\/button>/);
    expect(html).toMatch(/td-chat-discard">Dismiss<\/button>/);
    expect(html).not.toContain('td-chat-status');
  });

  it('counts the changes on the button and locks it while saving', () => {
    expect(proposalHtml('', [note, booking])).toMatch(/td-chat-apply">Apply 2 changes</);
    const saving = proposalHtml('', [note, booking], 'saving');
    expect(saving).toMatch(/td-chat-apply" disabled>Saving</);
    expect(saving).toMatch(/td-chat-discard" disabled>/);
  });

  it('says it was saved and drops the buttons', () => {
    const html = proposalHtml('', [{ ...booking, state: 'saved' }], 'done');
    expect(html).toContain('<span class="td-chat-edit-state">Saved</span>');
    expect(html).toContain('<p class="td-chat-status" role="status">Saved to your plan.</p>');
    expect(html).not.toContain('td-chat-apply');
    expect(proposalHtml('', [{ ...booking, state: 'saved' }, { ...note, state: 'saved' }], 'done')).toContain('Saved 2 changes to your plan.');
  });

  it('keeps the proposal and says so when a save fails', () => {
    const html = proposalHtml('', [{ ...booking, state: 'saved' }, { ...note, state: 'failed', error: 'failed' }], 'open');
    expect(html).toContain('<span class="td-chat-edit-state">Not saved</span>');
    expect(html).toContain('This change was not saved. Check your connection and try again.');
    expect(html).toMatch(/td-chat-apply">Try again</);
    const stale = proposalHtml('', [{ ...note, state: 'failed', error: 'stale' }]);
    expect(stale).toContain('This change no longer matches your plan, so it was not saved.');
    const off = proposalHtml('', [{ ...booking, state: 'saved' }, { ...note, state: 'failed', error: 'no_column' }]);
    expect(off).toContain('Notes on stops are not switched on yet');
    // Trying again cannot help with either, so no button offers it.
    expect(stale).not.toContain('td-chat-apply');
    expect(off).not.toContain('td-chat-apply');
  });

  it('says nothing changed when dismissed', () => {
    const html = proposalHtml('', [note], 'dismissed');
    expect(html).toContain('Dismissed. Nothing was changed.');
    expect(html).not.toContain('td-chat-apply');
  });

  it('keeps every state free of dashes, middle dots, bullets and ellipses', () => {
    for (const phase of ['open', 'saving', 'done', 'dismissed']) {
      for (const error of ['failed', 'stale', 'no_column']) {
        expect(proposalHtml('', [{ ...note, state: 'failed', error }, { ...booking, state: 'saved' }], phase)).not.toMatch(AI_GLYPHS);
      }
    }
    expect(CHAT_OFFLINE).toBe('You are offline. Trippy Concierge needs a connection.');
  });
});

describe('conciergeAvatar', () => {
  it('wraps the mark in a badge of the asked size', () => {
    expect(conciergeAvatar('head')).toBe(`<span class="td-concierge td-concierge--head" aria-hidden="true">${CONCIERGE_MARK}</span>`);
    expect(conciergeAvatar()).toContain('td-concierge--msg');
    expect(conciergeAvatar('huge')).toContain('td-concierge--msg');
  });

  it('is a self-contained inline SVG: no external assets, no ids to collide', () => {
    expect(CONCIERGE_MARK).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*aria-hidden="true"/);
    expect(CONCIERGE_MARK).not.toMatch(/\b(href|src|url\(|id=)/);
  });
});

describe('typingHtml', () => {
  it('shows three dots and says the same in words for screen readers', () => {
    const html = typingHtml();
    expect(html).toContain('<span class="td-chat-typing" aria-hidden="true"><span></span><span></span><span></span></span>');
    expect(html).toContain('<span class="td-chat-sr">Concierge is thinking</span>');
    expect(html).not.toMatch(/Thinking/);
  });
});

describe('chatErrorStatus', () => {
  // supabase.functions.invoke resolves { data, error, response }; on a non-2xx
  // answer error is a FunctionsHttpError whose context is the Response.
  const httpError = (status) => ({ data: null, error: { name: 'FunctionsHttpError', context: { status, json: async () => ({}) } }, response: { status } });

  it('reads the status of a non-2xx answer', () => {
    expect(chatErrorStatus(httpError(429))).toBe(429);
    expect(chatErrorStatus(httpError(413))).toBe(413);
    expect(chatErrorStatus(httpError(502))).toBe(502);
  });

  it('falls back to the response when the error has no context', () => {
    expect(chatErrorStatus({ data: null, error: { name: 'FunctionsHttpError' }, response: { status: 500 } })).toBe(500);
  });

  it('has no status for network failures, thrown errors and successes', () => {
    // FunctionsFetchError: context is the fetch TypeError, not a Response.
    expect(chatErrorStatus({ data: null, error: { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') } })).toBeNull();
    expect(chatErrorStatus({ error: new Error('boom') })).toBeNull();
    expect(chatErrorStatus(null)).toBeNull();
    expect(chatErrorStatus(undefined)).toBeNull();
    expect(chatErrorStatus({ data: { reply: 'ok', edits: [] }, error: null, response: { status: 200 } })).toBeNull();
  });
});

describe('chatError', () => {
  it('names the daily limit on 429, with no retry', () => {
    expect(CHAT_DAILY_LIMIT).toBe(60);
    expect(chatError(429)).toEqual({ text: 'You\'ve reached today\'s limit of 60 requests. Try again tomorrow.', retry: false });
  });

  it('explains an oversized trip on 413, with no retry', () => {
    expect(chatError(413)).toEqual({ text: 'This trip is too large for the chat.', retry: false });
  });

  it('offers a retry for everything else', () => {
    for (const status of [400, 401, 500, 502, 503, null]) {
      const e = chatError(status);
      expect(e.retry).toBe(true);
      expect(e.text).toMatch(/try again/i);
    }
  });

  it('keeps every message free of dashes, middle dots and bullets', () => {
    for (const status of [429, 413, 500, null]) expect(chatError(status).text).not.toMatch(AI_GLYPHS);
    expect(typingHtml()).not.toMatch(AI_GLYPHS);
    expect(CHAT_GREETING).not.toMatch(AI_GLYPHS);
  });
});
