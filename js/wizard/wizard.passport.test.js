// The user's own passport, picked in the trip wizard: the profile write and what it leaves in the
// profile summary on the device. Invented data only. Nothing here touches a network.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fake = vi.hoisted(() => ({ user: { id: 'u1' }, saveError: null, throws: false, writes: [] }));
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => fake.user, setCachedUser() {}, hasLocalSession: () => true }));
vi.mock('../data/profile-repository.js', () => ({
  fetchProfile: async () => ({ data: null, error: null }),
  updateProfile: async (fields) => {
    fake.writes.push(fields);
    if (fake.throws) throw new TypeError('Failed to fetch');
    return { error: fake.saveError };
  },
}));
vi.mock('../lib/logger.js', () => ({ logger: { error() {}, warn() {}, info() {}, debug() {} } }));

const { saveOwnPassport } = await import('./wizard.js');
const { getProfileSummary, saveProfileSummary, clearProfileSummary } = await import('../data/profile-cache.js');

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

const ROW = Object.freeze({
  id: 'u1', display_name: 'Ada Example', home_city: 'Lisbon', home_country: 'Portugal', home_flag: 'pt',
  home_currency: 'EUR', home_currency_symbol: '€', is_nomad: false, nationality: null,
});

beforeEach(() => {
  Object.assign(fake, { user: { id: 'u1' }, saveError: null, throws: false, writes: [] });
  vi.stubGlobal('localStorage', memoryStorage());
  clearProfileSummary();
});

describe('saveOwnPassport', () => {
  it('writes the passport to the profile and into the saved summary, keeping the rest of it', async () => {
    const before = saveProfileSummary('u1', ROW);
    expect(await saveOwnPassport('sg')).toBe(true);
    expect(fake.writes).toEqual([{ nationality: 'sg' }]);
    expect(getProfileSummary()).toEqual({ ...before, nationality: 'sg' });
  });

  it('leaves the summary alone when the profile write is refused or fails', async () => {
    const before = saveProfileSummary('u1', ROW);
    fake.saveError = 'offline';
    expect(await saveOwnPassport('sg')).toBe(false);
    fake.saveError = null;
    fake.throws = true;
    expect(await saveOwnPassport('sg')).toBe(false);
    expect(fake.writes).toHaveLength(2);
    expect(getProfileSummary()).toEqual(before);
  });

  it('makes no summary where none is saved: the next profile fetch saves the whole row', async () => {
    expect(await saveOwnPassport('sg')).toBe(true);
    expect(getProfileSummary()).toBeNull();
  });
});
