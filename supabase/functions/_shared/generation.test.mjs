// callGemini is shared by itinerary generation (needs `days`) and by chat edits /
// alternatives (other shapes). Regression: chat replies were rejected as an
// "incomplete itinerary", so chat never worked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from './generation.ts';

const geminiReply = (obj) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }],
}), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('callGemini', () => {
  it('accepts a chat patch when requireDays is false', async () => {
    vi.stubGlobal('fetch', async () => geminiReply({ reply: 'Added a night walk.', edits: [] }));
    const r = await callGemini('p', 's', {}, 'k', 'm', 8000, false);
    expect(r.error).toBeNull();
    expect(r.data.reply).toBe('Added a night walk.');
  });

  it('still requires days for itinerary generation by default', async () => {
    vi.stubGlobal('fetch', async () => geminiReply({ reply: 'x', edits: [] }));
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toBe('Gemini m returned incomplete itinerary');
    vi.stubGlobal('fetch', async () => geminiReply({ days: [{ dayNumber: 1 }] }));
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toBeNull();
  });
});

import { dedupeFoodVenues, summarizePriorDays, geminiGenerationConfig, accommodationVenues } from './generation.ts';

const act = (venueName, category = 'food') => ({ venueName, category, title: venueName });
const dbAct = (venue_name, category = 'food') => ({ venue_name, category, title: venue_name });

describe('dedupeFoodVenues', () => {
  it('drops only the repeated meal and keeps the day', () => {
    const data = { days: [{ dayNumber: 5, activities: [act('Museum', 'culture'), act('Daruma Honten'), act('Soup Curry Garaku')] }] };
    const prior = [{ day_number: 1, activities: [dbAct('Daruma Honten')] }];
    const issues = dedupeFoodVenues(data, prior);
    expect(issues).toHaveLength(1);
    expect(data.days).toHaveLength(1);
    expect(data.days[0].activities.map(a => a.venueName)).toEqual(['Museum', 'Soup Curry Garaku']);
  });

  it('lets meals at the traveller\'s own hotel repeat', () => {
    const data = { days: [{ dayNumber: 5, activities: [act('Takinoyu Ryokan')] }] };
    const prior = [{ day_number: 4, activities: [dbAct('Takinoyu Ryokan')] }];
    expect(dedupeFoodVenues(data, prior, ['Takinoyu Ryokan'])).toEqual([]);
    expect(data.days[0].activities).toHaveLength(1);
  });

  it('keeps different non-Latin venue names apart', () => {
    const data = { days: [{ dayNumber: 2, activities: [act('すし善'), act('だるま')] }] };
    expect(dedupeFoodVenues(data, [{ day_number: 1, activities: [dbAct('だるま 本店')] }])).toEqual([]);
    expect(data.days[0].activities).toHaveLength(2);
  });

  it('cuts the chunk at a day that was only repeats, so later days keep their dates', () => {
    const data = { days: [
      { dayNumber: 2, activities: [act('C')] },
      { dayNumber: 3, activities: [act('A'), act('A')] },
      { dayNumber: 4, activities: [act('B')] },
    ] };
    dedupeFoodVenues(data, [{ day_number: 1, activities: [dbAct('A')] }]);
    expect(data.days.map(d => d.dayNumber)).toEqual([2]);
  });
});

describe('summarizePriorDays', () => {
  it('lists every food venue, including dinners late in a packed day', () => {
    const acts = Array.from({ length: 12 }, (_, i) => dbAct(`Stop ${i}`, i === 11 ? 'dinner' : 'culture'));
    const text = summarizePriorDays([{ day_number: 1, title: 'Arrive', activities: acts }]);
    expect(text).toContain('Stop 11');
    expect(text).toMatch(/ALREADY USED[^\n]*Stop 11/);
  });
});

describe('accommodationVenues', () => {
  it('collects hotel names and a pre-booked address', () => {
    expect(accommodationVenues({ accommodation: [{ name: 'Hotel A' }, {}] }, { accommodation: { hotelAddress: '1 Main St' } }))
      .toEqual(['Hotel A', '1 Main St']);
    expect(accommodationVenues(null, {})).toEqual([]);
  });
});

