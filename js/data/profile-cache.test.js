import { describe, it, expect, beforeEach, vi } from 'vitest';

const fake = vi.hoisted(() => ({ user: { id: 'u1' } }));
vi.mock('../lib/supabase.js', () => ({ getUser: () => fake.user }));

const {
  getProfileSummary, saveProfileSummary, mergeProfileSummary, clearProfileSummary,
  trackProfileFetch, profileSummaryReady, storedSessionUserId,
} = await import('./profile-cache.js');

// An invented profile row, with the columns the app reads plus some the
// summary must not keep.
const ROW = Object.freeze({
  id: 'u1', onboarding_complete: true, role: 'admin', prefs: { view: 'atlas' },
  display_name: 'Ada Example', home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt',
  home_currency: 'EUR', home_currency_symbol: '€', is_nomad: false, nationality: 'pt',
});
const SUMMARY = {
  userId: 'u1', home_flag: 'pt', home_city: 'Lisbon', home_country: 'Portugal',
  home_currency: 'EUR', home_currency_symbol: '€', display_name: 'Ada Example', is_nomad: false, nationality: 'pt',
};
const KEY = 'trippy_profile_cache';

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const brokenStorage = () => ({
  length: 0, key: () => null, getItem: () => null, removeItem() {},
  setItem() { throw new Error('quota'); },
});
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  fake.user = { id: 'u1' };
  vi.stubGlobal('localStorage', memoryStorage());
  clearProfileSummary();
});

describe('saveProfileSummary', () => {
  it('stores exactly the pinned shape, with home_flag at the top level', () => {
    saveProfileSummary('u1', ROW);
    const stored = JSON.parse(localStorage.getItem(KEY));
    expect(Object.keys(stored)).toEqual([
      'userId', 'home_flag', 'home_city', 'home_country', 'home_currency', 'home_currency_symbol',
      'display_name', 'is_nomad', 'nationality',
    ]);
    expect(stored).toEqual(SUMMARY);
    // js/lib/locale.js reads the flag here, before anyone is signed in.
    expect(stored.home_flag).toBe('pt');
  });

  it('returns what it saved and does not change the row it was given', () => {
    expect(saveProfileSummary('u1', ROW)).toEqual(SUMMARY);
    expect(ROW.prefs).toEqual({ view: 'atlas' });
  });

  it('stores null for a field the profile does not have yet, and a true boolean for is_nomad', () => {
    const saved = saveProfileSummary('u1', { display_name: 'New Person', home_flag: '', is_nomad: 1, home_city: 42 });
    expect(saved).toEqual({
      userId: 'u1', home_flag: null, home_city: null, home_country: null, home_currency: null,
      home_currency_symbol: null, display_name: 'New Person', is_nomad: true, nationality: null,
    });
  });

  it('never saves a null: a missing profile or user leaves the saved summary alone', () => {
    saveProfileSummary('u1', ROW);
    for (const nothing of [null, undefined, 'row', 7, [], {}, { onboarded: true, profile: null }]) {
      expect(saveProfileSummary('u1', nothing), JSON.stringify(nothing)).toBeNull();
    }
    expect(saveProfileSummary('', ROW)).toBeNull();
    expect(saveProfileSummary(null, ROW)).toBeNull();
    expect(getProfileSummary()).toEqual(SUMMARY);
  });

  it('does not throw when storage is full or missing', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(() => saveProfileSummary('u1', ROW)).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveProfileSummary('u1', ROW)).not.toThrow();
    expect(getProfileSummary()).toBeNull();
  });
});

