// The prefs store on this device: start, reads, local changes and subscribers (blueprint 5.2).
// Sync is in prefs-store.sync.test.js; accounts and readiness in prefs-store.account.test.js.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// The real client module would connect to the project named in .env.local. No test here may reach it.
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false }));

const { createPrefsStore, PREFS_KEY, MIRROR_KEYS } = await import('./prefs-store.js');
const { DEFAULT_PREFS } = await import('../lib/prefs.js');
const { MON, SUN, T0, USER, env, memoryStorage, setup, storedCopy } = await import('./prefs-store.test-kit.js');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('initPrefs', () => {
  it('is synchronous, gives the defaults on a fresh device and applies them', () => {
    const { store, applied, storage } = setup();
    const result = store.initPrefs();
    expect(result).not.toBeInstanceOf(Promise);
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
    expect(applied).toHaveLength(1);
    expect(applied[0].prefs).toEqual(DEFAULT_PREFS);
    expect(applied[0].changedKeys.sort()).toEqual(Object.keys(DEFAULT_PREFS).sort());
    expect(storage.getItem(MIRROR_KEYS.theme)).toBeNull();
  });
  it('reads and validates the device copy', () => {
    const { store } = setup({ stored: storedCopy({ values: { view: 'departures', theme: 'sepia', timeFormat: '24h', mapStyle: 'paper' }, at: { view: MON } }) });
    store.initPrefs();
    expect(store.getPrefs()).toEqual({ ...DEFAULT_PREFS, view: 'departures', timeFormat: '24h' });
  });
  it('makes no request', () => {
    const { store, api } = setup();
    store.initPrefs();
    vi.advanceTimersByTime(5000);
    expect(api.calls).toEqual([]);
  });
  it('turns a legacy trippy-theme into an unstamped theme and keeps the key for the boot script', () => {
    const { store, storage } = setup({ stored: { 'trippy-theme': 'light' } });
    store.initPrefs();
    expect(store.getPrefs().theme).toBe('light');
    expect(storage.json(PREFS_KEY)).toMatchObject({ v: 1, values: { theme: 'light' }, at: {}, userId: null, dirty: [] });
    expect(storage.getItem('trippy-theme')).toBe('light');
  });
  it('with theme system the trippy-theme key is absent, so the boot script keeps following the OS', () => {
    const { store, storage } = setup({ stored: { ...storedCopy({ values: { theme: 'system' } }), 'trippy-theme': 'dark' } });
    store.initPrefs();
    expect(storage.getItem('trippy-theme')).toBeNull();
    const fresh = setup();
    fresh.store.initPrefs();
    expect(fresh.storage.map.has('trippy-theme')).toBe(false);
  });
  it.each([
    ['text that is not JSON', '{oops'], ['a JSON string', '"atlas"'], ['an array', '[1,2]'], ['null', 'null'],
    ['a copy with broken parts', '{"v":"x","values":7,"at":[],"userId":5,"dirty":"view"}'],
  ])('never throws on %s and falls back to the defaults', (_name, text) => {
    const { store } = setup({ stored: { [PREFS_KEY]: text } });
    expect(() => store.initPrefs()).not.toThrow();
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
  });
  it('never throws when storage throws on every call, and still applies and takes a change', () => {
    const blocked = () => { throw new DOMException('denied', 'SecurityError'); };
    const applied = [];
    const store = createPrefsStore({
      storage: { getItem: blocked, setItem: blocked, removeItem: blocked },
      client: null, getUserId: () => null, hasSession: () => false, apply: (prefs) => applied.push(prefs),
    });
    expect(() => store.initPrefs()).not.toThrow();
    expect(applied).toHaveLength(1);
    expect(store.setPref('theme', 'dark')).toEqual({ ok: true, errors: [] });
    expect(store.getPrefs().theme).toBe('dark');
  });
  it('never throws with no storage at all (Node, or a browser that withholds it)', () => {
    const store = createPrefsStore({ client: null, getUserId: () => null, hasSession: () => false, apply: () => {} });
    expect(() => store.initPrefs()).not.toThrow();
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
    store.setPref('motion', 'reduce');
    expect(store.getPrefs().motion).toBe('reduce');
  });
  it('never throws when applying throws', () => {
    const store = createPrefsStore({ storage: memoryStorage(), client: null, getUserId: () => null, hasSession: () => false, apply: () => { throw new Error('no document'); } });
    expect(() => store.initPrefs()).not.toThrow();
    expect(() => store.setPref('theme', 'light')).not.toThrow();
  });
  it('by default applies theme, motion, the language, the view attribute and the display formatters', async () => {
    const attrs = {};
    vi.stubGlobal('document', {
      documentElement: { getAttribute: (name) => attrs[name] ?? null, setAttribute: (name, value) => { attrs[name] = String(value); }, removeAttribute: (name) => { delete attrs[name]; } },
      querySelector: () => null,
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: () => {} }), dispatchEvent: () => true });
    const { formatClock, formatTemp, setDisplayPrefs } = await import('../lib/locale.js');
    const storage = memoryStorage(storedCopy({ values: { theme: 'light', motion: 'reduce', view: 'concierge', timeFormat: '24h', temperatureUnit: 'F', language: 'fi' } }));
    const store = createPrefsStore({ storage, client: null, getUserId: () => null, hasSession: () => false });
    store.initPrefs();
    expect(attrs).toEqual({ 'data-theme': 'light', 'data-motion': 'reduce', 'data-view-pref': 'concierge', lang: 'fi' });
    expect(formatClock('6:10 PM')).toBe('18:10');
    expect(formatTemp(23)).toBe('73°F');
    store.setPrefs({ timeFormat: '12h', temperatureUnit: 'C', motion: 'system', theme: 'dark' });
    expect(attrs).toEqual({ 'data-theme': 'dark', 'data-view-pref': 'concierge', lang: 'fi' });
    expect(formatClock('18:10')).toBe('6:10 PM');
    expect(formatTemp(23)).toBe('23°C');
    setDisplayPrefs({ timeFormat: '12h', temperatureUnit: 'C' });
  });
});

