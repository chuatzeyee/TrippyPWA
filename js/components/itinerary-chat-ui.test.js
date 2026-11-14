import { describe, it, expect } from 'vitest';
import {
  chatExamples, chatEmptyHtml, CHAT_GREETING, CONCIERGE_NAME, CONCIERGE_MARK, CHAT_DAILY_LIMIT,
  conciergeAvatar, typingHtml, chatErrorStatus, chatError,
} from './itinerary-chat-ui.js';

// Em dash, en dash, middle dot and bullet glyphs never appear in UI copy.
const AI_GLYPHS = /[–—·•]/;

describe('chatExamples', () => {
  it('suggests three edits on days the trip has', () => {
    expect(chatExamples(14)).toEqual([
      'Make day 2 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 3',
    ]);
  });

  it('never points at a day past the end of a short trip', () => {
    expect(chatExamples(2)).toEqual([
      'Make day 2 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 2',
    ]);
    expect(chatExamples(1)).toEqual([
      'Make day 1 more relaxed',
      'Swap a museum for a park',
      'Add a coffee stop on day 1',
    ]);
    expect(chatExamples(0)[0]).toBe('Make day 1 more relaxed');
    expect(chatExamples(undefined)[2]).toBe('Add a coffee stop on day 1');
  });
});

describe('chatEmptyHtml', () => {
  it('has the concierge greet and offers each example as a tappable button', () => {
    const html = chatEmptyHtml(chatExamples(5));
    expect(CONCIERGE_NAME).toBe('Trippy Concierge');
    expect(CHAT_GREETING).toBe('Hello, I\'m your Trippy Concierge. Tell me what you\'d like to change and I\'ll suggest edits you can apply.');
    expect(html).toContain('<p class="td-chat-greeting">Hello, I&#39;m your Trippy Concierge. Tell me what you&#39;d like to change and I&#39;ll suggest edits you can apply.</p>');
    expect(html.match(/<button type="button" class="td-chat-example">/g)).toHaveLength(3);
    expect(html).toContain('>Swap a museum for a park</button>');
  });

  it('puts the concierge avatar beside the greeting, hidden from screen readers', () => {
    const html = chatEmptyHtml(chatExamples(5));
    expect(html).toMatch(/^<div class="td-chat-row"><span class="td-concierge td-concierge--msg" aria-hidden="true"><svg /);
  });

  it('escapes example text', () => {
    expect(chatEmptyHtml(['<b>"x"</b>'])).toContain('>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</button>');
  });

  it('keeps the copy free of dashes, middle dots and bullets', () => {
    expect(chatEmptyHtml(chatExamples(9))).not.toMatch(AI_GLYPHS);
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
    expect(chatError(413)).toEqual({ text: 'This trip is too large to edit by chat.', retry: false });
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