describe('Gemini 3.x request', () => {
  it('sends thinkingLevel low and no temperature for Flash, nothing extra for Flash-Lite', () => {
    const flash = geminiGenerationConfig('gemini-3.6-flash', { type: 'object' }, 40000);
    expect(flash.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(flash).not.toHaveProperty('temperature');
    expect(flash.responseJsonSchema).toEqual({ type: 'object' });
    const lite = geminiGenerationConfig('gemini-3.5-flash-lite', {}, 40000);
    expect(lite).not.toHaveProperty('thinkingConfig');
  });

  it('joins answer parts, skips thought parts and keeps the key out of the URL', async () => {
    let seen;
    vi.stubGlobal('fetch', async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [
        { text: 'thinking...', thought: true }, { text: '{"days":[{"dayNumber":1,' }, { text: '"activities":[]}]}' },
      ] }, finishReason: 'STOP' }] }), { status: 200 });
    });
    const r = await callGemini('p', 's', {}, 'secret-key', 'gemini-3.6-flash');
    expect(r.error).toBeNull();
    expect(r.data.days).toHaveLength(1);
    expect(seen.url).not.toContain('secret-key');
    expect(seen.init.headers['x-goog-api-key']).toBe('secret-key');
  });
});

import { parseItineraryJson, validateItinerary, toDbDays, sanitizeDbDays } from './generation.ts';

describe('parseItineraryJson', () => {
  it('parses a complete reply as is', () => {
    expect(parseItineraryJson('{"days":[{"dayNumber":1}]}')).toEqual({ data: { days: [{ dayNumber: 1 }] }, salvaged: false });
  });

  it('keeps the complete days of a reply cut off mid-day', () => {
    const cut = '{"tripTitle":"Sapporo","days":[{"dayNumber":1,"activities":[{"title":"a \\"quoted\\" {brace}"}]},{"dayNumber":2,"activities":[]},{"dayNumber":3,"activities":[{"title":"Lun';
    const r = parseItineraryJson(cut);
    expect(r.salvaged).toBe(true);
    expect(r.data.days.map(d => d.dayNumber)).toEqual([1, 2]);
    expect(r.data.days[0].activities[0].title).toBe('a "quoted" {brace}');
  });

  it('returns null when no day survives', () => {
    expect(parseItineraryJson('{"days":[{"dayNumber":1,"activ')).toBeNull();
    expect(parseItineraryJson('not json')).toBeNull();
  });

  it('salvages through callGemini and says so', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [
      { text: '{"days":[{"dayNumber":1,"activities":[{"title":"x"}]},{"dayNumber":2,"activit' },
    ] }, finishReason: 'MAX_TOKENS' }] }), { status: 200 }));
    const r = await callGemini('p', 's', {}, 'k', 'gemini-3.6-flash');
    expect(r.error).toBeNull();
    expect(r.data.days).toHaveLength(1);
    expect(r.note).toMatch(/cut-off.*MAX_TOKENS/);
  });
});

describe('validateItinerary', () => {
  it('keeps only the complete days before the first gap', () => {
    const data = { days: [{ activities: [1] }, { activities: [] }, { activities: [1] }] };
    expect(validateItinerary(data, 3).fatal).toBe(false);
    expect(data.days).toHaveLength(1);
  });
});

describe('save-safe activity values', () => {
  it('coerces values replace_itinerary would reject', () => {
    const [day] = toDbDays({ days: [{ dayNumber: 1, activities: [
      { title: 'a', durationMinutes: 90.5, sortOrder: '2', costAmount: '1,000', latitude: 95.2, longitude: '141.35' },
      { title: 'b', durationMinutes: '', sortOrder: null, costAmount: -5, latitude: [43.06, 43.07], longitude: null },
    ] }] }, 'JPY');
    expect(day.activities[0]).toMatchObject({ duration_minutes: 91, sort_order: 2, cost_amount: 1000, latitude: null, longitude: 141.35 });
    expect(day.activities[1]).toMatchObject({ duration_minutes: 60, sort_order: 1, cost_amount: 0, latitude: 43.06, longitude: null });
  });

  it('heals days accumulated before the fix', () => {
    const [day] = sanitizeDbDays([{ activities: [{ duration_minutes: '45.4', sort_order: 'x', cost_amount: 3e12 }] }]);
    expect(day.activities[0]).toMatchObject({ duration_minutes: 45, sort_order: 0, cost_amount: 2147483647 });
  });

  it('tags 503 as retryable and 429 as rate-limited', async () => {
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toMatch(/\[retryable\]$/);
    vi.stubGlobal('fetch', async () => new Response('quota', { status: 429 }));
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toMatch(/\[rate-limited\]$/);
  });
});

describe('wrapped replies', () => {
  it('accepts an itinerary wrapped one level deep', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"itinerary":{"days":[{"dayNumber":1,"activities":[{"title":"x"}]}]}}' }, finish_reason: 'stop' }] }), { status: 200 }));
    const { callMistral } = await import('./generation.ts');
    const r = await callMistral('p', 's', {}, 'k');
    expect(r.error).toBeNull();
    expect(r.data.days).toHaveLength(1);
  });
});