describe('mergeProfileSummary', () => {
  it('writes the changed columns into the saved summary and keeps the rest', () => {
    saveProfileSummary('u1', { ...ROW, nationality: null });
    expect(mergeProfileSummary({ nationality: 'sg' })).toEqual({ ...SUMMARY, nationality: 'sg' });
    expect(getProfileSummary()).toEqual({ ...SUMMARY, nationality: 'sg' });
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY)))).toEqual(Object.keys(SUMMARY));
  });

  it('takes an emptied column as empty, and ignores what is not a summary column', () => {
    saveProfileSummary('u1', ROW);
    expect(mergeProfileSummary({ nationality: '', role: 'admin', userId: 'u2' })).toEqual({ ...SUMMARY, nationality: null });
  });

  it('writes nothing without a saved summary: a patch is not a profile row', () => {
    expect(mergeProfileSummary({ nationality: 'sg' })).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('never touches the summary of another user, and leaves the summary alone for a patch with no column', () => {
    saveProfileSummary('u1', ROW);
    for (const nothing of [null, undefined, 'sg', [], {}, { role: 'admin' }]) expect(mergeProfileSummary(nothing), JSON.stringify(nothing)).toEqual(SUMMARY);
    fake.user = { id: 'u2' };
    expect(mergeProfileSummary({ nationality: 'sg' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(SUMMARY);
  });
});

describe('getProfileSummary', () => {
  it('returns the summary saved for the signed-in user', () => {
    saveProfileSummary('u1', ROW);
    expect(getProfileSummary()).toEqual(SUMMARY);
  });

  it('does not return a summary saved for another user', () => {
    saveProfileSummary('u1', ROW);
    fake.user = { id: 'u2' };
    expect(getProfileSummary()).toBeNull();
    fake.user = { id: 'u1' };
    expect(getProfileSummary()).toEqual(SUMMARY);
  });

  it('before the session is restored, goes by the user of the stored session', () => {
    saveProfileSummary('u1', ROW);
    fake.user = null;
    expect(getProfileSummary()).toBeNull();
    localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ user: { id: 'u1' } }));
    expect(storedSessionUserId()).toBe('u1');
    expect(getProfileSummary()).toEqual(SUMMARY);
    localStorage.setItem('sb-abcdefgh-auth-token', JSON.stringify({ user: { id: 'u2' } }));
    expect(getProfileSummary()).toBeNull();
    localStorage.setItem('sb-abcdefgh-auth-token', '{broken');
    expect(storedSessionUserId()).toBeNull();
    expect(getProfileSummary()).toBeNull();
  });

  it('is null for nothing saved, corrupt JSON and values that are not a summary', () => {
    expect(getProfileSummary()).toBeNull();
    for (const bad of ['{"userId":"u1"', 'null', '[]', '"u1"', '{"home_flag":"pt"}']) {
      localStorage.setItem(KEY, bad);
      expect(getProfileSummary(), bad).toBeNull();
    }
  });

  it('gives a new object each time', () => {
    saveProfileSummary('u1', ROW);
    const first = getProfileSummary();
    first.home_city = 'Changed';
    expect(getProfileSummary().home_city).toBe('Lisbon');
  });
});

describe('clearProfileSummary', () => {
  it('removes the saved summary', () => {
    saveProfileSummary('u1', ROW);
    clearProfileSummary();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(getProfileSummary()).toBeNull();
  });

  it('forgets the tracked fetch, so the next user never waits on the last one', async () => {
    trackProfileFetch(Promise.resolve(ROW));
    clearProfileSummary();
    expect(await profileSummaryReady()).toBeNull();
  });
});

describe('profileSummaryReady', () => {
  it('resolves from the cache without waiting for a fetch', async () => {
    saveProfileSummary('u1', ROW);
    trackProfileFetch(new Promise(() => {})); // never settles
    expect(await profileSummaryReady()).toEqual(SUMMARY);
  });

  it('else waits for the tracked fetch and resolves with what it saved', async () => {
    const fetch = deferred();
    trackProfileFetch(fetch.promise);
    let result = 'pending';
    const ready = profileSummaryReady().then((value) => { result = value; });
    await Promise.resolve();
    expect(result).toBe('pending');
    saveProfileSummary('u1', ROW); // what the hydration does before it resolves
    fetch.resolve(undefined);
    await ready;
    expect(result).toEqual(SUMMARY);
  });

  it('resolves from the fetched row itself when the summary could not be stored', async () => {
    vi.stubGlobal('localStorage', brokenStorage());
    trackProfileFetch(Promise.resolve(ROW));
    expect(await profileSummaryReady()).toEqual(SUMMARY);
    trackProfileFetch(Promise.resolve({ onboarded: true, profile: ROW }));
    expect(await profileSummaryReady()).toEqual(SUMMARY);
  });

  it('never resolves with null fields from a memoised check: no row means null', async () => {
    for (const memo of [{ onboarded: true, profile: null }, null, undefined, {}, 'ok', true]) {
      trackProfileFetch(Promise.resolve(memo));
      expect(await profileSummaryReady(), JSON.stringify(memo)).toBeNull();
    }
  });

  it('is null when nothing is cached and no fetch is tracked, or the fetch failed', async () => {
    expect(await profileSummaryReady()).toBeNull();
    trackProfileFetch(Promise.reject(new Error('offline')));
    expect(await profileSummaryReady()).toBeNull();
  });

  it('follows the newest tracked fetch', async () => {
    vi.stubGlobal('localStorage', brokenStorage());
    const first = deferred();
    trackProfileFetch(first.promise);
    const ready = profileSummaryReady();
    trackProfileFetch(Promise.resolve({ ...ROW, home_city: 'Porto' }));
    first.resolve(ROW);
    expect((await ready).home_city).toBe('Porto');
  });

  it("does not hand one user's fetched row to another", async () => {
    vi.stubGlobal('localStorage', brokenStorage());
    const fetch = deferred();
    trackProfileFetch(fetch.promise);
    const ready = profileSummaryReady();
    fake.user = { id: 'u2' };
    fetch.resolve(ROW);
    expect(await ready).toBeNull();
  });

  it('returns the promise it was given, so the caller can keep chaining', () => {
    const promise = Promise.resolve(ROW);
    expect(trackProfileFetch(promise)).toBe(promise);
  });
});
