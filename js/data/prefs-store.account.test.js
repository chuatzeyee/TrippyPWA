// The prefs store and the account: whose copy this is, when the view can be chosen, and what Settings
// can say about the server (blueprint 5.2).
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// The real client module would connect to the project named in .env.local. No test here may reach it.
vi.mock('../lib/supabase.js', () => ({ supabase: null, getUser: () => null, hasLocalSession: () => false }));

const { PREFS_KEY } = await import('./prefs-store.js');
const { DEFAULT_PREFS } = await import('../lib/prefs.js');
const { MON, SUN, OTHER, T0, USER, env, setup, storedCopy } = await import('./prefs-store.test-kit.js');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('adoptUser', () => {
  it('tags an untagged copy and keeps it', () => {
    const { store, storage } = setup({ stored: storedCopy({ values: { view: 'departures', theme: 'dark' }, at: { view: MON }, dirty: ['view'] }) });
    store.initPrefs();
    store.adoptUser(USER);
    expect(storage.json(PREFS_KEY)).toEqual({ v: 1, values: { view: 'departures', theme: 'dark' }, at: { view: MON }, userId: USER, dirty: ['view'] });
    expect(store.getPrefs().view).toBe('departures');
  });
  it('leaves the same user\'s copy alone', () => {
    const copy = { values: { view: 'departures' }, at: { view: MON }, userId: USER, dirty: ['view'] };
    const { store, storage } = setup({ stored: storedCopy(copy) });
    store.initPrefs();
    store.adoptUser(USER);
    expect(storage.json(PREFS_KEY)).toEqual({ v: 1, ...copy });
  });
  it('resets another user\'s copy: defaults, no timestamps, no dirty keys; theme and motion stay, unstamped', async () => {
    const { store, storage, api, server, who } = setup({
      stored: storedCopy({
        values: { view: 'departures', theme: 'light', motion: 'reduce', timeFormat: '24h', viewChooserSeen: true, mapStyle: 'paper' },
        at: { view: MON, theme: MON, timeFormat: SUN, viewChooserSeen: SUN, mapStyle: SUN },
        userId: OTHER,
        dirty: ['view', 'timeFormat'],
      }),
      server: { prefs: {} },
    });
    store.initPrefs();
    const heard = vi.fn();
    store.onPrefsChange(heard);
    who.id = USER;
    store.adoptUser(USER);

    expect(storage.json(PREFS_KEY)).toEqual({ v: 1, values: { theme: 'light', motion: 'reduce' }, at: {}, userId: USER, dirty: [] });
    expect(store.getPrefs()).toEqual({ ...DEFAULT_PREFS, theme: 'light', motion: 'reduce' });
    expect(storage.getItem('trippy-view')).toBe('atlas');
    expect(heard).toHaveBeenCalledWith(store.getPrefs(), ['view', 'viewChooserSeen', 'timeFormat'], { origin: 'local' });

    await store.syncPrefs();
    expect(api.writes()).toEqual([]); // nothing of the other account reaches this one
    expect(server.prefs).toEqual({});
  });
  it('a sync adopts the signed-in user first, so another account\'s choices are never pushed', async () => {
    const { store, api, server } = setup({
      stored: storedCopy({ values: { view: 'departures' }, at: { view: MON }, userId: OTHER, dirty: ['view'] }),
      server: { prefs: {} },
    });
    store.initPrefs();
    await store.syncPrefs();
    expect(api.reads()[0].id).toBe(USER);
    expect(api.writes()).toEqual([]);
    expect(server.prefs).toEqual({});
    expect(store.getPrefs().view).toBe('atlas');
  });
  it('ignores a missing id', () => {
    const { store, storage } = setup({ stored: storedCopy({ values: { view: 'departures' }, userId: OTHER }) });
    store.initPrefs();
    for (const id of [null, undefined, '', 7]) store.adoptUser(id);
    expect(storage.json(PREFS_KEY).userId).toBe(OTHER);
  });
});