describe('getPrefs', () => {
  it('returns a frozen copy and works before initPrefs', () => {
    const { store, applied } = setup({ stored: storedCopy({ values: { view: 'concierge' } }) });
    const prefs = store.getPrefs();
    expect(prefs.view).toBe('concierge');
    expect(Object.isFrozen(prefs)).toBe(true);
    expect(applied).toEqual([]);
  });
});

describe('setPref and setPrefs', () => {
  it('validates, stamps, writes the device copy, applies and notifies, in that order and before any request', async () => {
    const { store, storage, api, applied, log } = setup();
    store.initPrefs();
    log.length = 0;
    applied.length = 0;
    store.onPrefsChange(() => log.push('notified'));
    expect(store.setPref('timeFormat', '24h')).toEqual({ ok: true, errors: [] });

    expect(storage.json(PREFS_KEY)).toEqual({ v: 1, values: { timeFormat: '24h' }, at: { timeFormat: new Date(T0).toISOString() }, userId: null, dirty: ['timeFormat'] });
    expect(applied).toEqual([{ prefs: { ...DEFAULT_PREFS, timeFormat: '24h' }, changedKeys: ['timeFormat'] }]);
    expect(log[0]).toBe(`local:set:${PREFS_KEY}`);
    expect(log).toContain('notified');
    expect(api.calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(800);
    expect(log.indexOf(`local:set:${PREFS_KEY}`)).toBeLessThan(log.indexOf('remote:read'));
    expect(log.indexOf('notified')).toBeLessThan(log.indexOf('remote:read'));
    expect(log.filter((entry) => entry.startsWith('remote:'))).toEqual(['remote:read', 'remote:write']);
  });
  it('a burst of changes is one round trip, 800 ms after the last one', async () => {
    const { store, api, server } = setup();
    store.initPrefs();
    store.setPref('timeFormat', '24h');
    await vi.advanceTimersByTimeAsync(500);
    store.setPref('temperatureUnit', 'F');
    await vi.advanceTimersByTimeAsync(500);
    store.setPref('showVenuePhotos', false);
    await vi.advanceTimersByTimeAsync(799);
    expect(api.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.reads()).toHaveLength(1);
    expect(api.writes()).toHaveLength(1);
    expect(server.prefs.values).toEqual({ timeFormat: '24h', temperatureUnit: 'F', showVenuePhotos: false });
  });
  it('refuses an unknown key or a bad value: nothing is written, applied or sent', async () => {
    const { store, storage, api, applied } = setup();
    store.initPrefs();
    applied.length = 0;
    expect(store.setPref('view', 'stub')).toEqual({ ok: false, errors: ['Invalid value for "view"'] });
    expect(store.setPrefs({ mapStyle: 'paper', theme: 'dark' }).ok).toBe(false);
    expect(store.setPrefs(null).ok).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
    expect(storage.map.has(PREFS_KEY)).toBe(false);
    expect(applied).toEqual([]);
    expect(api.calls).toEqual([]);
  });
  it('writes the three mirror keys', () => {
    const { store, storage } = setup();
    store.initPrefs();
    expect(storage.getItem('trippy-view')).toBe('atlas');
    expect(storage.map.has('trippy-theme')).toBe(false);
    expect(storage.map.has('trippy-motion')).toBe(false);

    store.setPrefs({ view: 'departures', theme: 'dark', motion: 'reduce' });
    expect(storage.getItem(MIRROR_KEYS.view)).toBe('departures');
    expect(storage.getItem(MIRROR_KEYS.theme)).toBe('dark');
    expect(storage.getItem(MIRROR_KEYS.motion)).toBe('reduce');
    expect(MIRROR_KEYS).toEqual({ theme: 'trippy-theme', view: 'trippy-view', motion: 'trippy-motion' });

    store.setPrefs({ theme: 'light' });
    expect(storage.getItem('trippy-theme')).toBe('light');
    store.setPrefs({ theme: 'system', motion: 'system' });
    expect(storage.map.has('trippy-theme')).toBe(false);
    expect(storage.map.has('trippy-motion')).toBe(false);
    expect(storage.getItem('trippy-view')).toBe('departures');
  });
  it('choosing the value that is already there is stamped and synced, but nobody is told', async () => {
    const { store, storage, server } = setup();
    store.initPrefs();
    const heard = vi.fn();
    store.onPrefsChange(heard);
    store.setPref('view', 'atlas');
    expect(heard).not.toHaveBeenCalled();
    expect(storage.json(PREFS_KEY).at.view).toBe(new Date(T0).toISOString());
    await vi.advanceTimersByTimeAsync(800);
    expect(server.prefs.at.view).toBe(new Date(T0).toISOString());
  });
  it('dismissing the chooser stamps that key only', () => {
    const { store, storage } = setup();
    store.initPrefs();
    store.setPref('viewChooserSeen', true);
    expect(Object.keys(storage.json(PREFS_KEY).at)).toEqual(['viewChooserSeen']);
  });
  it('keeps keys this build does not know, with their timestamps', async () => {
    const { store, storage, server } = setup({
      stored: storedCopy({ values: { mapStyle: 'paper' }, at: { mapStyle: SUN }, userId: USER }),
      server: { prefs: env({ density: 'cosy' }, { density: MON }) },
    });
    store.initPrefs();
    store.setPref('theme', 'dark');
    expect(storage.json(PREFS_KEY).values).toEqual({ mapStyle: 'paper', theme: 'dark' });
    await vi.advanceTimersByTimeAsync(800);
    expect(server.prefs.values).toEqual({ density: 'cosy', mapStyle: 'paper', theme: 'dark' });
    expect(server.prefs.at).toMatchObject({ density: MON, mapStyle: SUN });
    expect(storage.json(PREFS_KEY).values).toEqual({ mapStyle: 'paper', theme: 'dark', density: 'cosy' });
  });
});

describe('onPrefsChange', () => {
  it('gives the prefs, the changed keys and the origin for a local change', () => {
    const { store } = setup();
    store.initPrefs();
    const heard = vi.fn();
    store.onPrefsChange(heard);
    store.setPrefs({ view: 'concierge', timeFormat: '24h', theme: 'system' });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith({ ...DEFAULT_PREFS, view: 'concierge', timeFormat: '24h' }, ['view', 'timeFormat'], { origin: 'local' });
  });
  it('gives origin remote for what a sync brought, after it was applied', async () => {
    const { store, applied, storage } = setup({ server: { prefs: env({ view: 'departures', temperatureUnit: 'F' }, { view: MON, temperatureUnit: MON }) } });
    store.initPrefs();
    applied.length = 0;
    const heard = vi.fn(() => expect(applied).toHaveLength(1));
    store.onPrefsChange(heard);
    await store.syncPrefs();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith({ ...DEFAULT_PREFS, view: 'departures', temperatureUnit: 'F' }, ['view', 'temperatureUnit'], { origin: 'remote' });
    expect(applied[0].changedKeys).toEqual(['view', 'temperatureUnit']);
    expect(storage.getItem('trippy-view')).toBe('departures');
  });
  it('is silent when a sync changes nothing here', async () => {
    const { store } = setup({ server: { prefs: env({ view: 'atlas', mapStyle: 'paper' }, { view: MON, mapStyle: MON }) } });
    store.initPrefs();
    const heard = vi.fn();
    store.onPrefsChange(heard);
    await store.syncPrefs();
    expect(heard).not.toHaveBeenCalled();
  });
  it('returns a function that unsubscribes, and one failing subscriber does not stop the others', () => {
    const { store } = setup();
    store.initPrefs();
    const first = vi.fn(() => { throw new Error('listener bug'); });
    const second = vi.fn();
    const stopFirst = store.onPrefsChange(first);
    store.onPrefsChange(second);
    expect(() => store.setPref('theme', 'dark')).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    store.setPref('theme', 'light');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe('the module exports', () => {
  it('are the store of the app: the names of blueprint 1.2', async () => {
    const mod = await import('./prefs-store.js');
    for (const name of ['initPrefs', 'getPrefs', 'setPref', 'setPrefs', 'onPrefsChange', 'syncPrefs', 'prefsReady', 'adoptUser', 'remotePrefsState', 'pendingPrefKeys']) {
      expect(typeof mod[name]).toBe('function');
    }
    expect(mod.getPrefs()).toEqual(DEFAULT_PREFS);
    expect(mod.remotePrefsState()).toBe('unknown');
    await expect(mod.syncPrefs()).resolves.toBe('signed-out'); // the mocked module has no user and no client
    await expect(mod.prefsReady()).resolves.toBeUndefined();
  });
});
