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
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toBe('Gemini returned incomplete itinerary');
    vi.stubGlobal('fetch', async () => geminiReply({ days: [{ dayNumber: 1 }] }));
    expect((await callGemini('p', 's', {}, 'k', 'm')).error).toBeNull();
  });
});