describe('prefsReady', () => {
  /** Resolves to how long prefsReady() took, in fake milliseconds. */
  async function settledAfter(store, advance = 0) {
    let done = false;
    const start = Date.now();
    const ready = store.prefsReady().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    if (done) return 0;
    await vi.advanceTimersByTimeAsync(advance);
    await ready;
    return Date.now() - start;
  }

  it('1: resolves at once when the device copy has any timestamp', async () => {
    const { store, api } = setup({ stored: storedCopy({ values: { theme: 'dark' }, at: { theme: MON }, userId: USER }) });
    store.initPrefs();
    expect(await settledAfter(store)).toBe(0);
    expect(api.calls).toEqual([]);
  });
  it('2: resolves at once when there is no session', async () => {
    const { store } = setup({ userId: null, session: false });
    store.initPrefs();
    expect(await settledAfter(store)).toBe(0);
  });
  it('3: resolves at once when the server state is already known', async () => {
    const available = setup();
    available.store.initPrefs();
    await available.store.syncPrefs();
    expect(available.store.remotePrefsState()).toBe('available');
    expect(await settledAfter(available.store)).toBe(0);

    const unavailable = setup({ server: { readError: { code: '42703' } } });
    unavailable.store.initPrefs();
    await unavailable.store.syncPrefs();
    expect(await settledAfter(unavailable.store)).toBe(0);
  });
  it('4a: otherwise waits for the first server read to settle', async () => {
    let open;
    const server = { prefs: env({ view: 'departures' }, { view: MON }), gate: new Promise((resolve) => { open = resolve; }) };
    const { store } = setup({ server });
    store.initPrefs();
    const sync = store.syncPrefs();
    let ready = false;
    const waiting = store.prefsReady().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(120);
    expect(ready).toBe(false);
    open();
    await sync;
    await waiting;
    expect(ready).toBe(true);
    expect(Date.now() - T0).toBe(120);
    expect(store.getPrefs().view).toBe('departures');
  });
  it('4a: a first read that fails settles it too', async () => {
    const { store } = setup({ server: { throws: true } });
    store.initPrefs();
    const waiting = store.prefsReady();
    await store.syncPrefs();
    await waiting;
    expect(Date.now() - T0).toBe(0);
  });
  it('4b: or resolves after 300 ms, whichever comes first', async () => {
    const { store } = setup({ server: { prefs: {}, gate: new Promise(() => {}) } });
    store.initPrefs();
    store.syncPrefs();
    expect(await settledAfter(store, 300)).toBe(300);

    const idle = setup(); // nobody started a sync
    idle.store.initPrefs();
    let ready = false;
    idle.store.prefsReady().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(299);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(true);
  });
  it('waits again for the next account after a user switch', async () => {
    const { store, who } = setup({ stored: storedCopy({ values: { view: 'departures' }, at: { view: MON }, userId: OTHER }) });
    store.initPrefs();
    await store.syncPrefs(); // adopts USER, reads: the state is known for USER
    who.id = 'user-c';
    store.adoptUser('user-c');
    expect(store.remotePrefsState()).toBe('unknown');
    expect(await settledAfter(store, 300)).toBe(300);
  });
});

describe('remotePrefsState and pendingPrefKeys', () => {
  it('tell the three things Settings says under its title', async () => {
    const { store, server } = setup({ server: { prefs: {}, throws: true } });
    store.initPrefs();
    store.setPref('theme', 'dark');
    await store.syncPrefs();
    expect([store.remotePrefsState(), store.pendingPrefKeys()]).toEqual(['unknown', ['theme']]); // syncing when back online
    server.throws = false;
    await store.syncPrefs();
    expect([store.remotePrefsState(), store.pendingPrefKeys()]).toEqual(['available', []]); // saved to the account
    const local = setup({ server: { readError: { code: '42703' } } });
    local.store.initPrefs();
    await local.store.syncPrefs();
    expect(local.store.remotePrefsState()).toBe('unavailable'); // saved on this device
  });
  it('pendingPrefKeys returns a copy', () => {
    const { store } = setup({ userId: null, session: false });
    store.initPrefs();
    store.setPref('theme', 'dark');
    store.pendingPrefKeys().push('view');
    expect(store.pendingPrefKeys()).toEqual(['theme']);
  });
});
