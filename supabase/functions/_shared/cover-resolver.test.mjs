import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { findCoverCandidates } from './cover-resolver.mjs';

// Network side of the cover picker against a fake fetch that serves the real
// (trimmed) API responses in ./fixtures/cover. Wikimedia calls go through the
// shared 300ms rate gate, so each run takes a couple of seconds.

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/cover/${name}.json`, import.meta.url), 'utf8'));
const TRIP = {
  dest: { name: 'Sapporo', lat: 43.0618, lng: 141.3545, country: 'Japan', flag: 'jp' },
  startDate: '2027-01-13', endDate: '2027-01-26', landmarks: ['Sapporo Clock Tower'],
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]);
const WIKIMEDIA_API = /^https:\/\/([a-z]+\.wikivoyage|[a-z]+\.wikipedia|commons\.wikimedia|www\.wikidata)\.org\/w\/api\.php/;

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function fakeNetwork({ wikimediaDown = false, pexelsRemaining = 150, gemini = null, noItem = false } = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (WIKIMEDIA_API.test(url.href)) {
      if (wikimediaDown) return new Response('down', { status: 503 });
      const p = url.searchParams;
      if (url.hostname === 'www.wikidata.org') {
        return jsonResponse(noItem ? { entities: { '-1': { site: 'enwikivoyage', title: 'Sapporo', missing: '' } }, success: 1 } : fixture('wikidata-sapporo'));
      }
      if (url.hostname === 'en.wikivoyage.org') return jsonResponse(fixture('lead-sapporo-envoy'));
      if (url.hostname === 'ja.wikivoyage.org') return jsonResponse(fixture('lead-sapporo-javoy'));
      if (url.hostname === 'en.wikipedia.org') return jsonResponse(fixture('lead-sapporo-enwiki'));
      if (p.get('titles')) return jsonResponse(fixture('commons-files-sapporo'));
      if (/incategory:/.test(p.get('gsrsearch') || '')) return jsonResponse(fixture('commons-sapporo-assessed'));
      return jsonResponse({ batchcomplete: true });
    }
    if (url.hostname === 'api.pexels.com') {
      const file = url.searchParams.get('query') === 'Sapporo winter' ? 'pexels-sapporo-winter' : 'pexels-sapporo';
      const reset = String(Math.floor(Date.now() / 1000) + 3600);
      return jsonResponse(fixture(file), 200, { 'X-Ratelimit-Limit': '200', 'X-Ratelimit-Remaining': String(pexelsRemaining), 'X-Ratelimit-Reset': reset });
    }
    if (/^(images\.pexels\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org)$/.test(url.hostname)) {
      return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (url.hostname === 'generativelanguage.googleapis.com') return gemini ? gemini(init) : new Response('no', { status: 500 });
    return new Response('unexpected', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('findCoverCandidates', () => {
  it('ranks Pexels, Commons and Wikidata-linked candidates within the Wikimedia call budget', async () => {
    const calls = fakeNetwork();
    const { ranked, ctx, complete } = await findCoverCandidates(TRIP, { pexelsKey: 'test-key' });
    expect(complete).toBe(true);
    expect(ctx).toMatchObject({ qid: 'Q37951', season: 'winter', month: 1 });
    expect(ranked[0]).toMatchObject({ source: 'pexels', sourceId: '32970318', score: 77 });
    expect(ranked.some((c) => c.sourceId === '17091319')).toBe(false); // Hakodate under "Sapporo"
    expect(ranked.some((c) => c.source === 'wikidata' && c.role === 'banner')).toBe(true);
    expect(ranked.some((c) => c.source === 'commons')).toBe(true);

    const wikimedia = calls.filter((c) => WIKIMEDIA_API.test(c.url.href));
    expect(wikimedia.length).toBeLessThanOrEqual(7);
    for (const c of wikimedia) expect(c.init.headers['User-Agent']).toMatch(/TrippyPWA\/2\.0 .*@users\.noreply\.github\.com/);
    const search = wikimedia.find((c) => c.url.searchParams.get('generator') === 'search');
    expect(search.url.searchParams.get('gsrsort')).toBe('incoming_links_desc');
    // All geotags of the 30-file batch (the default is 10), so the 30 km check sees every file.
    expect(search.url.searchParams.get('prop')).toContain('coordinates');
    expect(search.url.searchParams.get('colimit')).toBe('max');
    expect(calls.some((c) => c.url.searchParams.get('generator') === 'geosearch')).toBe(false);

    const pexels = calls.filter((c) => c.url.hostname === 'api.pexels.com');
    expect(pexels.map((c) => c.url.searchParams.get('query'))).toEqual(['Sapporo', 'Sapporo winter']);
    expect(pexels[0].init.headers.Authorization).toBe('test-key');
    expect(pexels[0].url.searchParams.get('orientation')).toBe('landscape');
  }, 15_000);

  it('lets the vision check remove and reorder, with one generateContent call', async () => {
    let request = null;
    const gemini = (init) => {
      request = init;
      const body = JSON.parse(init.body);
      const count = body.contents[0].parts.filter((p) => p.inlineData).length;
      // Image 0 is the aerial dusk view; everything else is judged ugly.
      const images = Array.from({ length: count }, (_, i) => ({ index: i, showsDestination: 'yes', beauty: i === 0 ? 9 : 3, focusY: i === 0 ? 30 : 50 }));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ images }) }] } }] });
    };
    const calls = fakeNetwork({ gemini });
    const { ranked } = await findCoverCandidates(TRIP, { pexelsKey: 'k', geminiKey: 'g-key', geminiModel: 'gemini-3.5-flash-lite' });
    expect(calls.filter((c) => c.url.hostname === 'generativelanguage.googleapis.com')).toHaveLength(1);
    expect(request.headers['x-goog-api-key']).toBe('g-key');
    const body = JSON.parse(request.body);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    // Gemini 3.x ignores temperature (later models reject it) and replaced thinkingBudget.
    expect(body.generationConfig).not.toHaveProperty('temperature');
    expect(body.generationConfig).not.toHaveProperty('thinkingConfig');
    expect(body.contents[0].parts.filter((p) => p.inlineData)).toHaveLength(6);
    expect(body.contents[0].parts[0].text).toMatch(/Sapporo, Japan, travelling in January \(winter\)/);
    expect(ranked[0]).toMatchObject({ sourceId: '32970318', judgeFocusY: 30, judge: { beauty: 9, showsDestination: 'yes' } });
    // The five others shown were dropped; nothing new was added.
    expect(ranked.filter((c) => c.judge)).toHaveLength(1);
  }, 15_000);

  it('keeps the heuristic order when the vision check fails', async () => {
    fakeNetwork({ gemini: () => new Response('overloaded', { status: 503 }) });
    const withJudge = await findCoverCandidates(TRIP, { pexelsKey: 'k', geminiKey: 'g' });
    fakeNetwork();
    const without = await findCoverCandidates(TRIP, { pexelsKey: 'k' });
    expect(withJudge.ranked.map((c) => c.key)).toEqual(without.ranked.map((c) => c.key));
  }, 15_000);

  it('reports an incomplete search when Wikimedia is down, so no "none" verdict is stored', async () => {
    fakeNetwork({ wikimediaDown: true });
    const out = await findCoverCandidates(TRIP, {});
    expect(out.complete).toBe(false);
    expect(out.ranked).toEqual([]);
  }, 15_000);

  it('asks for every geotag in the scenic and landmark searches too, and needs them without a Wikidata item', async () => {
    const calls = fakeNetwork({ noItem: true });
    const { ranked } = await findCoverCandidates(TRIP, {});
    const searches = calls.filter((c) => c.url.searchParams.get('generator') === 'search');
    expect(searches.length).toBeGreaterThan(1); // the assessed search found too little: scenic and landmark searches ran
    for (const c of searches) expect(c.url.searchParams.get('colimit')).toBe('max');
    // No item confirmed the city: only geotagged files near it are kept.
    expect(ranked.map((c) => c.sourceId).sort()).toEqual([
      'File:Sapporo Botanic Garden bridge-20091014-RM-105840.jpg', 'File:Sapporo Mt.Moiwa view-20091012-RM-123338.jpg',
    ]);
  }, 15_000);

  it('stops calling Pexels when its rate headers say fewer than 10 requests remain', async () => {
    const calls = fakeNetwork({ pexelsRemaining: 5 });
    await findCoverCandidates(TRIP, { pexelsKey: 'k' });
    expect(calls.filter((c) => c.url.hostname === 'api.pexels.com')).toHaveLength(1);
  }, 15_000);
});
