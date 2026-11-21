import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// lookupRequirement is checkRequirement with one difference: it says when the
// answer is missing because the data could not be fetched. fetch is stubbed
// with a small invented data set.
const PASSPORT_SG = { US: { c: 'eta' }, JP: { c: 'vf', d: 90 }, KP: { c: 'na' } };
const AUTHS = { US: { name: 'ESTA', kind: 'eta', leadDays: 7, url: 'https://example.com/esta' } };

function stubFetch({ passport = true, auths = true, offline = false } = {}) {
  const fetchMock = vi.fn(async (url) => {
    if (offline) throw new TypeError('Failed to fetch');
    const body = url.endsWith('authorisations.json') ? (auths ? structuredClone(AUTHS) : null)
      : url.endsWith('SG.json') ? (passport ? PASSPORT_SG : null)
      : null;
    return { ok: !!body, status: body ? 200 : 503, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const load = () => import('./visa-advisor.js');

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('lookupRequirement', () => {
  it('gives the same advisory as checkRequirement, marked as not failed', async () => {
    stubFetch();
    const { lookupRequirement, checkRequirement } = await load();
    const found = await lookupRequirement('SG', 'US', '2026-11-10');
    expect(found.failed).toBe(false);
    expect(found.requirement).toMatchObject({ level: 'action', code: 'eta', applyBy: '2026-11-03' });
    expect(found.requirement).toEqual(await checkRequirement('SG', 'US', '2026-11-10'));
    expect(await lookupRequirement('sg', 'jp', null)).toEqual({ requirement: await checkRequirement('SG', 'JP', null), failed: false });
    expect((await lookupRequirement('SG', 'KP', null)).requirement).toMatchObject({ level: 'blocked', code: 'na' });
  });

  it('is not a failure when there is simply nothing to say', async () => {
    stubFetch();
    const { lookupRequirement } = await load();
    expect(await lookupRequirement('SG', 'SG', '2026-11-10')).toEqual({ requirement: null, failed: false });
    expect(await lookupRequirement('', 'JP', null)).toEqual({ requirement: null, failed: false });
    expect(await lookupRequirement('SG', '', null)).toEqual({ requirement: null, failed: false });
    // A country the passport's table does not list.
    expect(await lookupRequirement('SG', 'ZZ', null)).toEqual({ requirement: null, failed: false });
  });

  it('reports a passport file that could not be fetched', async () => {
    stubFetch({ passport: false });
    const { lookupRequirement } = await load();
    expect(await lookupRequirement('SG', 'US', '2026-11-10')).toEqual({ requirement: null, failed: true });
  });

  it('reports an authorisations table that could not be fetched', async () => {
    stubFetch({ auths: false });
    const { lookupRequirement } = await load();
    expect(await lookupRequirement('SG', 'JP', null)).toEqual({ requirement: null, failed: true });
  });

  it('reports being offline', async () => {
    stubFetch({ offline: true });
    const { lookupRequirement } = await load();
    expect(await lookupRequirement('SG', 'US', null)).toEqual({ requirement: null, failed: true });
  });

  it('does not remember a failure: the next lookup fetches again', async () => {
    stubFetch({ offline: true });
    const { lookupRequirement } = await load();
    expect((await lookupRequirement('SG', 'US', null)).failed).toBe(true);
    stubFetch();
    expect(await lookupRequirement('SG', 'US', null)).toMatchObject({ failed: false, requirement: { code: 'eta' } });
  });
});

describe('checkRequirement beside it', () => {
  it('keeps its signature: the advisory, or null whether nothing applies or the fetch failed', async () => {
    stubFetch({ passport: false });
    const { checkRequirement } = await load();
    expect(await checkRequirement('SG', 'US', '2026-11-10')).toBeNull();
    expect(await checkRequirement('SG', 'SG', '2026-11-10')).toBeNull();
    vi.resetModules();
    stubFetch();
    const fresh = await load();
    expect(await fresh.checkRequirement('SG', 'ZZ', null)).toBeNull();
    expect(await fresh.checkRequirement('SG', 'JP', null)).toMatchObject({ level: 'ok', code: 'vf', stayDays: 90 });
  });
});
