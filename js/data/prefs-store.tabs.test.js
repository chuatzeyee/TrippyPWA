// Two tabs or windows on one device: each has its own store in memory and both write the same
// localStorage. A write from one must never put back what the other has changed since.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// The real client module would connect to the project named in .env.local. No test here may reach it.
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false }));

const { createPrefsStore, PREFS_KEY, MIRROR_KEYS } = await import('./prefs-store.js');
const { DEFAULT_PREFS } = await import('../lib/prefs.js');
const { T0, USER, OTHER, env, fakeClient, memoryStorage, storedCopy } = await import('./prefs-store.test-kit.js');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** One tab: a store of its own on the shared storage. `fire()` is the browser's storage event. */
function tab(storage, { client = null, userId = null } = {}) {
  const listeners = [];
  const heard = [];
  const store = createPrefsStore({
    storage, client, getUserId: () => userId, hasSession: () => Boolean(userId), apply: () => {},
    onStorageChange: (listener) => { listeners.push(listener); },
  });
  store.initPrefs();
  store.onPrefsChange((prefs, keys, { origin }) => heard.push([keys.slice().sort(), origin]));
  return { store, heard, fire: () => listeners.forEach((listener) => listener()) };
}
const later = (ms) => vi.setSystemTime(Date.now() + ms);
const iso = (ms) => new Date(ms).toISOString();

describe('a change in one tab and then a change in another', () => {
  it('keeps both: the second tab writes its change on top of what the first stored', () => {
    const storage = memoryStorage();
    const first = tab(storage);
    const second = tab(storage);
    first.store.setPref('view', 'departures');
    later(5000);
    second.store.setPref('theme', 'dark');

    expect(storage.json(PREFS_KEY)).toMatchObject({ values: { view: 'departures', theme: 'dark' }, at: { view: iso(T0), theme: iso(T0 + 5000) } });
    expect(storage.getItem(MIRROR_KEYS.view)).toBe('departures');
    expect(storage.getItem(MIRROR_KEYS.theme)).toBe('dark');
    // The tab that wrote last also shows what the other one chose, and says where each change came from.
    expect(second.store.getPrefs()).toEqual({ ...DEFAULT_PREFS, view: 'departures', theme: 'dark' });
    expect(second.heard).toEqual([[['view'], 'remote'], [['theme'], 'local']]);
    expect(second.store.pendingPrefKeys().sort()).toEqual(['theme', 'view']);
    // A third start on this device reads both.
    expect(tab(storage).store.getPrefs()).toMatchObject({ view: 'departures', theme: 'dark' });
  });
  it('on the same key the later choice stands, whichever tab made it', () => {
    const storage = memoryStorage();
    const first = tab(storage);
    const second = tab(storage);
    first.store.setPref('view', 'departures');
    later(1000);
    second.store.setPref('view', 'concierge');
    later(1000);
    first.store.setPref('timeFormat', '24h');
    expect(storage.json(PREFS_KEY).values).toEqual({ view: 'concierge', timeFormat: '24h' });
    expect(first.store.getPrefs().view).toBe('concierge');
  });
  it('takes nothing from a copy that belongs to another account, or from a copy that is gone or broken', () => {
    const storage = memoryStorage(storedCopy({ userId: USER }));
    const mine = tab(storage, { userId: USER });
    storage.map.set(PREFS_KEY, JSON.stringify({ v: 1, values: { view: 'departures' }, at: { view: iso(T0) }, userId: OTHER, dirty: [] }));
    later(1000);
    mine.store.setPref('theme', 'dark');
    expect(storage.json(PREFS_KEY)).toMatchObject({ userId: USER, values: { theme: 'dark' } });
    expect(mine.store.getPrefs().view).toBe(DEFAULT_PREFS.view);
    for (const gone of [null, '{oops', '[1]']) {
      if (gone === null) storage.map.delete(PREFS_KEY); else storage.map.set(PREFS_KEY, gone);
      expect(() => mine.store.setPref('timeFormat', '24h')).not.toThrow();
      expect(storage.json(PREFS_KEY)).toMatchObject({ userId: USER, values: { theme: 'dark', timeFormat: '24h' } });
    }
  });
});

describe('the storage event', () => {
  it('brings the other tab\'s change here at once, as a change from elsewhere, and writes nothing back when there is no news', () => {
    const storage = memoryStorage();
    const first = tab(storage);
    const second = tab(storage);
    first.store.setPref('view', 'departures');
    second.fire();
    expect(second.store.getPrefs().view).toBe('departures');
    expect(second.heard).toEqual([[['view'], 'remote']]);
    const text = storage.getItem(PREFS_KEY);
    const writes = () => storage.map.get(PREFS_KEY) === text;
    first.fire(); // the echo of the second tab's own write
    second.fire();
    expect(writes()).toBe(true);
    expect(first.heard).toEqual([[['view'], 'local']]);
    expect(second.heard).toHaveLength(1);
  });
  it('a key the other tab has stored in the account is no longer pending here', async () => {
    const storage = memoryStorage(storedCopy({ userId: USER }));
    const server = { prefs: env() };
    const first = tab(storage, { client: fakeClient(server), userId: USER });
    const second = tab(storage, { client: fakeClient(server), userId: USER });
    first.store.setPref('view', 'departures');
    second.fire();
    expect(second.store.pendingPrefKeys()).toEqual(['view']);
    await vi.advanceTimersByTimeAsync(1000); // the first tab's sync
    expect(server.prefs.values.view).toBe('departures');
    second.fire();
    expect(second.store.pendingPrefKeys()).toEqual([]);
  });
});

describe('a sync in one tab after a change in another', () => {
  it('does not put the old value back on the device while the other tab has not synced yet', async () => {
    const storage = memoryStorage(storedCopy({ userId: USER }));
    const server = { prefs: env({ timeFormat: '24h' }, { timeFormat: iso(T0 - 1000) }) };
    const first = tab(storage, { client: fakeClient(server), userId: USER });
    const second = tab(storage, { client: fakeClient(server), userId: USER });
    first.store.setPref('view', 'departures');
    await expect(second.store.syncPrefs()).resolves.toBe('synced');
    expect(storage.json(PREFS_KEY).values).toEqual({ view: 'departures', timeFormat: '24h' });
    expect(storage.getItem(MIRROR_KEYS.view)).toBe('departures');
    expect(server.prefs.values).toEqual({ view: 'departures', timeFormat: '24h' });
  });
});
